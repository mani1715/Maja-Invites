"""
face_providers.base -- the face-match provider contract.
==========================================================

Every face-matching backend implements `FaceMatchProvider`. Call sites (wired
in a later lane) will only ever touch this interface, never a vendor SDK
directly, so swapping Rekognition for a self-hosted model is a config change.

Methods are **sync** (not async) -- they mirror the existing `aws_service`
wrapper signatures exactly, which today's call sites invoke via
`asyncio.to_thread(...)`. Concrete providers keep doing the same.

ExternalImageId == photo_id contract
-------------------------------------
Rekognition's `ExternalImageId` field IS the caller's `photo_id`: indexing
passes `external_image_id=photo_id`, and search reads it back off each face
match. There is no local join table -- the provider itself is the mapping.

Any provider implementation MUST either:
  * pass the caller-supplied external id straight through to the backend and
    read it back on search (as Rekognition does), or
  * maintain its own internal face_id -> external_id map and translate.

Either way, `search_by_selfie()` matches must come back keyed by the original
`photo_id`, never a provider-internal face id.
"""
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional


class FaceMatchProvider(ABC):
    @abstractmethod
    def create_collection(self, collection_id: str) -> Dict[str, Any]:
        """Create a face collection. Returns {"created": bool, ...}."""
        raise NotImplementedError

    @abstractmethod
    def delete_collection(self, collection_id: str) -> bool:
        """Delete a face collection. Returns True iff it existed and was deleted."""
        raise NotImplementedError

    @abstractmethod
    def index_photo_faces(self, collection_id: str, s3_key: str,
                           external_image_id: str, max_faces: int = 15) -> Dict[str, Any]:
        """Detect + index faces in a stored photo under `external_image_id`
        (== photo_id). Returns {"ok": bool, "face_count": int, "face_ids": [...]}."""
        raise NotImplementedError

    @abstractmethod
    def search_by_selfie(self, collection_id: str, selfie_bytes: bytes,
                          threshold: Optional[float] = None,
                          max_faces: int = 100) -> Dict[str, Any]:
        """Search a collection for faces matching a selfie. Returns
        {"ok": bool, "match_count": int, "matches": [{"photo_id", "similarity"}, ...]}."""
        raise NotImplementedError

    @abstractmethod
    def delete_faces(self, collection_id: str, face_ids: List[str]) -> Dict[str, Any]:
        """Remove indexed faces by their provider face ids. Returns
        {"ok": bool, ...}."""
        raise NotImplementedError

    def list_face_ids_for_image(self, collection_id: str, external_image_id: str) -> List[str]:
        """Best-effort: the provider face ids currently indexed under
        `external_image_id` (== photo_id). Used to purge orphaned vectors left
        by a crash between a successful index and its DB write, before a retry
        re-indexes the same photo. A provider that cannot enumerate returns [] —
        the caller still deletes any face ids it persisted, so this is additive
        hardening, not required for correctness. Not abstract: providers whose
        re-index is already idempotent by external id keep the default."""
        return []

    @abstractmethod
    def health_check(self) -> Dict[str, Any]:
        """Cheap liveness/config probe. Returns a status dict."""
        raise NotImplementedError
