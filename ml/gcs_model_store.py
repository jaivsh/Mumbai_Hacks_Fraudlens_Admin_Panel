"""
Google Cloud Storage helpers for production model artifacts.
Uses Application Default Credentials (Cloud Run service account).
"""

from __future__ import annotations

import io
import json
from pathlib import Path
from typing import Any

import joblib

try:
    from google.cloud import storage as gcs_storage

    _GCS_AVAILABLE = True
except ImportError:
    gcs_storage = None  # type: ignore
    _GCS_AVAILABLE = False


class GCSModelConfigError(RuntimeError):
    pass


def gcs_dependencies_installed() -> bool:
    return _GCS_AVAILABLE


def parse_gs_uri(uri: str) -> tuple[str, str]:
    """Split gs://bucket/object/path into (bucket, object_name)."""
    u = uri.strip()
    if not u.startswith("gs://"):
        raise ValueError(f"Not a gs:// URI: {uri}")
    rest = u[5:]
    slash = rest.find("/")
    if slash < 1 or slash >= len(rest) - 1:
        raise ValueError(f"Invalid gs:// URI (need bucket and object path): {uri}")
    return rest[:slash], rest[slash + 1 :]


def download_bytes_from_gcs(bucket: str, object_name: str) -> bytes:
    if not _GCS_AVAILABLE:
        raise GCSModelConfigError("google-cloud-storage is not installed")
    client = gcs_storage.Client()
    blob = client.bucket(bucket).blob(object_name)
    if not blob.exists():
        raise FileNotFoundError(f"gs://{bucket}/{object_name} not found")
    return blob.download_as_bytes()


def download_uri_to_bytes(uri: str) -> bytes:
    b, o = parse_gs_uri(uri)
    return download_bytes_from_gcs(b, o)


def load_bundle_from_gcs(bucket: str, object_name: str) -> dict[str, Any]:
    data = download_bytes_from_gcs(bucket, object_name)
    return joblib.load(io.BytesIO(data))


def upload_file_to_gcs(local_path: Path, bucket: str, object_name: str) -> str:
    if not _GCS_AVAILABLE:
        raise GCSModelConfigError("google-cloud-storage is not installed")
    client = gcs_storage.Client()
    blob = client.bucket(bucket).blob(object_name)
    blob.upload_from_filename(str(local_path))
    return f"gs://{bucket}/{object_name}"


def upload_bytes_to_gcs(data: bytes, bucket: str, object_name: str, content_type: str | None = None) -> str:
    if not _GCS_AVAILABLE:
        raise GCSModelConfigError("google-cloud-storage is not installed")
    client = gcs_storage.Client()
    blob = client.bucket(bucket).blob(object_name)
    blob.upload_from_string(data, content_type=content_type or "application/octet-stream")
    return f"gs://{bucket}/{object_name}"


def publish_model_artifacts(
    local_pkl_path: Path,
    *,
    bucket: str,
    current_object: str,
    history_prefix: str,
    version: str,
    metrics: dict[str, Any],
) -> dict[str, str]:
    """
    Upload versioned bundle + overwrite current pointer object.
    Writes a small manifest JSON next to current (same dir) for consoles / audits.
    """
    if not _GCS_AVAILABLE:
        raise GCSModelConfigError("google-cloud-storage is not installed")

    hp = history_prefix.strip().strip("/")
    history_prefix_slash = f"{hp}/" if hp else ""
    versioned_object = f"{history_prefix_slash}bundle-{version}.pkl"
    manifest_object = (
        current_object.rsplit("/", 1)[0] + "/manifest.json" if "/" in current_object else "manifest.json"
    )

    uri_versioned = upload_file_to_gcs(local_pkl_path, bucket, versioned_object)
    uri_current = upload_file_to_gcs(local_pkl_path, bucket, current_object)

    manifest = {
        "version": version,
        "current_object": current_object,
        "versioned_object": versioned_object,
        "metrics": metrics,
    }
    upload_bytes_to_gcs(
        json.dumps(manifest, indent=2).encode("utf-8"),
        bucket,
        manifest_object,
        content_type="application/json",
    )

    return {
        "gs_current": uri_current,
        "gs_versioned": uri_versioned,
        "gs_manifest": f"gs://{bucket}/{manifest_object}",
    }
