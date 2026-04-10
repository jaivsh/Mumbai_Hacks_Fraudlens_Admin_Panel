"""
Fraud scoring API aligned with ml/model_training (no TRN_STATUS/RESPONSE_CODE leakage).

Production: set FRAUD_MODEL_GCS_BUCKET (+ object path) to load/serve from GCS (Cloud Run).
Local: omit GCS env; place random_forest_model.pkl next to this file.
"""

from __future__ import annotations

import os
import shutil
import sys
import tempfile
import warnings
from pathlib import Path
from typing import List, Optional

import joblib
import pandas as pd
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

warnings.filterwarnings("ignore")

_APP_DIR = Path(__file__).resolve().parent
if str(_APP_DIR) not in sys.path:
    sys.path.insert(0, str(_APP_DIR))

from config import (  # noqa: E402
    MAX_AMOUNT_SUM_1H,
    MAX_CONSECUTIVE_FAILURES,
    MAX_DEVICE_USER_COUNT,
    MAX_FAILED_TXN_COUNT_24H,
    MAX_TXN_COUNT_1H,
)
from features import build_feature_frame  # noqa: E402
from train_pipeline import train_from_csv_bytes, train_from_csv_bytes_list  # noqa: E402

LOCAL_MODEL_FILENAME = "random_forest_model.pkl"
TRAIN_API_KEY = os.environ.get("TRAIN_API_KEY", "").strip()
TRAIN_MAX_UPLOAD_BYTES = int(os.environ.get("TRAIN_MAX_UPLOAD_BYTES", str(25 * 1024 * 1024)))

FRAUD_MODEL_GCS_BUCKET = os.environ.get("FRAUD_MODEL_GCS_BUCKET", "").strip()
FRAUD_MODEL_GCS_OBJECT = os.environ.get("FRAUD_MODEL_GCS_OBJECT", "fraud-rf/current.pkl").strip()
FRAUD_MODEL_GCS_HISTORY_PREFIX = os.environ.get("FRAUD_MODEL_GCS_HISTORY_PREFIX", "fraud-rf/history").strip()


def _resolve_model_path() -> Path:
    d = Path(__file__).resolve().parent
    return (d / LOCAL_MODEL_FILENAME).resolve()


MODEL_PATH = _resolve_model_path()
_using_gcs = bool(FRAUD_MODEL_GCS_BUCKET)

app = FastAPI(title="FraudLens Fraud Detection API", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_model_bundle = None


def _model_display_uri() -> str:
    if _using_gcs:
        return f"gs://{FRAUD_MODEL_GCS_BUCKET}/{FRAUD_MODEL_GCS_OBJECT}"
    return str(MODEL_PATH.resolve())


def get_bundle():
    global _model_bundle
    if _model_bundle is None:
        if _using_gcs:
            from gcs_model_store import GCSModelConfigError, gcs_dependencies_installed, load_bundle_from_gcs

            if not gcs_dependencies_installed():
                raise FileNotFoundError(
                    "FRAUD_MODEL_GCS_BUCKET is set but google-cloud-storage is not installed"
                )
            try:
                _model_bundle = load_bundle_from_gcs(FRAUD_MODEL_GCS_BUCKET, FRAUD_MODEL_GCS_OBJECT)
            except GCSModelConfigError as e:
                raise FileNotFoundError(str(e)) from e
        else:
            if not MODEL_PATH.is_file():
                raise FileNotFoundError(f"Model bundle not found: {MODEL_PATH}")
            _model_bundle = joblib.load(MODEL_PATH)
    return _model_bundle


def reload_bundle():
    global _model_bundle
    _model_bundle = None
    return get_bundle()


@app.on_event("startup")
def startup_load_model():
    try:
        get_bundle()
    except FileNotFoundError as e:
        print(str(e))
    except Exception as e:
        print(f"Model startup load failed: {e}")


class TransactionData(BaseModel):
    txn_id: str
    AMOUNT: float = Field(..., description="Transaction amount")
    amount_sum_1h: float = Field(
        ...,
        ge=0,
        description="Total sent amount from payer VPA in last 1h (app/server computed)",
    )
    TXN_TIMESTAMP: str = Field(..., description="ISO or parseable datetime string")
    PAYER_VPA: str
    BENEFICIARY_VPA: str
    PAYER_IFSC: str
    BENEFICIARY_IFSC: str
    INITIATION_MODE: str = "APP"
    TRANSACTION_TYPE: str = "P2P"
    device_user_count: int = Field(..., ge=1, description="Distinct payers on device (app-computed)")
    txn_count_1h: int = Field(..., ge=1, description="Txns in last 1h on device (clipped to training cap server-side)")
    failed_txn_count_24h: int = Field(
        0, ge=0, description="Non-success responses in prior 24h for payer/device (app-computed)"
    )
    consecutive_failures: int = Field(
        0, ge=0, description="Back-to-back failures before this attempt (app-computed)"
    )


def _rows_to_df(transactions: List[TransactionData]) -> pd.DataFrame:
    rows = []
    for t in transactions:
        rows.append(
            {
                "TXN_TIMESTAMP": t.TXN_TIMESTAMP,
                "AMOUNT": t.AMOUNT,
                "amount_sum_1h": t.amount_sum_1h,
                "PAYER_VPA": t.PAYER_VPA,
                "BENEFICIARY_VPA": t.BENEFICIARY_VPA,
                "PAYER_IFSC": t.PAYER_IFSC,
                "BENEFICIARY_IFSC": t.BENEFICIARY_IFSC,
                "INITIATION_MODE": t.INITIATION_MODE,
                "TRANSACTION_TYPE": t.TRANSACTION_TYPE,
                "device_user_count": t.device_user_count,
                "txn_count_1h": t.txn_count_1h,
                "failed_txn_count_24h": t.failed_txn_count_24h,
                "consecutive_failures": t.consecutive_failures,
            }
        )
    df = pd.DataFrame(rows)
    df["device_user_count"] = df["device_user_count"].clip(lower=1, upper=MAX_DEVICE_USER_COUNT).astype(int)
    df["txn_count_1h"] = df["txn_count_1h"].clip(lower=1, upper=MAX_TXN_COUNT_1H).astype(int)
    df["amount_sum_1h"] = df["amount_sum_1h"].clip(lower=0.0, upper=MAX_AMOUNT_SUM_1H).astype(float)
    df["failed_txn_count_24h"] = df["failed_txn_count_24h"].clip(lower=0, upper=MAX_FAILED_TXN_COUNT_24H).astype(int)
    df["consecutive_failures"] = df["consecutive_failures"].clip(lower=0, upper=MAX_CONSECUTIVE_FAILURES).astype(int)
    return df


def preprocess_batch(transactions: List[TransactionData]):
    bundle = get_bundle()
    model = bundle["model"]
    bene_enc = bundle["beneficiary_encoder"]
    df = _rows_to_df(transactions)
    features, _ = build_feature_frame(df, beneficiary_encoder=bene_enc)
    return model, features


def _risk_level(probability: float) -> str:
    if probability >= 0.6:
        return "HIGH"
    if probability > 0.3:
        return "MEDIUM"
    return "LOW"


@app.post("/predict")
async def predict_fraud(transaction: TransactionData):
    try:
        model, features = preprocess_batch([transaction])
        prediction = int(model.predict(features)[0])
        probability = float(model.predict_proba(features)[0][1])
        return {
            "txn_id": transaction.txn_id,
            "is_fraud": bool(prediction),
            "fraud_probability": probability,
            "risk_level": _risk_level(probability),
        }
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.post("/predict_batch")
async def predict_batch(transactions: List[TransactionData]):
    try:
        model, features = preprocess_batch(transactions)
        preds = model.predict(features)
        probas = model.predict_proba(features)[:, 1]
        results = []
        for i, t in enumerate(transactions):
            results.append(
                {
                    "txn_id": t.txn_id,
                    "is_fraud": bool(preds[i]),
                    "fraud_probability": float(probas[i]),
                    "risk_level": _risk_level(float(probas[i])),
                }
            )
        return {"results": results}
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


def _model_loaded_ok() -> bool:
    try:
        get_bundle()
        return True
    except Exception:
        return False


@app.get("/health")
async def health_check():
    bundle_ok = _model_loaded_ok()
    meta = {}
    if bundle_ok:
        try:
            b = get_bundle()
            meta = {
                "version": b.get("version"),
                "trained_at": b.get("trained_at"),
                "n_samples": b.get("n_samples"),
            }
        except Exception:
            pass
    return {
        "status": "healthy" if bundle_ok else "degraded",
        "model_loaded": bundle_ok,
        "model_uri": _model_display_uri(),
        "model_source": "gcs" if _using_gcs else "local",
        **{k: v for k, v in meta.items() if v is not None},
    }


@app.get("/model/info")
async def model_info():
    if not _model_loaded_ok():
        raise HTTPException(status_code=503, detail="Model bundle could not be loaded")
    try:
        b = get_bundle()
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    return {
        "model_uri": _model_display_uri(),
        "model_source": "gcs" if _using_gcs else "local",
        "version": b.get("version"),
        "trained_at": b.get("trained_at"),
        "n_samples": b.get("n_samples"),
        "feature_columns": b.get("feature_columns"),
    }


def _require_train_key(x_train_key: Optional[str]) -> None:
    if not TRAIN_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Training API disabled: set TRAIN_API_KEY in the server environment.",
        )
    if not x_train_key or x_train_key != TRAIN_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing X-Train-Key header")


@app.post("/train/upload")
async def train_upload(
    file: UploadFile = File(..., description="Primary labeled CSV (see README)"),
    file_b: Optional[UploadFile] = File(None, description="Optional second CSV merged with the first before training"),
    intent: str = Form("train"),
    x_train_key: Optional[str] = Form(None),
    x_train_key_header: Optional[str] = Header(None, alias="X-Train-Key"),
):
    """
    Retrain RandomForest from one or two merged CSVs.
    Local: replaces random_forest_model.pkl. GCS: publishes versioned + current objects.
    """
    key = x_train_key_header if x_train_key_header else x_train_key
    _require_train_key(key)

    if (intent or "").strip().lower() != "train":
        raise HTTPException(
            status_code=400,
            detail='Set form field intent=train to confirm this upload is for model training.',
        )

    raw = await file.read()
    if len(raw) > TRAIN_MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large (max {TRAIN_MAX_UPLOAD_BYTES} bytes)",
        )
    parts: list[bytes] = [raw]
    if file_b is not None:
        raw_b = await file_b.read()
        if len(raw_b) > TRAIN_MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="file_b exceeds upload size limit")
        if raw_b:
            parts.append(raw_b)

    tmp_dir = Path(tempfile.mkdtemp(prefix="fraudtrain_"))
    tmp_path = tmp_dir / "bundle.pkl"
    backup_path = MODEL_PATH.with_suffix(".pkl.prev")

    try:
        if len(parts) > 1:
            metrics, merge_stats = train_from_csv_bytes_list(parts, output_path=tmp_path, min_rows=30)
            metrics = {**metrics, "merge": merge_stats}
        else:
            metrics = train_from_csv_bytes(parts[0], output_path=tmp_path, min_rows=30)
    except ValueError as e:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail=f"Training failed: {e}") from e

    gcs_uris: dict[str, str] | None = None
    try:
        if _using_gcs:
            from gcs_model_store import GCSModelConfigError, publish_model_artifacts

            ver = metrics.get("version") or "unknown"
            try:
                gcs_uris = publish_model_artifacts(
                    tmp_path,
                    bucket=FRAUD_MODEL_GCS_BUCKET,
                    current_object=FRAUD_MODEL_GCS_OBJECT,
                    history_prefix=FRAUD_MODEL_GCS_HISTORY_PREFIX,
                    version=str(ver),
                    metrics={k: v for k, v in metrics.items() if k != "merge"},
                )
            except GCSModelConfigError as e:
                raise HTTPException(status_code=500, detail=str(e)) from e
            reload_bundle()
        else:
            if MODEL_PATH.is_file():
                shutil.copy2(MODEL_PATH, backup_path)
            shutil.move(str(tmp_path), str(MODEL_PATH))
            reload_bundle()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not publish new model: {e}") from e
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

    out: dict = {
        "ok": True,
        "message": "Model retrained and activated. /predict now uses the new weights.",
        "metrics": metrics,
        "model_uri": _model_display_uri(),
        "model_source": "gcs" if _using_gcs else "local",
    }
    if not _using_gcs:
        out["backup_previous"] = str(backup_path.resolve()) if backup_path.is_file() else None
    if gcs_uris:
        out["gcs"] = gcs_uris
    return out
