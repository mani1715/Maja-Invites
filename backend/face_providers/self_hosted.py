"""
face_providers.self_hosted -- placeholder for a self-hosted face-match model.

Not implemented: a self-hosted equivalent (e.g. InsightFace/ArcFace) needs a
commercially licensed model before it can ship. Every method raises until
that's in place.
"""
from typing import Any, Dict, List, Optional

from .base import FaceMatchProvider

_MSG = ("Self-hosted face provider requires a commercially licensed model; "
        "see docs/ARCHITECTURE_MIGRATION_MAP.md section on provider migration")


class SelfHostedProvider(FaceMatchProvider):
    def create_collection(self, collection_id: str) -> Dict[str, Any]:
        raise NotImplementedError(_MSG)

    def delete_collection(self, collection_id: str) -> bool:
        raise NotImplementedError(_MSG)

    def index_photo_faces(self, collection_id: str, s3_key: str,
                           external_image_id: str, max_faces: int = 15) -> Dict[str, Any]:
        raise NotImplementedError(_MSG)

    def search_by_selfie(self, collection_id: str, selfie_bytes: bytes,
                          threshold: Optional[float] = None,
                          max_faces: int = 100) -> Dict[str, Any]:
        raise NotImplementedError(_MSG)

    def delete_faces(self, collection_id: str, face_ids: List[str]) -> Dict[str, Any]:
        raise NotImplementedError(_MSG)

    def health_check(self) -> Dict[str, Any]:
        raise NotImplementedError(_MSG)
