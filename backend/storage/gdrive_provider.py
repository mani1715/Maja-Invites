"""
storage.gdrive_provider — Google Drive backend (charter surface).
=================================================================

V1 primary provider for the platform-owned pool (8 × 15 TB accounts today).

Credential modes (per `account["credential_mode"]`):
  "oauth"           — each pooled account is connected once by the super-admin
                      via OAuth (same flow pattern as `drive_archive.py`); the
                      orchestrator hands this provider the ALREADY-DECRYPTED
                      token dict in `account["credentials"]`:
                        {access_token?, refresh_token, client_id, client_secret,
                         token_uri?}
                      google-auth refreshes expired tokens automatically before
                      each request (charter failure case 2).
  "service_account" — Workspace service-account JSON from env
                      (GOOGLE_SA_CREDENTIALS_JSON / _FILE, optional
                      GOOGLE_SA_SUBJECT), for Shared Drives (`drive_id` set).

Reliability (charter failure cases 4 & 7): uploads are **resumable + chunked**
(10 MB chunks via `MediaIoBaseUpload(resumable=True)` + a `next_chunk()` loop
with capped exponential backoff on 429/5xx and network errors).

`account` dict fields used:
    credential_mode : "oauth" | "service_account"
    credentials     : decrypted token dict (oauth mode)
    drive_id        : Shared Drive ID (service_account mode; omit for My Drive)
    capacity_bytes  : policy capacity (15 TB per account today)
"""
from __future__ import annotations

import asyncio
import datetime as _dt
import io
import json
import os
import time
from typing import Any, Dict, Optional

from google.oauth2 import service_account
from google.oauth2.credentials import Credentials as UserCredentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
from googleapiclient.errors import HttpError

from .base import (
    StorageProvider,
    ProviderObject,
    FolderRef,
    FileHandle,
    FileList,
    QuotaSnapshot,
    HealthSnapshot,
    ProviderUnavailable,
    ProviderQuotaExceeded,
    StorageError,
)

_DRIVE_SCOPE = ["https://www.googleapis.com/auth/drive"]
_FOLDER_MIME = "application/vnd.google-apps.folder"
_CHUNK_SIZE = 10 * 1024 * 1024          # 10 MB chunks (charter case 7)
_MAX_CHUNK_RETRIES = 5                  # per-chunk retry budget
_RETRIABLE_HTTP = {429, 500, 502, 503, 504}


def _now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat()


# --------------------------------------------------------------------------- #
# Credentials
# --------------------------------------------------------------------------- #
def _sa_credentials():
    inline = os.environ.get("GOOGLE_SA_CREDENTIALS_JSON", "").strip()
    path = os.environ.get("GOOGLE_SA_CREDENTIALS_FILE", "").strip()
    subject = os.environ.get("GOOGLE_SA_SUBJECT", "").strip() or None
    if inline:
        try:
            info = json.loads(inline)
        except Exception as e:
            raise StorageError(f"GOOGLE_SA_CREDENTIALS_JSON is not valid JSON: {e}") from e
    elif path:
        if not os.path.exists(path):
            raise StorageError(f"GOOGLE_SA_CREDENTIALS_FILE not found: {path}")
        with open(path, "r", encoding="utf-8") as fh:
            info = json.load(fh)
    else:
        raise StorageError(
            "Google service account not configured. Set GOOGLE_SA_CREDENTIALS_JSON "
            "or GOOGLE_SA_CREDENTIALS_FILE."
        )
    creds = service_account.Credentials.from_service_account_info(info, scopes=_DRIVE_SCOPE)
    if subject:
        creds = creds.with_subject(subject)
    return creds


def _oauth_credentials(account: Dict[str, Any]):
    c = (account or {}).get("credentials") or {}
    if not c.get("refresh_token"):
        raise StorageError(
            f"gdrive account {(account or {}).get('id', '?')} has no refresh_token — "
            "re-connect it from the storage admin panel."
        )
    return UserCredentials(
        token=c.get("access_token"),
        refresh_token=c["refresh_token"],
        token_uri=c.get("token_uri") or "https://oauth2.googleapis.com/token",
        client_id=c.get("client_id") or os.environ.get("GOOGLE_CLIENT_ID", ""),
        client_secret=c.get("client_secret") or os.environ.get("GOOGLE_CLIENT_SECRET", ""),
        scopes=c.get("scopes") or _DRIVE_SCOPE,
    )


class GoogleDriveProvider(StorageProvider):
    kind = "gdrive"

    # ---------------- plumbing ----------------
    def _service(self, account: Dict[str, Any]):
        """Build a Drive v3 client. Blocking — always call via asyncio.to_thread.
        google-auth auto-refreshes expired oauth tokens before each request."""
        mode = (account or {}).get("credential_mode") or (
            "oauth" if (account or {}).get("credentials") else "service_account"
        )
        creds = _oauth_credentials(account) if mode == "oauth" else _sa_credentials()
        return build("drive", "v3", credentials=creds, cache_discovery=False)

    @staticmethod
    def _drive_kwargs(account: Dict[str, Any], listing: bool = False) -> Dict[str, Any]:
        """Shared-Drive plumbing args. Harmless no-ops on My Drive accounts."""
        kw: Dict[str, Any] = {"supportsAllDrives": True}
        if listing:
            kw["includeItemsFromAllDrives"] = True
            drive_id = (account or {}).get("drive_id")
            if drive_id:
                kw["corpora"] = "drive"
                kw["driveId"] = drive_id
        return kw

    @staticmethod
    def _map_http_error(e: HttpError, op: str) -> StorageError:
        status = getattr(getattr(e, "resp", None), "status", None)
        reason = str(e)
        low = reason.lower()
        if (status in (403, 507)) and ("quota" in low or "storage" in low and "exceeded" in low):
            return ProviderQuotaExceeded(f"Drive {op}: storage quota exceeded: {reason}")
        return ProviderUnavailable(f"Drive {op} failed ({status}): {reason}")

    # ---------------- charter verbs ----------------
    async def create_folder(
        self,
        account: Dict[str, Any],
        name: str,
        parent: Optional[FolderRef] = None,
    ) -> FolderRef:
        parent_id = (parent.ref.get("folder_id") if parent else None) \
            or (account or {}).get("drive_id") or "root"

        def _find_or_create() -> str:
            service = self._service(account)
            # Find-or-create so provisioning is idempotent. Name search happens
            # ONLY here (provisioning), never on the upload path.
            safe = name.replace("'", "\\'")
            q = (f"name = '{safe}' and mimeType = '{_FOLDER_MIME}' "
                 f"and trashed = false and '{parent_id}' in parents")
            resp = service.files().list(
                q=q, spaces="drive", fields="files(id, name)", pageSize=1,
                **self._drive_kwargs(account, listing=True),
            ).execute()
            found = resp.get("files", [])
            if found:
                return found[0]["id"]
            created = service.files().create(
                body={"name": name, "mimeType": _FOLDER_MIME, "parents": [parent_id]},
                fields="id", **self._drive_kwargs(account),
            ).execute()
            return created["id"]

        try:
            folder_id = await asyncio.to_thread(_find_or_create)
        except HttpError as he:
            raise self._map_http_error(he, "create_folder")
        except StorageError:
            raise
        except Exception as e:
            raise ProviderUnavailable(f"Drive create_folder failed: {e}") from e
        ref: Dict[str, Any] = {"folder_id": folder_id}
        if (account or {}).get("drive_id"):
            ref["drive_id"] = account["drive_id"]
        return FolderRef(ref=ref)

    async def upload(
        self,
        account: Dict[str, Any],
        folder: FolderRef,
        filename: str,
        data: bytes,
        content_type: str,
        meta: Optional[Dict[str, Any]] = None,
    ) -> ProviderObject:
        folder_id = folder.ref.get("folder_id")
        if not folder_id:
            raise StorageError("gdrive upload: folder ref missing folder_id")

        def _upload() -> Dict[str, Any]:
            service = self._service(account)
            body: Dict[str, Any] = {"name": filename, "parents": [folder_id]}
            props = {}
            for k in ("event_id", "photographer_id", "checksum_sha256"):
                v = (meta or {}).get(k)
                if v:
                    props[k] = str(v)[:120]
            if props:
                body["appProperties"] = props
            media = MediaIoBaseUpload(
                io.BytesIO(data),
                mimetype=content_type or "application/octet-stream",
                resumable=True,
                chunksize=_CHUNK_SIZE,
            )
            request = service.files().create(
                body=body, media_body=media, fields="id, size",
                **self._drive_kwargs(account),
            )
            # Resumable chunk loop with capped exponential backoff:
            # network drops resume from the last acked chunk (case 4); large
            # uploads proceed 10 MB at a time with per-chunk retries (case 7).
            response = None
            retries, backoff = 0, 1.0
            while response is None:
                try:
                    _status, response = request.next_chunk()
                    retries, backoff = 0, 1.0
                except HttpError as he:
                    status = getattr(getattr(he, "resp", None), "status", None)
                    if status in _RETRIABLE_HTTP and retries < _MAX_CHUNK_RETRIES:
                        time.sleep(backoff)
                        retries, backoff = retries + 1, min(backoff * 2, 30)
                        continue
                    raise
                except (ConnectionError, TimeoutError, OSError):
                    if retries < _MAX_CHUNK_RETRIES:
                        time.sleep(backoff)
                        retries, backoff = retries + 1, min(backoff * 2, 30)
                        continue
                    raise
            return response

        try:
            created = await asyncio.to_thread(_upload)
        except HttpError as he:
            raise self._map_http_error(he, "upload")
        except StorageError:
            raise
        except Exception as e:
            raise ProviderUnavailable(f"Drive upload failed: {e}") from e

        ref: Dict[str, Any] = {"file_id": created["id"], "folder_id": folder_id}
        if (account or {}).get("drive_id"):
            ref["drive_id"] = account["drive_id"]
        return ProviderObject(
            provider_ref=ref,
            size_bytes=int(created.get("size") or len(data)),
            content_type=content_type or "application/octet-stream",
        )

    async def get_file(
        self,
        account: Dict[str, Any],
        ref: ProviderObject,
        expiry_s: int = 3600,
    ) -> FileHandle:
        file_id = ref.provider_ref.get("file_id")
        if not file_id:
            raise ProviderUnavailable("Drive get_file: missing file_id")

        def _get() -> Dict[str, Any]:
            service = self._service(account)
            return service.files().get(
                fileId=file_id,
                fields="id, name, size, mimeType, webContentLink, webViewLink",
                **self._drive_kwargs(account),
            ).execute()

        try:
            f = await asyncio.to_thread(_get)
        except HttpError as he:
            raise self._map_http_error(he, "get_file")
        except Exception as e:
            raise ProviderUnavailable(f"Drive get_file failed: {e}") from e
        url = f.get("webContentLink") or f.get("webViewLink") or ""
        if not url:
            raise ProviderUnavailable("Drive get_file: no link available")
        return FileHandle(url=url, name=f.get("name", ""),
                          size_bytes=int(f.get("size") or 0),
                          content_type=f.get("mimeType", ""))

    async def download(self, account: Dict[str, Any], ref: ProviderObject) -> bytes:
        """Stream the file's bytes via get_media (chunked, with the same
        backoff policy as uploads). Used by the migrator + integrity checks."""
        file_id = ref.provider_ref.get("file_id")
        if not file_id:
            raise ProviderUnavailable("Drive download: missing file_id")

        def _dl() -> bytes:
            from googleapiclient.http import MediaIoBaseDownload
            service = self._service(account)
            request = service.files().get_media(fileId=file_id,
                                                supportsAllDrives=True)
            buf = io.BytesIO()
            downloader = MediaIoBaseDownload(buf, request, chunksize=_CHUNK_SIZE)
            done = False
            retries, backoff = 0, 1.0
            while not done:
                try:
                    _status, done = downloader.next_chunk()
                    retries, backoff = 0, 1.0
                except HttpError as he:
                    status = getattr(getattr(he, "resp", None), "status", None)
                    if status in _RETRIABLE_HTTP and retries < _MAX_CHUNK_RETRIES:
                        time.sleep(backoff)
                        retries, backoff = retries + 1, min(backoff * 2, 30)
                        continue
                    raise
                except (ConnectionError, TimeoutError, OSError):
                    if retries < _MAX_CHUNK_RETRIES:
                        time.sleep(backoff)
                        retries, backoff = retries + 1, min(backoff * 2, 30)
                        continue
                    raise
            return buf.getvalue()

        try:
            return await asyncio.to_thread(_dl)
        except HttpError as he:
            raise self._map_http_error(he, "download")
        except Exception as e:
            raise ProviderUnavailable(f"Drive download failed: {e}") from e

    async def delete(self, account: Dict[str, Any], ref: ProviderObject) -> None:
        file_id = ref.provider_ref.get("file_id")
        if not file_id:
            return  # idempotent

        def _del() -> None:
            service = self._service(account)
            try:
                service.files().delete(
                    fileId=file_id, **self._drive_kwargs(account)
                ).execute()
            except HttpError as he:
                if getattr(getattr(he, "resp", None), "status", None) == 404:
                    return  # already gone — idempotent
                raise

        try:
            await asyncio.to_thread(_del)
        except HttpError as he:
            raise self._map_http_error(he, "delete")
        except Exception as e:
            raise ProviderUnavailable(f"Drive delete failed: {e}") from e

    async def list_files(
        self,
        account: Dict[str, Any],
        folder: FolderRef,
        page_token: Optional[str] = None,
    ) -> FileList:
        folder_id = folder.ref.get("folder_id")
        if not folder_id:
            raise StorageError("gdrive list_files: folder ref missing folder_id")

        def _list() -> Dict[str, Any]:
            service = self._service(account)
            return service.files().list(
                q=f"'{folder_id}' in parents and trashed = false",
                fields="nextPageToken, files(id, name, size, mimeType, createdTime)",
                pageSize=200, pageToken=page_token,
                **self._drive_kwargs(account, listing=True),
            ).execute()

        try:
            resp = await asyncio.to_thread(_list)
        except HttpError as he:
            raise self._map_http_error(he, "list_files")
        except Exception as e:
            raise ProviderUnavailable(f"Drive list_files failed: {e}") from e
        files = [{
            "id": f["id"],
            "name": f.get("name", ""),
            "size_bytes": int(f.get("size") or 0),
            "content_type": f.get("mimeType", ""),
            "created_at": f.get("createdTime"),
        } for f in resp.get("files", [])]
        return FileList(files=files, next_page_token=resp.get("nextPageToken"))

    async def quota(self, account: Dict[str, Any]) -> QuotaSnapshot:
        mode = (account or {}).get("credential_mode") or (
            "oauth" if (account or {}).get("credentials") else "service_account"
        )
        if mode == "oauth":
            # My-Drive accounts report REAL numbers via about.get — the hourly
            # job reconciles our committed_bytes counter against these.
            def _about() -> Dict[str, Any]:
                service = self._service(account)
                return service.about().get(fields="storageQuota").execute()

            try:
                sq = (await asyncio.to_thread(_about)).get("storageQuota", {})
                used = int(sq.get("usage") or 0)
                limit = int(sq.get("limit") or (account or {}).get("capacity_bytes") or 0)
                return QuotaSnapshot(used_bytes=used, capacity_bytes=limit,
                                     reported_at=_now_iso())
            except Exception as e:
                raise ProviderUnavailable(f"Drive quota check failed: {e}") from e
        # Shared Drives expose no cheap used-bytes figure; policy capacity +
        # our counter are authoritative.
        capacity = int((account or {}).get("capacity_bytes") or 0)
        used = int((account or {}).get("committed_bytes")
                   or (account or {}).get("used_bytes") or 0)
        return QuotaSnapshot(used_bytes=used, capacity_bytes=capacity, reported_at=_now_iso())

    async def health(self, account: Dict[str, Any]) -> HealthSnapshot:
        def _probe() -> str:
            service = self._service(account)
            drive_id = (account or {}).get("drive_id")
            if drive_id:
                d = service.drives().get(driveId=drive_id, fields="id, name").execute()
                return d.get("name", "")
            about = service.about().get(fields="user/emailAddress").execute()
            return about.get("user", {}).get("emailAddress", "")

        started = _dt.datetime.now(_dt.timezone.utc)
        try:
            label = await asyncio.to_thread(_probe)
            latency = int((_dt.datetime.now(_dt.timezone.utc) - started).total_seconds() * 1000)
            return HealthSnapshot(ok=True, checked_at=_now_iso(), detail=label,
                                  latency_ms=latency)
        except Exception as e:
            return HealthSnapshot(ok=False, checked_at=_now_iso(), detail=str(e))
