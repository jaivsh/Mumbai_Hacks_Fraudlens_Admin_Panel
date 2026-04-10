#!/usr/bin/env python3
"""
Cross-silo federated *round* (GCP): pull two node training exports (GCS or local paths),
merge, fit one global RandomForest, publish to the same model bucket layout as the Fraud API.

This is NOT classical federated learning (no gradient exchange). Each silo is modeled as
uploading an anonymized CSV to a dedicated GCS prefix; only this job reads both and trains.
Banks never send raw rows to each other; orchestrator runs in your VPC / Cloud Run Job.

Env (required):
  FEDERATED_NODE_A_URI   gs://bucket/federated/nodes/bank-a/export.csv  OR  /abs/path/a.csv
  FEDERATED_NODE_B_URI   gs://bucket/federated/nodes/bank-b/export.csv  OR  /abs/path/b.csv

Env (publish — same as fraud API):
  FRAUD_MODEL_GCS_BUCKET
  FRAUD_MODEL_GCS_OBJECT          default in code: fraud-rf/current.pkl
  FRAUD_MODEL_GCS_HISTORY_PREFIX  default: fraud-rf/history

Optional:
  FEDERATED_ROUND_ID   label for audit manifest (default: UTC timestamp)
"""

from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

_APP_DIR = Path(__file__).resolve().parent
if str(_APP_DIR) not in sys.path:
    sys.path.insert(0, str(_APP_DIR))

from gcs_model_store import (  # noqa: E402
    GCSModelConfigError,
    download_uri_to_bytes,
    gcs_dependencies_installed,
    publish_model_artifacts,
    upload_bytes_to_gcs,
)
from train_pipeline import train_from_csv_bytes_list  # noqa: E402


def _load_uri(uri: str) -> bytes:
    u = uri.strip()
    if u.startswith("gs://"):
        if not gcs_dependencies_installed():
            raise SystemExit("google-cloud-storage required for gs:// URIs. pip install google-cloud-storage")
        return download_uri_to_bytes(u)
    p = Path(u).expanduser()
    if not p.is_file():
        raise FileNotFoundError(f"Local training file not found: {p}")
    return p.read_bytes()


def main() -> int:
    node_a = os.environ.get("FEDERATED_NODE_A_URI", "").strip()
    node_b = os.environ.get("FEDERATED_NODE_B_URI", "").strip()
    out_bucket = os.environ.get("FRAUD_MODEL_GCS_BUCKET", "").strip()
    current_object = os.environ.get("FRAUD_MODEL_GCS_OBJECT", "fraud-rf/current.pkl").strip()
    history_prefix = os.environ.get("FRAUD_MODEL_GCS_HISTORY_PREFIX", "fraud-rf/history").strip()
    round_id = os.environ.get("FEDERATED_ROUND_ID", "").strip() or datetime.now(timezone.utc).strftime(
        "%Y%m%dT%H%M%SZ"
    )

    if not node_a or not node_b:
        print(
            "Set FEDERATED_NODE_A_URI and FEDERATED_NODE_B_URI (gs://... or local path).",
            file=sys.stderr,
        )
        return 2
    if not out_bucket:
        print("Set FRAUD_MODEL_GCS_BUCKET for publishing the global model.", file=sys.stderr)
        return 2
    if not gcs_dependencies_installed():
        print("google-cloud-storage required for publishing.", file=sys.stderr)
        return 2

    print(f"[federated] round_id={round_id}")
    print(f"[federated] node_a={node_a}")
    print(f"[federated] node_b={node_b}")

    bytes_a = _load_uri(node_a)
    bytes_b = _load_uri(node_b)

    tmp_dir = Path(tempfile.mkdtemp(prefix="fedagg_"))
    bundle_path = tmp_dir / "bundle.pkl"
    try:
        metrics, merge_stats = train_from_csv_bytes_list(
            [bytes_a, bytes_b], output_path=bundle_path, min_rows=30
        )
    except Exception as e:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        print(f"Training failed: {e}", file=sys.stderr)
        return 1

    version = str(metrics.get("version") or round_id)
    metrics_out = {**{k: v for k, v in metrics.items() if k != "merge"}, "federated_round_id": round_id}
    try:
        uris = publish_model_artifacts(
            bundle_path,
            bucket=out_bucket,
            current_object=current_object,
            history_prefix=history_prefix,
            version=version,
            metrics=metrics_out,
        )
    except GCSModelConfigError as e:
        print(str(e), file=sys.stderr)
        shutil.rmtree(tmp_dir, ignore_errors=True)
        return 1
    except Exception as e:
        print(f"Publish failed: {e}", file=sys.stderr)
        shutil.rmtree(tmp_dir, ignore_errors=True)
        return 1

    round_manifest = {
        "round_id": round_id,
        "node_a_uri": node_a,
        "node_b_uri": node_b,
        "merge": merge_stats,
        "metrics": metrics_out,
        "published": uris,
    }
    manifest_object = (
        current_object.rsplit("/", 1)[0] + "/federated_round_manifest.json"
        if "/" in current_object
        else "federated_round_manifest.json"
    )
    try:
        upload_bytes_to_gcs(
            json.dumps(round_manifest, indent=2).encode("utf-8"),
            out_bucket,
            manifest_object,
            content_type="application/json",
        )
    except Exception as e:
        print(f"Warning: could not write round manifest: {e}", file=sys.stderr)

    shutil.rmtree(tmp_dir, ignore_errors=True)

    print(json.dumps({"ok": True, "round_id": round_id, **uris, "merge": merge_stats}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
