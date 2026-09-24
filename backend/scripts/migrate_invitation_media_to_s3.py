#!/usr/bin/env python3
"""
Move existing INVITATION media off the VM disk (/app/uploads/...) into the
invitation S3 bucket, and rewrite the DB URLs to signed /api/media links.

Covers the fields the invitation upload endpoints write (server.py):
  db.profiles:  bride_photo_url, groom_photo_url, couple_photo_url,
                opening_photo_url, background_music.file_url,
                events[].music_file / hero_video_url / message_video_url /
                background_music_url, events[].gallery_images[].image_url+variants
  db.profile_media:      media_url + media_variants
  db.wedding_album_media: media_url
  db.admin_uploads:      url   (pre-save staging uploads)

DB-driven: only files still referenced by a row are migrated (orphans on disk are
left alone). Idempotent — a value already in /api/media... form is skipped. It
uploads to S3 + rewrites the DB, and only DELETES the local file with
--delete-local. Dry run by default; nothing is written without --apply.

Run INSIDE the core container on the VM (it has AWS creds + the invitation bucket):

    # 1. see what WOULD move (writes nothing):
    docker compose -f deploy/docker-compose.yml exec -T core \
        python scripts/migrate_invitation_media_to_s3.py
    # 2. do it (upload to S3 + rewrite DB URLs; local files kept):
    docker compose -f deploy/docker-compose.yml exec -T core \
        python scripts/migrate_invitation_media_to_s3.py --apply
    # 3. once verified in the browser, reclaim the disk:
    docker compose -f deploy/docker-compose.yml exec -T core \
        python scripts/migrate_invitation_media_to_s3.py --apply --delete-local
"""
from __future__ import annotations

import argparse
import asyncio
import mimetypes
import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

try:
    from dotenv import load_dotenv
    load_dotenv(BACKEND / ".env")
except Exception:
    pass

import media_storage          # noqa: E402
import aws_service            # noqa: E402
from storage_serve import media_url  # noqa: E402

UPLOADS_ROOT = Path("/app/uploads")
INVITE_TTL = 10 * 365 * 24 * 3600  # match server._INVITE_MEDIA_URL_TTL

_IMG = {".webp", ".jpg", ".jpeg", ".png", ".heic", ".heif", ".gif", ".avif", ".tif", ".tiff"}
_VID = {".mp4", ".mov", ".webm", ".mkv"}
_AUD = {".mp3", ".m4a", ".aac", ".wav", ".flac", ".ogg"}


def _to_local_path(url):
    """Map a stored /uploads or /api/uploads URL to its file under /app/uploads.
    Returns None for anything that isn't a local upload (external, already-S3)."""
    if not isinstance(url, str) or not url:
        return None
    u = url.split("?", 1)[0]
    if u.startswith("/api/uploads/"):
        u = u[len("/api"):]
    if not u.startswith("/uploads/"):
        return None
    p = (UPLOADS_ROOT.parent / u.lstrip("/")).resolve()  # /app + /uploads/...
    try:
        p.relative_to(UPLOADS_ROOT.resolve())
    except ValueError:
        return None
    return p


def _kind_ext_mime(path: Path):
    ext = path.suffix.lower()
    kind = "image" if ext in _IMG else "video" if ext in _VID else "music" if ext in _AUD else "image"
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return kind, (ext or ".bin"), mime


class Migrator:
    def __init__(self, db, bucket, dry, delete_local):
        self.db = db
        self.bucket = bucket
        self.dry = dry
        self.delete_local = delete_local
        self.moved = 0
        self.bytes = 0
        self.missing = 0
        self.skipped = 0
        self._unlink: list[Path] = []

    def migrate_url(self, url, photographer_id, event_id, invitation_id):
        """Return a new /api/media URL, or None to leave the field unchanged."""
        if not isinstance(url, str) or not url:
            return None
        if url.startswith("/api/media"):
            self.skipped += 1
            return None
        p = _to_local_path(url)
        if p is None:
            return None  # external URL / not ours
        if not p.is_file():
            self.missing += 1
            print(f"  MISSING on disk (left as-is): {url}")
            return None
        kind, ext, mime = _kind_ext_mime(p)
        key = media_storage.invitation_media_key(
            photographer_id or "unknown", event_id, invitation_id, kind, ext)
        data = p.read_bytes()
        if not self.dry:
            aws_service.upload_bytes(key, data, mime, bucket_name=self.bucket)
        new = media_url(key, expiry_seconds=INVITE_TTL, bucket=self.bucket)
        self.moved += 1
        self.bytes += len(data)
        print(f"  {'WOULD move' if self.dry else 'moved'} {url}  ->  s3://{self.bucket}/{key}")
        if self.delete_local and not self.dry:
            self._unlink.append(p)
        return new

    def _migrate_variants(self, variants, photographer_id, event_id, invitation_id):
        """variants is a dict {label: url or int}. Returns (new_dict, changed)."""
        if not isinstance(variants, dict):
            return variants, False
        out = dict(variants)
        changed = False
        for label, val in variants.items():
            new = self.migrate_url(val, photographer_id, event_id, invitation_id)
            if new:
                out[label] = new
                changed = True
        return out, changed

    async def run_profiles(self):
        id_to_admin = {}
        cursor = self.db.profiles.find({}, {"_id": 0})
        async for prof in cursor:
            pid = prof.get("id")
            admin = prof.get("admin_id")
            id_to_admin[pid] = admin
            changed = {}

            for f in ("bride_photo_url", "groom_photo_url", "couple_photo_url", "opening_photo_url"):
                new = self.migrate_url(prof.get(f), admin, pid, pid)
                if new:
                    changed[f] = new

            bm = prof.get("background_music")
            if isinstance(bm, dict) and bm.get("file_url"):
                new = self.migrate_url(bm["file_url"], admin, pid, pid)
                if new:
                    bm2 = dict(bm)
                    bm2["file_url"] = new
                    changed["background_music"] = bm2

            events = prof.get("events") or []
            events_changed = False
            for ev in events:
                eid = ev.get("event_id") or pid
                for f in ("music_file", "hero_video_url", "message_video_url", "background_music_url"):
                    new = self.migrate_url(ev.get(f), admin, eid, pid)
                    if new:
                        ev[f] = new
                        events_changed = True
                for img in (ev.get("gallery_images") or []):
                    new = self.migrate_url(img.get("image_url"), admin, eid, pid)
                    if new:
                        img["image_url"] = new
                        events_changed = True
                    v2, vch = self._migrate_variants(img.get("variants"), admin, eid, pid)
                    if vch:
                        img["variants"] = v2
                        events_changed = True
            if events_changed:
                changed["events"] = events

            if changed and not self.dry:
                await self.db.profiles.update_one({"id": pid}, {"$set": changed})
        return id_to_admin

    async def run_profile_media(self, id_to_admin):
        cursor = self.db.profile_media.find({}, {"_id": 0})
        async for m in cursor:
            pid = m.get("profile_id")
            admin = id_to_admin.get(pid)
            changed = {}
            new = self.migrate_url(m.get("media_url"), admin, pid, pid)
            if new:
                changed["media_url"] = new
            v2, vch = self._migrate_variants(m.get("media_variants"), admin, pid, pid)
            if vch:
                changed["media_variants"] = v2
            if changed and not self.dry:
                await self.db.profile_media.update_one({"id": m.get("id")}, {"$set": changed})

    async def run_album(self, id_to_admin):
        cursor = self.db.wedding_album_media.find({}, {"_id": 0})
        async for m in cursor:
            pid = m.get("profile_id")
            admin = id_to_admin.get(pid)
            new = self.migrate_url(m.get("media_url"), admin, pid, pid)
            if new and not self.dry:
                await self.db.wedding_album_media.update_one(
                    {"id": m.get("id")}, {"$set": {"media_url": new}})

    async def run_admin_uploads(self):
        cursor = self.db.admin_uploads.find({}, {"_id": 0})
        async for m in cursor:
            admin = m.get("admin_id")
            new = self.migrate_url(m.get("url"), admin, "staging", "staging")
            if new and not self.dry:
                await self.db.admin_uploads.update_one(
                    {"id": m.get("id")}, {"$set": {"url": new}})

    def finish(self):
        for p in self._unlink:
            try:
                p.unlink()
            except Exception as e:
                print(f"  could not delete {p}: {e}")


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true",
                    help="actually upload + rewrite the DB (default is a dry run)")
    ap.add_argument("--delete-local", action="store_true",
                    help="with --apply: unlink each local file after a successful move")
    args = ap.parse_args()
    args.dry_run = not args.apply

    bucket = media_storage.bucket_for("invitation")
    if not bucket:
        print("ERROR: AWS_S3_INVITATIONS_BUCKET (invitation bucket) is not configured. "
              "Run this inside the core container on the VM.")
        sys.exit(2)

    dsn = os.environ.get("SUPABASE_DB_URL") or os.environ.get("DATABASE_URL")
    if not dsn:
        print("ERROR: SUPABASE_DB_URL / DATABASE_URL not set.")
        sys.exit(2)

    import pg_adapter
    db = pg_adapter.Database.lazy(dsn, min_size=1, max_size=4)
    await db.ensure_connected()

    print(f"{'DRY RUN — ' if args.dry_run else ''}migrating invitation media -> {bucket}")
    if args.delete_local and not args.dry_run:
        print("  --delete-local: local files WILL be removed after a successful move")

    m = Migrator(db, bucket, args.dry_run, args.delete_local)
    print("== profiles ==")
    id_to_admin = await m.run_profiles()
    print("== profile_media ==")
    await m.run_profile_media(id_to_admin)
    print("== wedding_album_media ==")
    await m.run_album(id_to_admin)
    print("== admin_uploads ==")
    await m.run_admin_uploads()
    m.finish()

    print("\n--- summary ---")
    print(f"  {'would move' if args.dry_run else 'moved'}: {m.moved} files, "
          f"{m.bytes / (1024*1024):.1f} MB")
    print(f"  already migrated (skipped): {m.skipped}")
    print(f"  referenced but MISSING on disk: {m.missing}")
    if args.dry_run:
        print("  (dry run — nothing was uploaded, rewritten, or deleted)")


if __name__ == "__main__":
    asyncio.run(main())
