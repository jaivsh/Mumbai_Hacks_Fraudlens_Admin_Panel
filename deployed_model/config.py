"""Paths and generation defaults for the FraudLens synthetic data pipeline."""

from pathlib import Path

ML_ROOT = Path(__file__).resolve().parent
REPO_ROOT = ML_ROOT.parent

DEFAULT_INPUT_CSV = REPO_ROOT / "anonymized_sample_fraud_txn.csv"
DEFAULT_PREPARED_PATH = ML_ROOT / "data" / "prepared_transactions.parquet"
DEFAULT_SYNTHETIC_PATH = ML_ROOT / "data" / "synthetic_transactions.parquet"
DEFAULT_METADATA_PATH = ML_ROOT / "data" / "sdv_metadata.json"

# GaussianCopula is stable on small tabular data; increase for larger synthetic sets
DEFAULT_NUM_SYNTHETIC_ROWS = 10_000

# "historical" = DEVICE_ID-derived counts (most realistic, no fraud/legit separation on these fields).
# "fraud_correlated" = overlapping label-conditional device/txn/rolling distributions (see fraud_feature_distributions).
# "blend" = historical for legit; fraud rows max(historical, synthetic overlap draws).
DEFAULT_DEVICE_FEATURE_MODE = "fraud_correlated"
DEFAULT_SYNTHESIZER = "copula"  # "copula" | "ctgan"
DEFAULT_CTGAN_EPOCHS = 150
DEFAULT_RANDOM_SEED = 42

# UPI: at most a few linked accounts per device for synthetic training
MAX_DEVICE_USER_COUNT = 4
# Rolling 1h window transaction count (capped in synthetic + training pipelines)
MAX_TXN_COUNT_1H = 12
SDV_DEVICE_CAP_VALUE = 5.0

# Rolling failure features (cap to avoid extreme OOD values at inference)
MAX_FAILED_TXN_COUNT_24H = 12
MAX_CONSECUTIVE_FAILURES = 6
# Rolling sent amount in 1h (value velocity feature)
MAX_AMOUNT_SUM_1H = 50000.0

# Optional stratified conditional sampling: (fraud+night, fraud+day, legit+night, legit+day) — sums to 1
# Slightly elevates night fraud vs typical random mixing (tune for your domain).
DEFAULT_STRATIFIED_QUADRANTS = (0.06, 0.08, 0.38, 0.48)
# Multiply empirical P(fraud, night) when --stratified-sampling empirical
NIGHT_FRAUD_BOOST = 1.25
