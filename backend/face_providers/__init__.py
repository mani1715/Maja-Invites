"""
face_providers -- pluggable face-match backend.

    from face_providers import get_face_provider
    provider = get_face_provider()          # env FACE_MATCH_PROVIDER, default "rekognition"
    provider.index_photo_faces(collection_id, s3_key, photo_id)

Phase 1 (this commit): interface + providers only, no call-site rewiring --
importing this package changes no existing behavior.
"""
import os
from typing import Dict

from .base import FaceMatchProvider
from .rekognition import RekognitionProvider
from .self_hosted import SelfHostedProvider

__all__ = ["FaceMatchProvider", "RekognitionProvider", "SelfHostedProvider", "get_face_provider"]

_PROVIDERS = {
    "rekognition": RekognitionProvider,
    "self_hosted": SelfHostedProvider,
}

_instances: Dict[str, FaceMatchProvider] = {}


def get_face_provider() -> FaceMatchProvider:
    """Singleton FaceMatchProvider selected by env FACE_MATCH_PROVIDER
    (default "rekognition"). Raises ValueError for an unknown value."""
    kind = (os.environ.get("FACE_MATCH_PROVIDER") or "rekognition").strip().lower()
    cls = _PROVIDERS.get(kind)
    if cls is None:
        raise ValueError(
            f"Unknown FACE_MATCH_PROVIDER: {kind!r}. Valid options: {sorted(_PROVIDERS)}")
    if kind not in _instances:
        _instances[kind] = cls()
    return _instances[kind]
