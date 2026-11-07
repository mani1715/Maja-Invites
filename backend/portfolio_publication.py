"""Opt-in portfolio publication. PostgreSQL row locks serialize owner revisions.

Drafts never enter the legacy public collections. Publishing commits the immutable
version, public projection and pointer together; existing links keep their IDs.
"""
import copy
import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field


class DraftRequest(BaseModel):
    revision: int = Field(ge=0)
    document: dict


class RevisionRequest(BaseModel):
    revision: int = Field(ge=0)


def decode(value):
    return json.loads(value) if isinstance(value, str) else value


async def prepared(db):
    for table in ('portfolio_publications', 'portfolio_versions', 'portfolio_profiles',
                  'portfolio_works', 'portfolio_albums', 'portfolio_testimonials', 'portfolio_media', 'admins', 'uploaded_media'):
        await db.ensure_table(table)


async def managed(db, sid):
    return await db.portfolio_publications.find_one({'id': sid}, {'_id': 0})


async def guard_legacy_write(db, sid):
    if await managed(db, sid):
        raise HTTPException(409, 'This portfolio uses private drafts. Edit and publish in the portfolio workspace.')


async def validate(db, sid, document):
    from portfolio_service import (ProfileIn, WorkIn, AlbumIn, TestimonialIn,
                                   PORTFOLIO_DESIGN_TIERS, _portfolio_tier)
    if len(json.dumps(document)) > 2_000_000:
        raise HTTPException(413, 'Portfolio content exceeds 2 MB. Reduce text or image URL lists.')
    from portfolio_media import validate_media
    await validate_media(db, sid, document)
    tier = await _portfolio_tier(db, sid)
    design = document.get('design_id', 'free_studio_neutral')
    required = PORTFOLIO_DESIGN_TIERS.get(design)
    if required is None or {'normal': 0, 'basic': 1, 'premium': 2}[tier] < {'normal': 0, 'basic': 1, 'premium': 2}[required]:
        raise HTTPException(403, 'This design is not included in your current portfolio entitlement.')
    try:
        profile = ProfileIn.model_validate(document.get('profile', {})).model_dump(exclude_unset=True)
        source = document.get('profile', {})
        for key in ('hero_alt', 'presentation', 'team_members', 'statistics', 'featured_categories', 'why_choose_us', 'booking_process', 'special_feature'):
            if key in source:
                profile[key] = source[key]
        if tier != 'premium' and profile.get('team_members'):
            # Preserve existing data after expiry, but do not permit new team edits.
            old = await managed(db, sid)
            if profile['team_members'] != (old or {}).get('draft', {}).get('profile', {}).get('team_members'):
                raise HTTPException(403, 'Team editing requires the existing premium entitlement.')
        for key in ('faqs', 'pricing_packages', 'studio_photos', 'past_works', 'team_members', 'before_after'):
            if key in profile and (not isinstance(profile[key], list) or any(not isinstance(row, dict) for row in profile[key])):
                raise ValueError(f'{key} must be a list of objects')
        for key in ('featured_categories', 'why_choose_us', 'booking_process'):
            if key in profile and (not isinstance(profile[key], list) or any(not isinstance(v, str) for v in profile[key])):
                raise ValueError(f'{key} must be a list of text values')
        for key in ('statistics', 'special_feature'):
            if key in profile and not isinstance(profile[key], dict):
                raise ValueError(f'{key} must be an object')
        if 'hero_alt' in profile and not isinstance(profile['hero_alt'], str):
            raise ValueError('Hero description must be text')
        text_fields = {
            'faqs': ('q', 'a'), 'studio_photos': ('image', 'caption'),
            'past_works': ('image', 'title', 'caption'),
            'team_members': ('name', 'role', 'portfolio_link'),
            'before_after': ('before', 'after', 'label'),
            'pricing_packages': ('name', 'title', 'description', 'unit'),
        }
        for key, fields in text_fields.items():
            for row in profile.get(key, []):
                if any(row.get(field) is not None and not isinstance(row[field], str) for field in fields):
                    raise ValueError(f'{key} contains a non-text display field')
        if len(profile.get('team_members', [])) > 30 or len(profile.get('faqs', [])) > 15 or len(profile.get('studio_photos', [])) > 12 or len(profile.get('past_works', [])) > 5:
            raise ValueError('An optional section exceeds its existing content limit')
        for key in ('services', 'styles', 'equipment', 'awards', 'languages', 'coverage_areas', 'skills', 'certifications', 'camera_gear', 'lens_gear', 'drone_gear', 'editing_software', 'featured_categories', 'why_choose_us', 'booking_process'):
            if key in profile:
                profile[key] = [v.strip() for v in profile[key] if v.strip()]
        for key, required_field in (('faqs', 'q'), ('studio_photos', 'image'), ('past_works', 'image'), ('team_members', 'name')):
            if key in profile:
                profile[key] = [r for r in profile[key] if r.get(required_field)]
        if 'pricing_packages' in profile:
            profile['pricing_packages'] = [r for r in profile['pricing_packages'] if r.get('name') or r.get('title')]
        prefs = profile.get('presentation') or {}
        if not isinstance(prefs, dict):
            raise ValueError('Layout preferences must be an object')
        if not isinstance(prefs.get('featured_ids', []), list) or any(not isinstance(x, str) for x in prefs.get('featured_ids', [])):
            raise ValueError('Featured projects must be a list of IDs')
        video_id = prefs.get('hero_video_work_id', '')
        if not isinstance(video_id, str) or (video_id and not any(w.get('id') == video_id and w.get('video_url') for w in document.get('works', []))):
            raise ValueError('Opening film must reference a video in this portfolio')
        focal = prefs.get('hero_focal', {})
        if not isinstance(focal, dict):
            raise ValueError('Focal position must be an object')
        if any(not isinstance(focal.get(k, 50), (int, float)) or not 0 <= focal.get(k, 50) <= 100 for k in ('x', 'y')):
            raise ValueError('Focal position must be between 0 and 100')
        profile.pop('is_published', None)
        result = {'profile': profile, 'design_id': design, 'renderer_version': 3}
        for key, model, cap in [('works', WorkIn, 500), ('albums', AlbumIn, 200), ('testimonials', TestimonialIn, 200)]:
            rows = document.get(key, [])
            if not isinstance(rows, list) or len(rows) > cap:
                raise ValueError(f'Too many {key}')
            cleaned = []
            for row in rows:
                item = model.model_validate(row).model_dump()
                ident = row.get('id') or f'pf_{uuid.uuid4().hex}'
                # Existing IDs may only be edited by their owner.
                existing = await getattr(db, 'portfolio_' + key).find_one({'id': ident})
                if existing and existing.get('studio_id') != sid:
                    raise HTTPException(403, 'Content belongs to another studio')
                item.update(id=ident, studio_id=sid)
                if (existing or {}).get('is_placeholder') or row.get('is_placeholder'):
                    item['is_placeholder'] = True
                if key == 'works':
                    if row.get('alt') is not None and not isinstance(row['alt'], str):
                        raise ValueError('Image descriptions must be text')
                    metadata = row.get('gallery_metadata', {})
                    if not isinstance(metadata, dict) or any(not isinstance(value, dict) or any(not isinstance(v, str) for v in value.values()) for value in metadata.values()):
                        raise ValueError('Gallery captions and descriptions must be text')
                    for field in ('alt', 'gallery_metadata'):
                        if field in row:
                            item[field] = row[field]
                    # Never trust submitted storage size.
                    item['size_bytes'] = (existing or {}).get('size_bytes', 0)
                cleaned.append(item)
            if len({x['id'] for x in cleaned}) != len(cleaned):
                raise ValueError('Duplicate content IDs')
            result[key] = cleaned
        album_ids = {a['id'] for a in result['albums']}
        if any(w.get('album_id') and w['album_id'] not in album_ids for w in result['works']):
            raise ValueError('A work refers to an absent album')
        if any(i not in {w['id'] for w in result['works']} for i in prefs.get('featured_ids', [])):
            raise ValueError('A featured project no longer exists')
        stored = await managed(db, sid)
        for key in ('packages', 'highlights'):
            result[key] = copy.deepcopy((stored or {}).get('draft', {}).get(key, []))
        return result
    except (ValueError, TypeError) as exc:
        raise HTTPException(422, str(exc)) from exc


async def view(db, sid, document):
    from portfolio_service import _portfolio_tier, _portfolio_sections
    from white_label_service import get_white_label
    result = copy.deepcopy(document)
    profile = result.get('profile', {})
    branding = await get_white_label(db, sid)
    result.update(studio={'id': sid, 'name': (branding.get('brand_name') if branding.get('entitled') else None) or profile.get('studio_name', '')},
                  tier=await _portfolio_tier(db, sid), sections=await _portfolio_sections(db, sid),
                  white_label=branding)
    return result


def build_publication_router(db, require_admin):
    router = APIRouter(tags=['portfolio-publication'])
    from portfolio_media import build_media_router
    router.include_router(build_media_router(db, require_admin))

    async def response(sid, state):
        return {**state, 'draft': await view(db, sid, state['draft']),
                'public_path': f"/photographer/{state.get('slug') or sid}"}

    @router.post('/api/portfolio/workspace')
    async def initialize(admin=Depends(require_admin)):
        from portfolio_service import _ensure_slug
        sid = admin['admin_id']
        await prepared(db)
        current = await managed(db, sid)
        if current:
            return await response(sid, current)
        raw = await db.portfolio_profiles.find_one({'id': sid}, {'_id': 0})
        slug = await _ensure_slug(db, sid, raw)
        if raw is None:
            await db.portfolio_profiles.update_one({'id': sid}, {'$set': {'is_published': False}})
        document = {'profile': copy.deepcopy(raw or {}), 'design_id': (raw or {}).get('design_id') or 'free_studio_neutral'}
        for key in ('works', 'albums', 'testimonials'):
            document[key] = await getattr(db, 'portfolio_' + key).find({'studio_id': sid}, {'_id': 0}).to_list(500)
        if not document['profile'].get('studio_name'):
            account = await db.admins.find_one({'id': sid}) or {}
            document['profile']['studio_name'] = account.get('name', '')
        document['packages'] = await db.pixora_packages.find({'studio_id': sid}, {'_id': 0}).to_list(200)
        document['highlights'] = await db.pixora_highlights.find({'studio_id': sid}, {'_id': 0}).to_list(100)
        baseline = copy.deepcopy(document)
        baseline['renderer_version'] = 1
        document['renderer_version'] = 3
        state = {'id': sid, 'slug': slug, 'revision': 0, 'draft': document,
                 'published_version': None, 'legacy_visible': bool(raw), 'legacy_bytes': sum(max(0, int(w.get('size_bytes') or 0)) for w in document['works']), 'history': []}
        # No public change on initialization. The old route still renders V1.
        if raw:
            state['history'] = [{'id': 'legacy', 'label': 'Original portfolio', 'at': datetime.now(timezone.utc).isoformat()}]
        async with db.pool.acquire() as conn:
            async with conn.transaction():
                inserted = await conn.fetchval("INSERT INTO portfolio_publications(id,data) VALUES($1,$2::jsonb) ON CONFLICT DO NOTHING RETURNING id", sid, json.dumps(state))
                if inserted and raw:
                    await conn.execute('INSERT INTO portfolio_versions(id,data) VALUES($1,$2::jsonb)', f'{sid}:legacy', json.dumps({'studio_id': sid, 'document': baseline}))
        return await response(sid, await managed(db, sid))

    @router.put('/api/portfolio/workspace')
    async def save(payload: DraftRequest, admin=Depends(require_admin)):
        sid = admin['admin_id']
        document = await validate(db, sid, payload.document)
        await prepared(db)
        async with db.pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchval('SELECT data FROM portfolio_publications WHERE id=$1 FOR UPDATE', sid)
                if not row:
                    raise HTTPException(409, 'Open the workspace first')
                state = decode(row)
                if state['revision'] != payload.revision:
                    raise HTTPException(409, 'Another session changed this draft. Reload before saving.')
                state.update(draft=document, revision=state['revision'] + 1)
                await conn.execute('UPDATE portfolio_publications SET data=$2::jsonb,updated_at=now() WHERE id=$1', sid, json.dumps(state))
        return await response(sid, state)

    @router.post('/api/portfolio/workspace/publish')
    async def publish(payload: RevisionRequest, admin=Depends(require_admin)):
        sid = admin['admin_id']
        await prepared(db)
        state = await managed(db, sid)
        if not state:
            raise HTTPException(409, 'Open the workspace first')
        document = await validate(db, sid, state['draft'])
        async with db.pool.acquire() as conn:
            async with conn.transaction():
                locked = decode(await conn.fetchval('SELECT data FROM portfolio_publications WHERE id=$1 FOR UPDATE', sid))
                if locked['revision'] != payload.revision or state['revision'] != payload.revision:
                    raise HTTPException(409, 'The draft changed. Reload and review it before publishing.')
                if not locked.get('published_version') and locked.get('legacy_bytes'):
                    reservation = {'id': sid + ':portfolio-legacy', 'studio_id': sid, 'size_bytes': locked['legacy_bytes'], 'consumed': False, 'area': 'portfolio_private_legacy'}
                    await conn.execute('INSERT INTO uploaded_media(id,data) VALUES($1,$2::jsonb) ON CONFLICT DO NOTHING', reservation['id'], json.dumps(reservation))
                for item in document['works']:
                    item['size_bytes'] = 0  # media reservations account for retained originals exactly once
                from portfolio_media import media_urls
                for url in set(media_urls(document)):
                    await conn.execute("UPDATE portfolio_media SET data=jsonb_set(data,'{public}','true'::jsonb) WHERE data->>'url'=$1 AND data->>'studio_id'=$2", url, sid)
                version = uuid.uuid4().hex
                now = datetime.now(timezone.utc).isoformat()
                document['profile'].update(id=sid, studio_id=sid, slug=state['slug'], is_published=True, design_id=document['design_id'], renderer_version=3)
                profile = document['profile']
                cities = list(dict.fromkeys(str(v).strip().lower() for v in [profile.get('location', {}).get('city')] + profile.get('coverage_areas', []) if v))
                directory = {'services': profile.get('services', []), 'styles': profile.get('styles', [])}
                if cities:
                    directory['service_cities'] = cities
                if profile.get('starting_price') is not None:
                    directory['starting_price'] = profile['starting_price']
                await conn.execute('UPDATE admins SET data=data || $2::jsonb,updated_at=now() WHERE id=$1', sid, json.dumps(directory))
                document['profile']['portfolio_showcase'] = {key: document.get(key, []) for key in ('packages', 'highlights')}
                # All public readers, including SEO/directory, see this projection.
                await conn.execute('INSERT INTO portfolio_profiles(id,data) VALUES($1,$2::jsonb) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,updated_at=now()', sid, json.dumps(document['profile']))
                for key in ('works', 'albums', 'testimonials'):
                    table = 'portfolio_' + key  # fixed allowlist above
                    await conn.execute(f"DELETE FROM {table} WHERE data->>'studio_id'=$1", sid)
                    for item in document[key]:
                        await conn.execute(f'INSERT INTO {table}(id,data) VALUES($1,$2::jsonb)', item['id'], json.dumps(item))
                await conn.execute('INSERT INTO portfolio_versions(id,data) VALUES($1,$2::jsonb)', f'{sid}:{version}', json.dumps({'studio_id': sid, 'document': document}))
                locked.update(published_version=version, revision=locked['revision'] + 1)
                locked['history'].append({'id': version, 'label': 'Published portfolio', 'at': now})
                await conn.execute('UPDATE portfolio_publications SET data=$2::jsonb,updated_at=now() WHERE id=$1', sid, json.dumps(locked))
        return await response(sid, locked)

    @router.post('/api/portfolio/workspace/restore/{version}')
    async def restore(version: str, payload: RevisionRequest, admin=Depends(require_admin)):
        sid = admin['admin_id']
        row = await db.portfolio_versions.find_one({'id': f'{sid}:{version}', 'studio_id': sid})
        if not row:
            raise HTTPException(404, 'Version not found')
        # Restore the whole prior snapshot, including its imported showcase.
        document = await validate(db, sid, row['document'])
        for key in ('packages', 'highlights'):
            document[key] = copy.deepcopy(row['document'].get(key, []))
        async with db.pool.acquire() as conn:
            async with conn.transaction():
                state = decode(await conn.fetchval('SELECT data FROM portfolio_publications WHERE id=$1 FOR UPDATE', sid))
                if not state or state['revision'] != payload.revision:
                    raise HTTPException(409, 'Another session changed the draft. Reload first.')
                state.update(draft=document, revision=state['revision'] + 1)
                await conn.execute('UPDATE portfolio_publications SET data=$2::jsonb,updated_at=now() WHERE id=$1', sid, json.dumps(state))
        return await response(sid, state)

    @router.post('/api/portfolio/workspace/refresh-showcase')
    async def refresh_showcase(payload: RevisionRequest, admin=Depends(require_admin)):
        """Explicitly import the separately managed community catalog into a draft."""
        sid = admin['admin_id']
        packages = await db.pixora_packages.find({'studio_id': sid}, {'_id': 0}).to_list(200)
        highlights = await db.pixora_highlights.find({'studio_id': sid}, {'_id': 0}).to_list(100)
        await prepared(db)
        async with db.pool.acquire() as conn:
            async with conn.transaction():
                raw = await conn.fetchval('SELECT data FROM portfolio_publications WHERE id=$1 FOR UPDATE', sid)
                if not raw:
                    raise HTTPException(409, 'Open the workspace first')
                state = decode(raw)
                if state['revision'] != payload.revision:
                    raise HTTPException(409, 'Another session changed the draft. Reload first.')
                state['draft'].update(packages=packages, highlights=highlights)
                state['revision'] += 1
                await conn.execute('UPDATE portfolio_publications SET data=$2::jsonb,updated_at=now() WHERE id=$1', sid, json.dumps(state))
        return await response(sid, state)

    return router
