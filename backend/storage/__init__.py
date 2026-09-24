"""
MAJA Invites — pluggable storage layer.
=======================================

A provider-based abstraction so a pool of storage accounts (Google Workspace
Shared Drives today; AWS S3 / Cloudflare R2 / Supabase later) can back platform
uploads with automatic account selection, quota tracking, health monitoring and
failover — **without any business-logic call site importing a vendor SDK.**

See `MULTI_DRIVE_STORAGE_DESIGN.md` at the repo root for the full design and the
production-readiness review.

Phase 1 (this commit) ships the interface + two providers with **no wiring into
`server.py`** — importing this package changes no existing behavior.

    from storage import StorageProvider, get_provider
    prov = get_provider("s3")            # or "gdrive"
    obj  = await prov.put(account, key, data, "image/jpeg", meta={})
"""
from __future__ import annotations

from .base import (
    StorageProvider,
    ProviderObject,
    FolderRef,
    FileHandle,
    FileList,
    QuotaSnapshot,
    HealthSnapshot,
    StorageError,
    ProviderUnavailable,
    ProviderQuotaExceeded,
)

__all__ = [
    "StorageProvider",
    "ProviderObject",
    "FolderRef",
    "FileHandle",
    "FileList",
    "QuotaSnapshot",
    "HealthSnapshot",
    "StorageError",
    "ProviderUnavailable",
    "ProviderQuotaExceeded",
    "StorageOrchestrator",
    "get_provider",
    "available_providers",
]


def __getattr__(name: str):
    # Lazy so `import storage` never drags in orchestrator deps unnecessarily.
    if name == "StorageOrchestrator":
        from .orchestrator import StorageOrchestrator
        return StorageOrchestrator
    raise AttributeError(name)


def get_provider(kind: str) -> StorageProvider:
    """Return a provider instance for a `kind` discriminator ("s3" | "gdrive").

    Providers are cheap, stateless wrappers (all account state lives in the
    `account` dict passed per call), so a fresh instance per lookup is fine.
    Imports are lazy so a missing optional SDK for one provider never breaks
    the others.
    """
    k = (kind or "").strip().lower()
    if k in ("s3", "aws", "r2"):
        # R2 is S3-API-compatible; the same provider serves both, differing
        # only by the endpoint configured in aws_service / env.
        from .s3_provider import S3Provider
        return S3Provider()
    if k in ("gdrive", "drive", "google"):
        from .gdrive_provider import GoogleDriveProvider
        return GoogleDriveProvider()
    raise StorageError(f"Unknown storage provider kind: {kind!r}")


def available_providers() -> list[str]:
    """Kinds this build knows how to construct."""
    return ["s3", "gdrive"]
