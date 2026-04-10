# FraudLens fraud scoring API


- **Health:** `GET http://localhost:8000/health` (includes `version` / `trained_at` when present in the bundle)
- **Model metadata:** `GET http://localhost:8000/model/info`
- **Docs:** `GET http://localhost:8000/docs` (OpenAPI / Swagger)



## Request body (JSON)

`POST /predict` and items in `POST /predict_batch` body array:

| Field | Type | Notes |
|-------|------|--------|
| `txn_id` | string | Your correlation id |
| `AMOUNT` | number | |
| `amount_sum_1h` | number ≥ 0 | Total amount sent from payer VPA in last 1h (app/server); clipped to `MAX_AMOUNT_SUM_1H` |
| `TXN_TIMESTAMP` | string | Parseable by pandas (e.g. ISO `2025-03-06T23:39:48`) |
| `PAYER_VPA`, `BENEFICIARY_VPA` | string | |
| `PAYER_IFSC`, `BENEFICIARY_IFSC` | string | |
| `INITIATION_MODE` | string | Default `APP` (maps like training) |
| `TRANSACTION_TYPE` | string | `P2P` / `P2M` / `M2P` |
| `device_user_count` | int ≥ 1 | App-derived; clipped server-side to `MAX_DEVICE_USER_COUNT` |
| `txn_count_1h` | int ≥ 1 | App-derived; clipped to `MAX_TXN_COUNT_1H` |
| `failed_txn_count_24h` | int ≥ 0 | Prior 24h non-success count (no leakage from *current* response) |
| `consecutive_failures` | int ≥ 0 | Back-to-back failures before this attempt |

**Removed vs old API:** `TRN_STATUS`, `RESPONSE_CODE` (and derived `is_success`) are not used, to avoid leakage.

## Example: curl (`/predict`)

```bash
curl -s -X POST "http://localhost:8000/predict" \
  -H "Content-Type: application/json" \
  -d '{"txn_id":"t1","AMOUNT":500.0,"amount_sum_1h":1200.0,"TXN_TIMESTAMP":"2025-03-06T23:39:48","PAYER_VPA":"user@pthdfc","BENEFICIARY_VPA":"shop@okaxis","PAYER_IFSC":"SBIN0001234","BENEFICIARY_IFSC":"HDFC0000001","INITIATION_MODE":"APP","TRANSACTION_TYPE":"P2P","device_user_count":2,"txn_count_1h":5,"failed_txn_count_24h":1,"consecutive_failures":0}'
```

---

## Upload new data → retrain → live weights

When you have **another labeled CSV** (e.g. a second bank export), you can **replace** the on-disk model bundle and **immediately** serve it from the same API (in-memory cache reloads after training).

1. **Server env:** set `TRAIN_API_KEY` to a long random secret. Without it, `POST /train/upload` returns 503.
2. **Optional:** `TRAIN_MAX_UPLOAD_BYTES` (default 25MB).
3. **Request:** `POST /train/upload` — `multipart/form-data` with:
   - `file`: CSV file
   - `intent`: must be exactly `train` (confirms intentional overwrite)
   - Auth: header `X-Train-Key: <same as TRAIN_API_KEY>` **or** form field `x_train_key` (for simple clients)

**Training CSV columns** (same raw fields as feature pipeline, plus a label):

- Required: `TXN_TIMESTAMP`, `AMOUNT`, `PAYER_VPA`, `BENEFICIARY_VPA`, `PAYER_IFSC`, `BENEFICIARY_IFSC`, `INITIATION_MODE`, `TRANSACTION_TYPE`, `device_user_count`, `txn_count_1h`, `failed_txn_count_24h`, `consecutive_failures`
- Optional: `amount_sum_1h` (if omitted, training uses the same proxy as inference features: derived from amount × txn count where applicable)
- **Label** (one of): `IS_FRAUD`, `is_fraud`, `label`, or `fraud` — values `0` / `1`. Need **both** classes and **≥ 30** rows.

**Local mode (no GCS env):** the service writes `random_forest_model.pkl`, backs up the previous file as `random_forest_model.pkl.prev`, then reloads.

**Cloud / GCS mode:** set `FRAUD_MODEL_GCS_BUCKET` (and optionally the paths below). Inference loads the bundle from `gs://$BUCKET/$OBJECT`. After `/train/upload`, the new bundle is written to a **versioned** object under the history prefix, **`current.pkl` is overwritten**, `manifest.json` is updated, and memory is reloaded.

| Env var | Default | Purpose |
|---------|---------|---------|
| `FRAUD_MODEL_GCS_BUCKET` | *(empty)* | If set, load & publish models via GCS |
| `FRAUD_MODEL_GCS_OBJECT` | `fraud-rf/current.pkl` | Active model object path in bucket |
| `FRAUD_MODEL_GCS_HISTORY_PREFIX` | `fraud-rf/history` | Versioned `bundle-{version}.pkl` prefix |

Cloud Run: attach a service account with **Storage Object Viewer** on the bucket (inference) and **Object Admin** on the model prefix if you use `/train/upload` on the same service (tighter IAM in production: separate train job + infer-only SA).

**Second data source in one shot:** multipart field `file_b` — same schema as `file`; rows are **concatenated** then one model is fit (not federated; both CSVs are visible to the server).

**Example: curl**

```bash
export TRAIN_API_KEY='your-secret'
curl -s -X POST "http://localhost:8000/train/upload" \
  -H "X-Train-Key: $TRAIN_API_KEY" \
  -F "intent=train" \
  -F "file=@/path/to/labeled_bank_a.csv" \
  -F "file_b=@/path/to/labeled_bank_b.csv"
```

**Example: Cloud Run deploy (outline)**

```bash
# Build from repo: ml/Dockerfile
gcloud run deploy fraudlens-fraud-api --source=./ml --region=asia-south1 \
  --set-env-vars="FRAUD_MODEL_GCS_BUCKET=your-bucket,TRAIN_API_KEY=***" \
  --service-account=your-sa@project.iam.gserviceaccount.com
```

**Note:** This is **centralized retraining** (upload → full refit), not federated learning. Use HTTPS, private networking, or IAP for real bank CSVs.


Syntheetic Data Generation using SDV:
Production fraud scoring must not use RESPONSE_CODE or TRN_STATUS for the *current* transaction when those values are only known after the bank responds (label/temporal leakage).

The SDV pipeline no longer includes TRN_STATUS or RESPONSE_CODE. Instead, the seed and synthetic data use app-computable rolling features:

  failed_txn_count_24h — injected with label-conditional distributions so SDV learns correlation with IS_FRAUD (same idea as device_user_count injection).

  consecutive_failures — same.

At inference, the mobile app should compute these from history and pass them to the model.

Stratified conditional sampling (IS_FRAUD x is_night) optionally biases the joint distribution; timestamps are adjusted so TXN_TIMESTAMP matches is_night.

With fraud_correlated device mode (default), seed rows use overlapping label-conditional distributions (see fraud_feature_distributions.py): primary signal device_user_count, secondary txn_count_1h (capped at MAX_TXN_COUNT_1H=15), then failed_txn_count_24h / consecutive_failures. generate_synthetic.py reapplies the same device/txn + rolling injections after sampling unless --no-enforce-threshold-separation.

VPAs: before device_user_count is computed, payer/beneficiary strings are replaced with Indian PSP handles and label-conditioned lengths — legit ~13–18 chars both sides; fraud payer ~14–22 (often bot-style), fraud beneficiary ~24–35 (impersonator/long). generate_synthetic reapplies the same via rewrite_vpa_columns → inject_vpa_by_fraud_label.

Full 50k regeneration (from repo root, venv on):
  python ml/generate_synthetic.py --rows 50000 --refit --stratified-sampling --stratified-empirical --night-fraud-boost 1.25 --seed 42 --device-features fraud_correlated --synthesizer copula
