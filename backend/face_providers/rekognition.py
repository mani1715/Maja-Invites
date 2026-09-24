"""
face_providers.rekognition -- AWS Rekognition backend.

Thin delegation to the existing, battle-tested `aws_service` wrappers -- no
boto3 logic is duplicated here. `delete_faces` is the one exception: today it
lives as a raw inline call (gallery_features.py), so it's implemented here
directly against the `aws_service.rekognition()` client, using the same
error-swallowing style as `aws_service.delete_face_collection`.
"""
from typing import Any, Dict, List, Optional

from botocore.exceptions import ClientError

import aws_service
from .base import FaceMatchProvider


class RekognitionProvider(FaceMatchProvider):
    def create_collection(self, collection_id: str) -> Dict[str, Any]:
        return aws_service.create_face_collection(collection_id)

    def delete_collection(self, collection_id: str) -> bool:
        return aws_service.delete_face_collection(collection_id)

    def index_photo_faces(self, collection_id: str, s3_key: str,
                           external_image_id: str, max_faces: int = 15) -> Dict[str, Any]:
        return aws_service.index_photo_faces(collection_id, s3_key, external_image_id,
                                              max_faces=max_faces)

    def search_by_selfie(self, collection_id: str, selfie_bytes: bytes,
                          threshold: Optional[float] = None,
                          max_faces: int = 100) -> Dict[str, Any]:
        return aws_service.search_faces_by_selfie(collection_id, selfie_bytes,
                                                    threshold=threshold, max_faces=max_faces)

    def delete_faces(self, collection_id: str, face_ids: List[str]) -> Dict[str, Any]:
        if not face_ids:
            return {"ok": True, "deleted_count": 0}
        try:
            resp = aws_service.rekognition().delete_faces(
                CollectionId=collection_id, FaceIds=face_ids)
            return {"ok": True, "deleted_count": len(resp.get("DeletedFaces") or [])}
        except aws_service.rekognition().exceptions.ResourceNotFoundException:
            return {"ok": False, "error": "collection_not_found"}
        except ClientError as e:
            aws_service.logger.error("delete_faces error: %s", e)
            return {"ok": False, "error": str(e)[:200]}

    def list_face_ids_for_image(self, collection_id: str, external_image_id: str) -> List[str]:
        return aws_service.list_face_ids_for_image(collection_id, external_image_id)

    def health_check(self) -> Dict[str, Any]:
        return aws_service.healthcheck()
