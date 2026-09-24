"""
Self-test for the pluggable storage providers (charter surface).

Runnable standalone (no AWS / Google / DB needed):

    cd backend && python -m tests.test_storage_providers

Verifies:
  1. Factory dispatch (s3 / r2 → S3Provider; gdrive advertised).
  2. Contract conformance: upload/delete/get_file/create_folder/list_files
     + quota/health present on every provider.
  3. S3Provider: folders-as-prefixes, delegation to aws_service (monkeypatched),
     meta → object tags, signed get_file, paged list_files, idempotent delete.
  4. Typed failures surface as ProviderUnavailable.
  5. Credential crypto round-trip (Fernet) + clear error when key missing.
"""
from __future__ import annotations

import asyncio
import os
import sys
import types
from typing import Any, Dict


def _install_fake_aws() -> Dict[str, Any]:
    """Inject a fake `aws_service` so importing s3_provider needs no boto3."""
    calls: Dict[str, Any] = {"uploaded": None, "deleted": None, "signed": None,
                             "listed": None}

    fake = types.ModuleType("aws_service")
    fake.bucket = lambda: "test-bucket"

    def upload_bytes(key, data, content_type, tags=None):
        calls["uploaded"] = {"key": key, "size": len(data),
                             "content_type": content_type, "tags": tags}
        return {"bucket": "test-bucket", "key": key, "size": len(data)}
    fake.upload_bytes = upload_bytes

    def generate_signed_url(key, expiry_seconds=3600):
        calls["signed"] = {"key": key, "expiry": expiry_seconds}
        return f"https://cdn.example/{key}?exp={expiry_seconds}"
    fake.generate_signed_url = generate_signed_url

    class _S3:
        def delete_object(self, Bucket, Key):
            calls["deleted"] = {"Bucket": Bucket, "Key": Key}

        def list_objects_v2(self, **kw):
            calls["listed"] = kw
            return {"Contents": [{"Key": f"{kw['Prefix']}a.jpg", "Size": 5}],
                    "NextContinuationToken": "tok2"}
    fake.s3 = lambda: _S3()
    fake.healthcheck = lambda: {"ok": True}

    sys.modules["aws_service"] = fake
    return calls


def _check(cond: bool, msg: str) -> None:
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


async def _run() -> None:
    calls = _install_fake_aws()

    import storage
    from storage import (StorageProvider, ProviderObject, FolderRef, FileHandle,
                         FileList, QuotaSnapshot, HealthSnapshot, ProviderUnavailable)
    from storage.s3_provider import S3Provider

    print("1. package + factory")
    _check(storage.get_provider("s3").__class__.__name__ == "S3Provider",
           "get_provider('s3') -> S3Provider")
    _check(storage.get_provider("r2").__class__.__name__ == "S3Provider",
           "get_provider('r2') -> S3Provider (R2 = S3 API)")
    _check("gdrive" in storage.available_providers(),
           "gdrive advertised by available_providers()")

    print("2. contract conformance (charter verbs)")
    p = storage.get_provider("s3")
    _check(isinstance(p, StorageProvider), "s3 is a StorageProvider")
    for m in ("upload", "delete", "get_file", "create_folder", "list_files",
              "quota", "health"):
        _check(callable(getattr(p, m, None)), f"s3.{m} present")

    print("3. S3Provider behavior")
    s3 = S3Provider()
    account = {"key_prefix": "pool1", "capacity_bytes": 100, "committed_bytes": 10}

    top = await s3.create_folder(account, "Photographers")
    ph = await s3.create_folder(account, "Studio One", top)
    qr = await s3.create_folder(account, "QR_Photos", ph)
    _check(qr.ref["prefix"] == "pool1/Photographers/Studio One/QR_Photos",
           "folders compose as prefixes (no API calls)")

    obj = await s3.upload(account, qr, "photo_0001.jpg", b"xxxxx", "image/jpeg",
                          meta={"event_id": "e1", "photographer_id": "ph1"})
    _check(isinstance(obj, ProviderObject), "upload returns ProviderObject")
    _check(obj.provider_ref["key"].endswith("QR_Photos/photo_0001.jpg"),
           "file lands inside the folder prefix")
    _check(calls["uploaded"]["tags"] == {"event_id": "e1", "photographer_id": "ph1"},
           "meta -> S3 object tags")

    fh = await s3.get_file(account, obj, expiry_s=120)
    _check(isinstance(fh, FileHandle) and "exp=120" in fh.url and fh.expires_at,
           "get_file returns a time-boxed handle")

    lst = await s3.list_files(account, qr, page_token=None)
    _check(isinstance(lst, FileList) and lst.files[0]["name"] == "a.jpg"
           and lst.next_page_token == "tok2", "list_files normalizes + paginates")

    await s3.delete(account, obj)
    _check(calls["deleted"]["Key"] == obj.provider_ref["key"], "delete targets full key")
    await s3.delete(account, ProviderObject(provider_ref={}))  # no key
    _check(True, "delete without key is a no-op (idempotent)")

    q = await s3.quota(account)
    _check(isinstance(q, QuotaSnapshot) and q.remaining_bytes == 90,
           "quota echoes orchestrator counters")
    h = await s3.health(account)
    _check(isinstance(h, HealthSnapshot) and h.ok, "health ok via aws_service.healthcheck")

    print("4. failure -> ProviderUnavailable")
    def _boom(*a, **k):
        raise RuntimeError("network down")
    sys.modules["aws_service"].upload_bytes = _boom
    raised = False
    try:
        await s3.upload(account, qr, "x.jpg", b"y", "image/jpeg")
    except ProviderUnavailable:
        raised = True
    _check(raised, "backend error mapped to ProviderUnavailable")

    print("5. credential crypto")
    from storage.crypto import encrypt_credentials, decrypt_credentials
    from storage.base import StorageError
    os.environ.pop("STORAGE_CRED_KEY", None)
    missing = False
    try:
        encrypt_credentials({"a": 1})
    except StorageError as e:
        missing = "STORAGE_CRED_KEY" in str(e)
    _check(missing, "missing key -> clear StorageError")
    from cryptography.fernet import Fernet
    os.environ["STORAGE_CRED_KEY"] = Fernet.generate_key().decode()
    secret = {"refresh_token": "r-1", "client_id": "c", "client_secret": "s"}
    token = encrypt_credentials(secret)
    _check(token != str(secret) and "r-1" not in token, "ciphertext leaks nothing")
    _check(decrypt_credentials(token) == secret, "round-trip decrypt")

    print("\nALL STORAGE PROVIDER CHECKS PASSED")


if __name__ == "__main__":
    asyncio.run(_run())
