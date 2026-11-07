"""Private originals and bounded display copies for the portfolio workspace."""
import asyncio
import io
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

ROOT = Path(os.environ.get('PORTFOLIO_PRIVATE_MEDIA_ROOT', '/app/private/portfolio'))


def prepare_image(content):
    from PIL import Image, ImageOps
    with Image.open(io.BytesIO(content)) as source:
        if source.width * source.height > 80_000_000:
            raise ValueError('Image exceeds 80 megapixels')
        source.load()
        image = ImageOps.exif_transpose(source).convert('RGB')
        image.thumbnail((2400, 2400))
        out = io.BytesIO()
        image.save(out, 'WEBP', quality=88)
        medium = image.copy()
        medium.thumbnail((960, 960))
        small = io.BytesIO()
        medium.save(small, 'WEBP', quality=85)
        return out.getvalue(), small.getvalue(), image.width, image.height


def media_urls(document):
    if isinstance(document, str):
        if document.startswith('/api/portfolio/media/'):
            yield document
    elif isinstance(document, dict):
        for value in document.values():
            yield from media_urls(value)
    elif isinstance(document, list):
        for value in document:
            yield from media_urls(value)


async def validate_media(db, sid, document):
    for url in set(media_urls(document)):
        record = await db.portfolio_media.find_one({'url': url, 'studio_id': sid})
        if not record:
            raise HTTPException(403, 'A media item does not belong to this studio')


def build_media_router(db, require_admin):
    router = APIRouter(tags=['portfolio-media'])

    @router.post('/api/portfolio/workspace/media')
    async def upload(file: UploadFile = File(...), admin=Depends(require_admin)):
        from portfolio_service import _used_bytes, _storage_cap_bytes
        import storage_accounting
        sid = admin['admin_id']
        if not storage_accounting.allow_upload(sid, 30):
            raise HTTPException(429, 'Please wait before uploading again')
        video = (file.content_type or '').startswith('video/')
        cap = (200 if video else 25) * 1024 * 1024
        content = await file.read(cap + 1)
        if not content or len(content) > cap:
            raise HTTPException(413, 'File is empty or exceeds the upload limit')
        if video:
            if not (content[4:8] == b'ftyp' or content[:4] == b'\x1aE\xdf\xa3'):
                raise HTTPException(422, 'Use a browser-compatible MP4 or WebM video')
            display, medium, width, height = content, b'', None, None
            suffix = '.mp4' if content[4:8] == b'ftyp' else '.webm'
        else:
            try:
                display, medium, width, height = await asyncio.to_thread(prepare_image, content)
            except Exception as exc:
                raise HTTPException(422, 'Use a supported photograph (JPEG, PNG or WebP)') from exc
            suffix = '.webp'
        size = len(content) + (0 if video else len(display) + len(medium))
        await db.ensure_table('portfolio_media')
        await db.ensure_table('uploaded_media')
        # Serialize this uploader's quota reservations, including pending drafts.
        await db.ensure_connected()
        async with db.pool.acquire() as conn:
            await conn.execute('SELECT pg_advisory_lock(hashtext($1))', 'portfolio-media:' + sid)
            try:
                if await _used_bytes(db, sid) + size > await _storage_cap_bytes(db, sid):
                    raise HTTPException(403, 'Your existing storage allowance is full')
                ident = uuid.uuid4().hex
                directory = ROOT / ident
                directory.mkdir(parents=True, exist_ok=True)
                original = directory / 'original'
                original.write_bytes(content)
                path = original if video else directory / ('display' + suffix)
                if not video:
                    path.write_bytes(display)
                    (directory / 'medium.webp').write_bytes(medium)
                url = f'/api/portfolio/media/{ident}/display'
                record = {'id': ident, 'studio_id': sid, 'url': url, 'path': str(path),
                          'public': False, 'size_bytes': size, 'width': width, 'height': height,
                          'mime': ('video/mp4' if suffix == '.mp4' else 'video/webm') if video else 'image/webp'}
                reservation = {'id': 'pf_' + ident, 'studio_id': sid, 'url': url,
                               'size_bytes': size, 'consumed': False, 'area': 'portfolio_private',
                               'created_at': datetime.now(timezone.utc).isoformat()}
                try:
                    async with conn.transaction():
                        await conn.execute('INSERT INTO portfolio_media(id,data) VALUES($1,$2::jsonb)', ident, json.dumps(record))
                        await conn.execute('INSERT INTO uploaded_media(id,data) VALUES($1,$2::jsonb)', reservation['id'], json.dumps(reservation))
                except Exception:
                    for created in directory.iterdir():
                        created.unlink()
                    directory.rmdir()
                    raise
                return {'url': url, 'kind': 'video' if video else 'image', 'width': width, 'height': height, 'size_bytes': size}
            finally:
                await conn.execute('SELECT pg_advisory_unlock(hashtext($1))', 'portfolio-media:' + sid)

    async def serve(ident, sid=None, width=2400):
        rec = await db.portfolio_media.find_one({'id': ident})
        if not rec or (not rec.get('public') and rec.get('studio_id') != sid):
            raise HTTPException(404, 'Media not found')
        path = Path(rec['path']).resolve()
        if width <= 960 and rec['mime'] == 'image/webp':
            path = path.parent / 'medium.webp'
        if ROOT.resolve() not in path.parents or not path.is_file():
            raise HTTPException(404, 'Media not found')
        return FileResponse(path, media_type=rec['mime'], headers={'Cache-Control': 'private, no-store' if sid else 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff'})

    @router.get('/api/portfolio/media/{ident}/display')
    async def public(ident: str, width: int = 2400):
        return await serve(ident, width=width)

    @router.get('/api/portfolio/media/{ident}/preview')
    async def preview(ident: str, admin=Depends(require_admin)):
        return await serve(ident, admin['admin_id'])

    return router
