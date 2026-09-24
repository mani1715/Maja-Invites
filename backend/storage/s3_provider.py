"""
storage.s3_provider — S3 / Cloudflare R2 backend (charter surface).
===================================================================

Thin async adapter over the existing, battle-tested `aws_service` helpers.
"Folders" on S3 are key prefixes: `create_folder` is a pure ref computation
(zero API calls) and `FolderRef.ref = {"prefix": "..."}`.

R2 note: Cloudflare R2 speaks the S3 API — pointing `aws_service` at an R2
endpoint makes this same provider serve R2, hence `get_provider("r2")` returns
an `S3Provider` (charter: Future R2Provider).

`account` dict fields used:
    bucket         : optional per-account bucket override (defaults to global
                     AWS_S3_BUCKET via aws_service.bucket()).
    key_prefix     : optional prefix namespacing this account's objects.
    capacity_bytes : logical cap the orchestrator enforces (S3/R2 have no hard
                     quota, so capacity is policy, not a provider limit).
    used_bytes/committed_bytes : orchestrator counters echoed by quota().
"""
from __future__ import annotations

import asyncio
import datetime as _dt
from typing import Any, Dict, Optional

import aws_service
from .base import (
    StorageProvider,
    ProviderObject,
    FolderRef,
    FileHandle,
    FileList,
    QuotaSnapshot,
    HealthSnapshot,
    ProviderUnavailable,
)


def _now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat()


class S3Provider(StorageProvider):
    kind = "s3"

    # ---------------- helpers ----------------
    @staticmethod
    def _bucket(account: Dict[str, Any]) -> str:
        return (account or {}).get("bucket") or aws_service.bucket()

    @staticmethod
    def _root_prefix(account: Dict[str, Any]) -> str:
        return ((account or {}).get("key_prefix") or "").strip("/")

    # ---------------- charter verbs ----------------
    async def create_folder(
        self,
        account: Dict[str, Any],
        name: str,
        parent: Optional[FolderRef] = None,
    ) -> FolderRef:
        # S3 has no real folders — a folder is a prefix. No API call needed.
        base = (parent.ref.get("prefix", "") if parent else self._root_prefix(account)).strip("/")
        safe = name.strip("/").replace("\\", "-")
        prefix = f"{base}/{safe}" if base else safe
        return FolderRef(ref={"prefix": prefix})

    async def upload(
        self,
        account: Dict[str, Any],
        folder: FolderRef,
        filename: str,
        data: bytes,
        content_type: str,
        meta: Optional[Dict[str, Any]] = None,
    ) -> ProviderObject:
        prefix = (folder.ref.get("prefix") or "").strip("/")
        key = f"{prefix}/{filename}" if prefix else filename
        tags = {}
        for k in ("event_id", "photographer_id"):
            v = (meta or {}).get(k)
            if v:
                tags[k] = str(v)
        try:
            # upload_bytes is blocking (boto3) → off the event loop.
            await asyncio.to_thread(
                aws_service.upload_bytes, key, data,
                content_type or "application/octet-stream", tags,
            )
        except Exception as e:
            raise ProviderUnavailable(f"S3 upload failed: {e}") from e
        return ProviderObject(
            provider_ref={"bucket": self._bucket(account), "key": key},
            size_bytes=len(data),
            content_type=content_type or "application/octet-stream",
        )

    async def get_file(
        self,
        account: Dict[str, Any],
        ref: ProviderObject,
        expiry_s: int = 3600,
    ) -> FileHandle:
        key = ref.provider_ref.get("key")
        if not key:
            raise ProviderUnavailable("S3 get_file: missing key in provider_ref")
        try:
            url = await asyncio.to_thread(aws_service.generate_signed_url, key, expiry_s)
        except Exception as e:
            raise ProviderUnavailable(f"S3 get_file failed: {e}") from e
        expires = (_dt.datetime.now(_dt.timezone.utc)
                   + _dt.timedelta(seconds=expiry_s)).isoformat()
        return FileHandle(url=url, name=key.rsplit("/", 1)[-1],
                          size_bytes=ref.size_bytes,
                          content_type=ref.content_type, expires_at=expires)

    async def download(self, account: Dict[str, Any], ref: ProviderObject) -> bytes:
        key = ref.provider_ref.get("key")
        if not key:
            raise ProviderUnavailable("S3 download: missing key")
        bkt = ref.provider_ref.get("bucket") or self._bucket(account)

        def _get() -> bytes:
            return aws_service.s3().get_object(Bucket=bkt, Key=key)["Body"].read()

        try:
            return await asyncio.to_thread(_get)
        except Exception as e:
            raise ProviderUnavailable(f"S3 download failed: {e}") from e

    async def delete(self, account: Dict[str, Any], ref: ProviderObject) -> None:
        key = ref.provider_ref.get("key")
        if not key:
            return  # idempotent
        bkt = ref.provider_ref.get("bucket") or self._bucket(account)

        def _del() -> None:
            aws_service.s3().delete_object(Bucket=bkt, Key=key)

        try:
            await asyncio.to_thread(_del)
        except Exception as e:
            raise ProviderUnavailable(f"S3 delete failed: {e}") from e

    async def list_files(
        self,
        account: Dict[str, Any],
        folder: FolderRef,
        page_token: Optional[str] = None,
    ) -> FileList:
        prefix = (folder.ref.get("prefix") or "").strip("/")
        bkt = self._bucket(account)

        def _list() -> Dict[str, Any]:
            kwargs: Dict[str, Any] = {
                "Bucket": bkt,
                "Prefix": f"{prefix}/" if prefix else "",
                "MaxKeys": 200,
            }
            if page_token:
                kwargs["ContinuationToken"] = page_token
            return aws_service.s3().list_objects_v2(**kwargs)

        try:
            resp = await asyncio.to_thread(_list)
        except Exception as e:
            raise ProviderUnavailable(f"S3 list_files failed: {e}") from e
        files = [{
            "id": o["Key"],
            "name": o["Key"].rsplit("/", 1)[-1],
            "size_bytes": int(o.get("Size", 0)),
            "content_type": "",
            "created_at": (o.get("LastModified").isoformat()
                           if o.get("LastModified") else None),
        } for o in (resp.get("Contents") or [])]
        return FileList(files=files,
                        next_page_token=resp.get("NextContinuationToken"))

    async def quota(self, account: Dict[str, Any]) -> QuotaSnapshot:
        # S3/R2 expose no cheap per-account used-bytes call and no hard cap; the
        # orchestrator's counters are authoritative and echoed back here.
        capacity = int((account or {}).get("capacity_bytes") or 0)
        used = int((account or {}).get("committed_bytes")
                   or (account or {}).get("used_bytes") or 0)
        return QuotaSnapshot(used_bytes=used, capacity_bytes=capacity, reported_at=_now_iso())

    async def health(self, account: Dict[str, Any]) -> HealthSnapshot:
        try:
            hc = await asyncio.to_thread(aws_service.healthcheck)
            ok = bool(hc.get("ok", hc.get("configured", False)))
            return HealthSnapshot(ok=ok, checked_at=_now_iso(),
                                  detail="" if ok else str(hc))
        except Exception as e:
            return HealthSnapshot(ok=False, checked_at=_now_iso(), detail=str(e))
