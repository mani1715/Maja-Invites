"""Disposable LOCAL PostgreSQL integration check; never writes the app database.

Run from repository root: .venv/Scripts/python.exe -X utf8 backend/tests/test_portfolio_publication_pg.py
"""
import asyncio
import io
import os
import sys
import tempfile
import uuid
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import asyncpg
import httpx
from dotenv import dotenv_values
from fastapi import FastAPI, Header, HTTPException
from PIL import Image
from pg_adapter import Database
from portfolio_service import build_portfolio_router, PORTFOLIO_DESIGN_TIERS
from portfolio_leads import build_portfolio_leads_router
import portfolio_media


async def run():
    dsn = os.environ.get('PORTFOLIO_TEST_DSN') or dotenv_values(Path(__file__).resolve().parents[1] / '.env').get('SUPABASE_DB_URL')
    parsed = urlsplit(dsn)
    assert parsed.hostname in ('localhost', '127.0.0.1', '::1'), 'Only a local PostgreSQL server is permitted'
    name = 'pf_test_' + uuid.uuid4().hex
    control = await asyncpg.connect(dsn)
    await control.execute(f'CREATE DATABASE {name}')
    db = None
    try:
        test_dsn = urlunsplit(parsed._replace(path='/' + name))
        db = await Database.connect(test_dsn)
        await db.admins.insert_one({'id': 'owner', 'name': 'Verified local test studio'})
        await db.admins.insert_one({'id': 'other', 'name': 'Other local test studio'})
        await db.portfolio_profiles.insert_one({'id': 'owner', 'studio_id': 'owner', 'slug': 'stable-link', 'studio_name': 'Original studio', 'about': 'Original public biography', 'design_id': 'free_studio_neutral'})
        await db.portfolio_works.insert_one({'id': 'original-work', 'studio_id': 'owner', 'title': 'Original project', 'image_url': 'https://example.com/old.jpg', 'size_bytes': 0})
        async def auth(authorization: str = Header(default='')):
            if authorization not in ('Bearer owner', 'Bearer other'):
                raise HTTPException(401, 'Authentication required')
            return {'admin_id': authorization.split()[1]}
        app = FastAPI()
        app.include_router(build_portfolio_router(db, auth))
        app.include_router(build_portfolio_leads_router(db))
        app.openapi()  # catches scoped annotation registration regressions
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as c:
            owner = {'Authorization': 'Bearer owner'}
            other = {'Authorization': 'Bearer other'}
            async def get_state():
                r = await c.post('/api/portfolio/workspace', headers=owner)
                assert r.status_code == 200, r.text
                return r.json()
            old = (await c.get('/api/public/photographer/stable-link/portfolio')).json()
            assert old['renderer_version'] == 1
            state = await get_state()
            assert (await c.post('/api/portfolio/workspace')).status_code == 401
            assert (await c.put('/api/portfolio/profile', headers=owner, json={'about': 'bypass'})).status_code == 409
            assert (await c.post('/api/portfolio/upload', headers=owner, files={'file': ('test.jpg', b'not read', 'image/jpeg')})).status_code == 409
            draft = state['draft']
            draft['profile']['about'] = 'Private draft biography'
            r = await c.put('/api/portfolio/workspace', headers=owner, json={'revision': 0, 'document': draft})
            assert r.status_code == 200, r.text
            state = r.json()
            assert (await c.get('/api/public/photographer/stable-link/portfolio')).json()['profile']['about'] == 'Original public biography'
            assert (await c.put('/api/portfolio/workspace', headers=owner, json={'revision': 0, 'document': draft})).status_code == 409
            for design, tier in PORTFOLIO_DESIGN_TIERS.items():
                draft['design_id'] = design
                r = await c.put('/api/portfolio/workspace', headers=owner, json={'revision': state['revision'], 'document': draft})
                assert r.status_code == (200 if tier == 'normal' else 403), (design, r.text)
                if r.status_code == 200:
                    state = r.json()
            await db.subscription_plans.insert_one({'id': 'paid', 'tier': 'Pro', 'portfolio_tier': 'premium'})
            await db.subscriptions.insert_one({'id': 'subscription', 'studio_id': 'owner', 'product': 'portfolio', 'status': 'active', 'plan_id': 'paid'})
            for design in PORTFOLIO_DESIGN_TIERS:
                draft['design_id'] = design
                r = await c.put('/api/portfolio/workspace', headers=owner, json={'revision': state['revision'], 'document': draft})
                assert r.status_code == 200, (design, r.text)
                state = r.json()
            # Two sessions race on the same revision: exactly one may commit.
            pair = await asyncio.gather(*[c.put('/api/portfolio/workspace', headers=owner, json={'revision': state['revision'], 'document': state['draft']}) for _ in range(2)])
            assert sorted(r.status_code for r in pair) == [200, 409]
            state = next(r.json() for r in pair if r.status_code == 200)
            # Ownership, private derivatives and permanent published URLs.
            with tempfile.TemporaryDirectory(prefix='pf-private-') as temp:
                portfolio_media.ROOT = Path(temp)
                photo = io.BytesIO()
                Image.new('RGB', (900, 1300), '#8b7763').save(photo, 'JPEG')
                r = await c.post('/api/portfolio/workspace/media', headers=owner, files={'file': ('portrait.jpg', photo.getvalue(), 'image/jpeg')})
                assert r.status_code == 200, r.text
                media = r.json()['url']
                assert (await c.get(media)).status_code == 404
                assert (await c.get(media.replace('/display', '/preview'), headers=other)).status_code == 404
                assert (await c.get(media.replace('/display', '/preview'), headers=owner)).status_code == 200
                draft = state['draft']
                draft['profile']['hero_image'] = media
                draft['profile']['location'] = {'city': 'Jaipur'}
                r = await c.put('/api/portfolio/workspace', headers=owner, json={'revision': state['revision'], 'document': draft})
                assert r.status_code == 200, r.text
                state = r.json()
                r = await c.post('/api/portfolio/workspace/publish', headers=owner, json={'revision': state['revision'] - 1})
                assert r.status_code == 409
                r = await c.post('/api/portfolio/workspace/publish', headers=owner, json={'revision': state['revision']})
                assert r.status_code == 200, r.text
                state = r.json()
                live = (await c.get('/api/public/photographer/stable-link/portfolio')).json()
                assert live['renderer_version'] == 3 and live['profile']['about'] == 'Private draft biography'
                assert live['slug'] == 'stable-link' and live['design_id'] == 'premium_editorial'
                assert (await c.get(media)).status_code == 200
                assert (await db.admins.find_one({'id': 'owner'}))['service_cities'] == ['jaipur']
                from portfolio_service import resolve_public_portfolio_seo
                seo = await resolve_public_portfolio_seo(db, 'stable-link')
                assert seo['canonical'].endswith('/photographer/stable-link')
                r = await c.post('/api/portfolio/workspace/restore/legacy', headers=owner, json={'revision': state['revision']})
                assert r.status_code == 200, r.text
                assert r.json()['draft']['profile']['about'] == 'Original public biography'
                assert (await c.get('/api/public/photographer/stable-link/portfolio')).json()['profile']['about'] == 'Private draft biography'
                other_state = (await c.post('/api/portfolio/workspace', headers=other)).json()
                stolen = other_state['draft']
                stolen['works'] = [{'id': 'original-work', 'title': 'stolen'}]
                r = await c.put('/api/portfolio/workspace', headers=other, json={'revision': 0, 'document': stolen})
                assert r.status_code == 403, r.text
                stolen['works'] = []
                stolen['profile']['hero_image'] = media
                assert (await c.put('/api/portfolio/workspace', headers=other, json={'revision': 0, 'document': stolen})).status_code == 403
                assert (await c.get('/api/public/photographer/other/portfolio')).status_code == 404
                import storage_accounting
                reserved = await storage_accounting.pending_upload_bytes(db, 'owner')
                assert reserved > 0
                await storage_accounting.purge_orphan_uploads(db, older_than_hours=-1)
                assert await storage_accounting.pending_upload_bytes(db, 'owner') == reserved
            r = await c.post('/api/public/photographer/stable-link/enquiry', json={'name': 'Local QA', 'email': 'qa@example.com', 'message': 'Disposable integration test'})
            assert r.status_code == 200, r.text
            assert await db.pixora_crm_clients.count_documents({'studio_id': 'owner'}) == 1
            assert await db.pixora_crm_timeline.count_documents({}) == 1
            if '--browser' in sys.argv:
                # An existing V2 publication keeps its renderer while a V3 draft is edited.
                await db.portfolio_profiles.update_one({'id': 'owner'}, {'$set': {'renderer_version': 2}})
                assert (await c.get('/api/public/photographer/stable-link/portfolio')).json()['renderer_version'] == 2
                from playwright.async_api import async_playwright
                browser_media = tempfile.TemporaryDirectory(prefix='pf-browser-')
                portfolio_media.ROOT = Path(browser_media.name)
                async with async_playwright() as pw:
                    browser = await pw.chromium.launch()
                    page = await browser.new_page(viewport={'width': 1440, 'height': 1000})
                    errors = []
                    page.on('pageerror', lambda e: errors.append(str(e)))
                    await page.add_init_script("localStorage.setItem('admin_token','owner');localStorage.setItem('maja_cookie_consent',JSON.stringify({version:'1.0',analytics:false,marketing:false,decided_at:new Date().toISOString()}));")
                    async def bridge(route):
                        req = route.request
                        path = urlsplit(req.url).path
                        if not path.startswith('/api/'):
                            await route.continue_()
                            return
                        if path == '/api/auth/me':
                            await route.fulfill(json={'id': 'owner', 'role': 'admin', 'name': 'Disposable test studio'})
                        elif path.startswith('/api/portfolio') or path.startswith('/api/public/photographer'):
                            result = await c.request(req.method, path, content=req.post_data_buffer, headers={k: v for k, v in req.headers.items() if k.lower() in ('authorization', 'content-type')})
                            await route.fulfill(status=result.status_code, body=result.content, headers={'content-type': result.headers.get('content-type', 'application/json')})
                        else:
                            await route.fulfill(json={})
                    await page.route('**/api/**', bridge)
                    await page.goto('http://127.0.0.1:8143/studio/portfolio')
                    try:
                        await page.get_by_role('heading', name='Your photography website').wait_for(timeout=15000)
                    except Exception:
                        print('EDITOR DIAGNOSTIC', errors, (await page.locator('body').inner_text())[:1800])
                        raise
                    await page.get_by_label('Studio name', exact=True).fill('Browser verified studio')
                    await page.get_by_label('Opening headline', exact=True).fill('Owner authored headline')
                    await page.get_by_label('Introduction', exact=True).fill('Owner authored supporting introduction')
                    await page.get_by_label('Upload opening photograph', exact=True).set_input_files({'name': 'portrait.jpg', 'mimeType': 'image/jpeg', 'buffer': photo.getvalue()})
                    await page.get_by_text('Private upload ready. Save and preview before publishing.', exact=True).wait_for()
                    await page.get_by_role('button', name='Save draft', exact=True).click()
                    await page.get_by_text('Draft saved. Nothing has been published.', exact=True).wait_for()
                    assert (await c.get('/api/public/photographer/stable-link/portfolio')).json()['profile']['studio_name'] != 'Browser verified studio'
                    assert (await c.get('/api/public/photographer/stable-link/portfolio')).json()['renderer_version'] == 2
                    await page.get_by_role('button', name='Review & publish', exact=True).click()
                    frame = page.frame_locator('iframe[title="Private portfolio preview"]')
                    await frame.locator('.pf2').wait_for()
                    assert await frame.locator('h1').inner_text() == 'Owner authored headline'
                    assert await frame.locator('.pf2-introduction').inner_text() == 'Owner authored supporting introduction'
                    await frame.locator('.pf2-hero-photo img').evaluate('(img)=>img.decode()')
                    assert await frame.locator('.pf2-hero-photo img').evaluate('(img)=>img.naturalWidth>0 && img.src.startsWith("blob:")')
                    await page.get_by_role('combobox').select_option('390px')
                    assert await frame.locator('.pf2').evaluate('(e)=>e.ownerDocument.documentElement.scrollWidth<=390')
                    await page.screenshot(path=str(Path(__file__).resolve().parents[2] / 'design/photographer-proposals/previews/ten-designs/editor-mobile-preview.png'))
                    await page.get_by_role('button', name='Publish this reviewed draft').click()
                    await page.get_by_text('Published. Your existing portfolio URL now shows this version.', exact=True).wait_for()
                    assert (await c.get('/api/public/photographer/stable-link/portfolio')).json()['profile']['studio_name'] == 'Browser verified studio'
                    await page.set_viewport_size({'width': 390, 'height': 844})
                    assert await page.evaluate('document.documentElement.scrollWidth<=390')
                    await page.goto('http://127.0.0.1:8143/photographer/stable-link')
                    await page.locator('.pf2').wait_for()
                    assert await page.locator('h1').inner_text() == 'Owner authored headline'
                    assert await page.locator('.pf2-introduction').inner_text() == 'Owner authored supporting introduction'
                    await page.locator('input[name=name]').fill('Browser enquiry visitor')
                    await page.locator('input[name=email]').fill('browser-enquiry@example.com')
                    await page.get_by_role('button', name='Send enquiry').click()
                    await page.get_by_text('Your enquiry was received.', exact=False).wait_for()
                    assert await db.pixora_crm_clients.find_one({'email': 'browser-enquiry@example.com'})
                    assert not errors, errors
                    await browser.close()
                    browser_media.cleanup()
                    print('PASS: real React editor → private save → 390px preview → explicit publish → public PostgreSQL projection')
        print('PASS: PostgreSQL publish, legacy preservation, 10 design gates, private media, revisions, restore, ownership, stable URLs, directory projection, real CRM enquiry')
    finally:
        if db:
            await db.close()
        await control.execute(f'DROP DATABASE {name}')
        await control.close()


if __name__ == '__main__':
    asyncio.run(run())

