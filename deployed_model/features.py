"""
Feature engineering aligned with the legacy FastAPI preprocess(), minus TRN_STATUS /
RESPONSE_CODE leakage, plus failed_txn_count_24h and consecutive_failures.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.preprocessing import LabelEncoder

# Single source of truth for model input columns (order matters for inference).
FEATURE_COLUMNS: list[str] = [
    "amount_sum_1h",
    "amount_sum_1h_log",
    "hour",
    "day_of_week",
    "payer_vpa_length",
    "beneficiary_vpa_length",
    "device_user_count",
    "txn_count_1h",
    "same_bank",
    "is_weekend",
    "is_night",
    "is_business_hours",
    "amount_rounded",
    "INITIATION_MODE_encoded",
    "TRANSACTION_TYPE_encoded",
    "beneficiary_bank_encoded",
    "failed_txn_count_24h",
    "consecutive_failures",
]

INITIATION_MODE_MAP: dict[str, int] = {
    "APP": 0,
    "WEB": 1,
    "USSD": 2,
    "IVR": 3,
    "UNKNOWN": 4,
}

TRANSACTION_TYPE_MAP: dict[str, int] = {
    "P2P": 0,
    "P2M": 1,
    "M2P": 2,
}


def _beneficiary_prefix(series: pd.Series) -> pd.Series:
    s = series.fillna("UNKN0000000").astype(str)
    return s.str[:4]


def fit_beneficiary_encoder(df: pd.DataFrame) -> LabelEncoder:
    """Fit LabelEncoder on BENEFICIARY_IFSC 4-char prefixes from training data only."""
    le = LabelEncoder()
    raw = _beneficiary_prefix(df["BENEFICIARY_IFSC"])
    le.fit(raw)
    return le


def _encode_beneficiary(raw: pd.Series, le: LabelEncoder) -> np.ndarray:
    """Transform prefixes; unseen values map to len(classes) (extra bin)."""
    unk = np.int64(len(le.classes_))
    cat = pd.Categorical(raw, categories=le.classes_)
    codes = cat.codes.astype(np.int64)
    codes[codes == -1] = unk
    return codes


def build_feature_frame(
    df: pd.DataFrame,
    beneficiary_encoder: LabelEncoder | None = None,
) -> tuple[pd.DataFrame, LabelEncoder]:
    """
    Build X with FEATURE_COLUMNS. If beneficiary_encoder is None, fit a new encoder on df.

    Returns:
        (feature_frame, fitted_or_passed_encoder)
    """
    df = df.copy()
    df["TXN_TIMESTAMP"] = pd.to_datetime(df["TXN_TIMESTAMP"])

    df["hour"] = df["TXN_TIMESTAMP"].dt.hour
    df["day_of_week"] = df["TXN_TIMESTAMP"].dt.dayofweek
    df["is_weekend"] = (df["day_of_week"] >= 5).astype(np.int64)
    df["is_night"] = ((df["hour"] >= 22) | (df["hour"] <= 6)).astype(np.int64)
    df["is_business_hours"] = ((df["hour"] >= 9) & (df["hour"] <= 17)).astype(np.int64)

    df["amount_log"] = np.log1p(df["AMOUNT"].astype(float))
    df["amount_rounded"] = (df["AMOUNT"] % 1 == 0).astype(np.int64)
    if "amount_sum_1h" not in df.columns:
        df["amount_sum_1h"] = df["AMOUNT"].astype(float) * df["txn_count_1h"].astype(float)
    df["amount_sum_1h"] = pd.to_numeric(df["amount_sum_1h"], errors="coerce").fillna(0.0).clip(lower=0.0)
    df["amount_sum_1h_log"] = np.log1p(df["amount_sum_1h"].astype(float))

    df["same_bank"] = (df["PAYER_IFSC"] == df["BENEFICIARY_IFSC"]).astype(np.int64)
    df["payer_vpa_length"] = df["PAYER_VPA"].astype(str).str.len()
    df["beneficiary_vpa_length"] = df["BENEFICIARY_VPA"].astype(str).str.len()

    df["INITIATION_MODE_encoded"] = (
        df["INITIATION_MODE"].astype(str).map(INITIATION_MODE_MAP).fillna(0).astype(np.int64)
    )
    df["TRANSACTION_TYPE_encoded"] = (
        df["TRANSACTION_TYPE"].astype(str).map(TRANSACTION_TYPE_MAP).fillna(0).astype(np.int64)
    )

    prefixes = _beneficiary_prefix(df["BENEFICIARY_IFSC"])
    if beneficiary_encoder is None:
        le = LabelEncoder()
        le.fit(prefixes)
    else:
        le = beneficiary_encoder
    df["beneficiary_bank_encoded"] = _encode_beneficiary(prefixes, le)

    out = pd.DataFrame(
        {
            "amount_sum_1h": df["amount_sum_1h"].astype(float),
            "amount_sum_1h_log": df["amount_sum_1h_log"],
            "hour": df["hour"].astype(np.int64),
            "day_of_week": df["day_of_week"].astype(np.int64),
            "payer_vpa_length": df["payer_vpa_length"].astype(np.int64),
            "beneficiary_vpa_length": df["beneficiary_vpa_length"].astype(np.int64),
            "device_user_count": df["device_user_count"].astype(np.int64),
            "txn_count_1h": df["txn_count_1h"].astype(np.int64),
            "same_bank": df["same_bank"].astype(np.int64),
            "is_weekend": df["is_weekend"].astype(np.int64),
            "is_night": df["is_night"].astype(np.int64),
            "is_business_hours": df["is_business_hours"].astype(np.int64),
            "amount_rounded": df["amount_rounded"].astype(np.int64),
            "INITIATION_MODE_encoded": df["INITIATION_MODE_encoded"],
            "TRANSACTION_TYPE_encoded": df["TRANSACTION_TYPE_encoded"],
            "beneficiary_bank_encoded": df["beneficiary_bank_encoded"].astype(np.int64),
            "failed_txn_count_24h": df["failed_txn_count_24h"].astype(np.int64),
            "consecutive_failures": df["consecutive_failures"].astype(np.int64),
        },
        index=df.index,
    )
    return out[FEATURE_COLUMNS], le
