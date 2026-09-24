"""
storage.base — the provider contract (V1 charter surface).
===========================================================

Every storage backend implements `StorageProvider`. Business logic (and the
orchestrator) only ever touches these types, never a vendor SDK, so switching
Google Drive → S3 → R2 → Supabase is a configuration change with no call-site
edits (charter §MIGRATION READINESS).

Charter verbs: upload() · delete() · get_file() · create_folder() · list_files()
plus quota() / health() for the monitoring loops.

Design notes
------------
* Providers are **stateless**. All per-account state (credentials, drive_id,
  bucket, ...) travels in the `account` dict argument. Credentials arrive
  ALREADY DECRYPTED (the orchestrator owns encryption — see storage.crypto).
* All verbs are `async`. Blocking vendor SDKs (googleapiclient, boto3) must be
  wrapped in `asyncio.to_thread` by the concrete provider — mirroring the
  existing `drive_archive._do_archive` pattern.
* Folders are addressed by `FolderRef` (opaque IDs / prefixes) — NEVER by name
  (charter rule: never depend on folder names as identifiers).
* Typed errors: the orchestrator maps `ProviderQuotaExceeded` → switch drive,
  `ProviderUnavailable` → mark degraded + failover.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


# --------------------------------------------------------------------------- #
# Typed values
# --------------------------------------------------------------------------- #
@dataclass
class FolderRef:
    """Opaque handle to a provider folder, persisted verbatim in
    `db.storage_folders.provider_ref`.

    * gdrive: {"folder_id": "1AbC...", "drive_id": "..."?}
    * S3/R2 : {"prefix": "Photographers/xyz/Events/ev1/QR_Photos"}
    """
    ref: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return dict(self.ref)


@dataclass
class ProviderObject:
    """Opaque handle to a stored file, persisted verbatim in
    `db.storage_files.provider_ref`.

    * gdrive: {"file_id": "...", "folder_id": "...", "drive_id": "..."?}
    * S3/R2 : {"bucket": "...", "key": "..."}
    """
    provider_ref: Dict[str, Any]
    size_bytes: int = 0
    content_type: str = "application/octet-stream"
    extra: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "provider_ref": self.provider_ref,
            "size_bytes": self.size_bytes,
            "content_type": self.content_type,
            "extra": self.extra,
        }


@dataclass
class FileHandle:
    """Download handle returned by get_file(). `url` is time-boxed where the
    provider supports it (S3 signed URL); for Drive it is the authenticated
    content link."""
    url: str
    name: str = ""
    size_bytes: int = 0
    content_type: str = ""
    expires_at: Optional[str] = None  # ISO-8601, None = provider-managed


@dataclass
class FileList:
    """One page of a folder listing. `files` entries are normalized dicts:
    {"id", "name", "size_bytes", "content_type", "created_at"}."""
    files: List[Dict[str, Any]]
    next_page_token: Optional[str] = None


@dataclass
class QuotaSnapshot:
    """Point-in-time storage accounting for one account, as reported by the
    provider itself (reconciled against our running counter — design §7)."""
    used_bytes: int
    capacity_bytes: int
    reported_at: str  # ISO-8601 UTC

    @property
    def remaining_bytes(self) -> int:
        return max(0, self.capacity_bytes - self.used_bytes)

    @property
    def used_pct(self) -> float:
        return round((self.used_bytes / self.capacity_bytes) * 100, 2) if self.capacity_bytes else 0.0


@dataclass
class HealthSnapshot:
    """Result of a cheap authed liveness probe (hourly health job)."""
    ok: bool
    checked_at: str          # ISO-8601 UTC
    detail: str = ""         # human-readable reason when not ok
    latency_ms: Optional[int] = None


# --------------------------------------------------------------------------- #
# Typed errors
# --------------------------------------------------------------------------- #
class StorageError(Exception):
    """Base class for all storage-layer errors."""


class ProviderUnavailable(StorageError):
    """Backend unreachable / auth failed / 5xx — orchestrator fails the
    account over to the next candidate (charter failure case 3)."""


class ProviderQuotaExceeded(StorageError):
    """Backend rejected the write for lack of space — orchestrator marks the
    account full and switches drives (charter failure case 1)."""


# --------------------------------------------------------------------------- #
# The contract
# --------------------------------------------------------------------------- #
class StorageProvider(ABC):
    #: discriminator stored on each account row ("s3" | "gdrive" | ...)
    kind: str = "abstract"

    @abstractmethod
    async def upload(
        self,
        account: Dict[str, Any],
        folder: FolderRef,
        filename: str,
        data: bytes,
        content_type: str,
        meta: Optional[Dict[str, Any]] = None,
    ) -> ProviderObject:
        """Store `data` as `filename` inside `folder`. Must be resilient:
        resumable / chunked with internal retry where the backend supports it
        (charter failure cases 4 & 7). Raises `ProviderQuotaExceeded` or
        `ProviderUnavailable`."""
        raise NotImplementedError

    @abstractmethod
    async def delete(self, account: Dict[str, Any], ref: ProviderObject) -> None:
        """Delete a previously stored object. Idempotent: deleting an
        already-absent object must not raise."""
        raise NotImplementedError

    @abstractmethod
    async def get_file(
        self,
        account: Dict[str, Any],
        ref: ProviderObject,
        expiry_s: int = 3600,
    ) -> FileHandle:
        """Return a download handle for a previously stored object."""
        raise NotImplementedError

    async def download(self, account: Dict[str, Any], ref: ProviderObject) -> bytes:
        """Return the raw bytes of a stored object (server-side — used by the
        migrator and integrity verification; `get_file` links are for end-user
        delivery and may not be machine-fetchable). Concrete providers override
        this; the default refuses loudly."""
        raise StorageError(f"{self.kind} provider does not implement download()")

    @abstractmethod
    async def create_folder(
        self,
        account: Dict[str, Any],
        name: str,
        parent: Optional[FolderRef] = None,
    ) -> FolderRef:
        """Create (or find-or-create) a folder under `parent` (account root
        when None). Returns its opaque ref. Called only at provisioning time —
        never on the upload hot path (folder IDs are cached in the DB)."""
        raise NotImplementedError

    @abstractmethod
    async def list_files(
        self,
        account: Dict[str, Any],
        folder: FolderRef,
        page_token: Optional[str] = None,
    ) -> FileList:
        """List one page of files inside `folder` (reconciliation / audits;
        normal reads come from `db.storage_files`)."""
        raise NotImplementedError

    @abstractmethod
    async def quota(self, account: Dict[str, Any]) -> QuotaSnapshot:
        """The provider's own view of used/total bytes for this account."""
        raise NotImplementedError

    @abstractmethod
    async def health(self, account: Dict[str, Any]) -> HealthSnapshot:
        """Cheap authed liveness probe."""
        raise NotImplementedError
