"""
Train RandomForest fraud model from a labeled CSV aligned with features.py.
Used by POST /train/upload on the fraud scoring API.
"""

from __future__ import annotations

import io
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, roc_auc_score

from config import (
    MAX_AMOUNT_SUM_1H,
    MAX_CONSECUTIVE_FAILURES,
    MAX_DEVICE_USER_COUNT,
    MAX_FAILED_TXN_COUNT_24H,
    MAX_TXN_COUNT_1H,
)
from features import FEATURE_COLUMNS, build_feature_frame, fit_beneficiary_encoder

# Raw columns required before feature engineering (amount_sum_1h optional — derived if missing).
RAW_COLUMNS = [
    "TXN_TIMESTAMP",
    "AMOUNT",
    "PAYER_VPA",
    "BENEFICIARY_VPA",
    "PAYER_IFSC",
    "BENEFICIARY_IFSC",
    "INITIATION_MODE",
    "TRANSACTION_TYPE",
    "device_user_count",
    "txn_count_1h",
    "failed_txn_count_24h",
    "consecutive_failures",
]

LABEL_CANDIDATES = ("IS_FRAUD", "is_fraud", "label", "fraud")


def _normalize_label_column(df: pd.DataFrame) -> pd.Series:
    for c in LABEL_CANDIDATES:
        if c in df.columns:
            y = pd.to_numeric(df[c], errors="coerce").fillna(0).astype(int).clip(0, 1)
            return y
    raise ValueError(
        f"Missing label column. Use one of: {', '.join(LABEL_CANDIDATES)}"
    )


def _clip_raw(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["device_user_count"] = (
        pd.to_numeric(out["device_user_count"], errors="coerce")
        .fillna(1)
        .clip(lower=1, upper=MAX_DEVICE_USER_COUNT)
        .astype(int)
    )
    out["txn_count_1h"] = (
        pd.to_numeric(out["txn_count_1h"], errors="coerce")
        .fillna(1)
        .clip(lower=1, upper=MAX_TXN_COUNT_1H)
        .astype(int)
    )
    if "amount_sum_1h" in out.columns:
        out["amount_sum_1h"] = (
            pd.to_numeric(out["amount_sum_1h"], errors="coerce")
            .fillna(0.0)
            .clip(lower=0.0, upper=MAX_AMOUNT_SUM_1H)
            .astype(float)
        )
    out["failed_txn_count_24h"] = (
        pd.to_numeric(out["failed_txn_count_24h"], errors="coerce")
        .fillna(0)
        .clip(lower=0, upper=MAX_FAILED_TXN_COUNT_24H)
        .astype(int)
    )
    out["consecutive_failures"] = (
        pd.to_numeric(out["consecutive_failures"], errors="coerce")
        .fillna(0)
        .clip(lower=0, upper=MAX_CONSECUTIVE_FAILURES)
        .astype(int)
    )
    out["AMOUNT"] = pd.to_numeric(out["AMOUNT"], errors="coerce").fillna(0.0)
    return out


def load_training_frame_from_csv_bytes(data: bytes) -> pd.DataFrame:
    """Parse CSV bytes; raises ValueError on missing columns or empty file."""
    df = pd.read_csv(io.BytesIO(data))
    if df.empty:
        raise ValueError("CSV has no rows")
    missing = [c for c in RAW_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(missing)}")
    return df


def train_bundle_from_dataframe(
    df: pd.DataFrame,
    *,
    min_rows: int = 30,
    random_state: int = 42,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """
    Fit model + beneficiary encoder on df. Returns (bundle dict for joblib, metrics dict).
    """
    if len(df) < min_rows:
        raise ValueError(f"Need at least {min_rows} rows; got {len(df)}")

    y = _normalize_label_column(df)
    if y.nunique() < 2:
        raise ValueError("Label column must contain both classes (0 and 1)")

    raw = _clip_raw(df)
    bene_enc = fit_beneficiary_encoder(raw)
    X, _ = build_feature_frame(raw, beneficiary_encoder=bene_enc)

    model = RandomForestClassifier(
        n_estimators=200,
        max_depth=24,
        min_samples_leaf=2,
        random_state=random_state,
        class_weight="balanced_subsample",
        n_jobs=-1,
    )
    model.fit(X, y)

    try:
        proba = model.predict_proba(X)[:, 1]
        auc = float(roc_auc_score(y, proba))
    except Exception:
        auc = None
    acc = float(accuracy_score(y, model.predict(X)))

    version_ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    bundle = {
        "model": model,
        "beneficiary_encoder": bene_enc,
        "trained_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "n_samples": int(len(df)),
        "feature_columns": list(FEATURE_COLUMNS),
        "version": version_ts,
    }
    metrics = {
        "n_samples": int(len(df)),
        "n_fraud": int(y.sum()),
        "n_legit": int(len(y) - y.sum()),
        "train_accuracy": acc,
        "train_roc_auc": auc,
        "version": version_ts,
    }
    return bundle, metrics


def save_bundle(bundle: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, path)


def load_bundle(path: Path) -> dict[str, Any]:
    return joblib.load(path)


def train_from_csv_bytes(
    data: bytes,
    *,
    output_path: Path,
    min_rows: int = 30,
) -> dict[str, Any]:
    df = load_training_frame_from_csv_bytes(data)
    bundle, metrics = train_bundle_from_dataframe(df, min_rows=min_rows)
    save_bundle(bundle, output_path)
    return metrics


def train_from_csv_bytes_list(
    parts: list[bytes],
    *,
    output_path: Path,
    min_rows: int = 30,
) -> tuple[dict[str, Any], dict[str, int]]:
    """
    Merge multiple labeled CSV byte blobs (same schema), then train once.
    Returns (metrics, merge_stats) where merge_stats has row counts per part.
    """
    if not parts:
        raise ValueError("No CSV parts provided")
    dfs = []
    counts = {}
    for i, data in enumerate(parts):
        df_i = load_training_frame_from_csv_bytes(data)
        dfs.append(df_i)
        counts[f"part_{i}_rows"] = len(df_i)
    df = pd.concat(dfs, ignore_index=True)
    counts["merged_rows"] = len(df)
    bundle, metrics = train_bundle_from_dataframe(df, min_rows=min_rows)
    save_bundle(bundle, output_path)
    return metrics, counts
