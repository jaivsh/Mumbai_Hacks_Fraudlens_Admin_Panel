# Federated round (GCP) — cross-silo aggregation

## What this is

- **Two banks (silos)** each hold their own data. They **do not** share databases.
- Each uploads an **anonymized training export** (CSV) only to **their** GCS prefix (IAM-isolated).
- A **Cloud Run Job** runs `federated_aggregate_train.py`: downloads **both** objects, **merges** rows, trains **one** global RandomForest, writes **`fraud-rf/current.pkl`** (+ history + manifests).

This is **cross-silo centralized training** with **per-tenant object isolation**, not classical FL (no gradient-only exchange). It matches how many regulated teams stage “federated” demos before true FL.

## Deployed on `fraudlens-aura-prod` (reference)

| Resource | Value |
|----------|--------|
| **GCS bucket** | `fraudlens-ml-artifacts` |
| **Fraud API URL** | `https://fraudlens-fraud-api-875422601666.asia-south1.run.app` |
| **Aggregator image** | `asia-south1-docker.pkg.dev/fraudlens-aura-prod/containers/fraudlens-fed-aggregator:latest` |
| **Fraud API image** | `asia-south1-docker.pkg.dev/fraudlens-aura-prod/containers/fraudlens-fraud-api:latest` |
| **Cloud Run Job** | `fraudlens-federated-aggregator` (region `asia-south1`) |
| **Job SA** | `fraudlens-federated-aggregator@fraudlens-aura-prod.iam.gserviceaccount.com` |

Cloud Build uses **Artifact Registry** (`containers` repo), not `gcr.io`, so pushes succeed without `createOnPush` on GCR.

## GCS layout (example bucket `fraudlens-ml-artifacts`)

| Object | Purpose |
|--------|---------|
| `federated/nodes/bank-a/transactions.csv` | Node A export (private to SA with prefix ACL) |
| `federated/nodes/bank-b/synthetic_transactions_source2.csv` | Node B export (your second source) |
| `fraud-rf/current.pkl` | **Global** model consumed by the Fraud API Cloud Run service |
| `fraud-rf/history/bundle-{version}.pkl` | Versioned artifacts |
| `fraud-rf/manifest.json` | Training / publish metadata |
| `fraud-rf/federated_round_manifest.json` | Last federated round audit (URIs + row counts) |

## One-time: upload your second dataset (example)

From repo root (after `gcloud auth` and bucket exists):

```bash
export BUCKET=your-ml-bucket
gsutil cp synthetic_transactions_source2.csv "gs://${BUCKET}/federated/nodes/bank-b/synthetic_transactions_source2.csv"
```

Upload **bank A** export similarly:

```bash
gsutil cp /path/to/bank_a_labeled.csv "gs://${BUCKET}/federated/nodes/bank-a/transactions.csv"
```

CSV schema must match `ml/train_pipeline.py` (same columns as `/train/upload`).

## Build and run the aggregator job

Use **`ml/`** as build context:

```bash
export PROJECT=your-gcp-project
export REGION=asia-south1
export BUCKET=your-ml-bucket
export IMAGE="gcr.io/${PROJECT}/fraudlens-fed-aggregator:latest"

gcloud builds submit --project="${PROJECT}" --tag="${IMAGE}" -f Dockerfile.federated-aggregator .

# Run from repo: cd ml && …
```

Create / update Cloud Run Job (adjust service account):

```bash
gcloud run jobs deploy fraudlens-federated-aggregator \
  --project="${PROJECT}" --region="${REGION}" --image="${IMAGE}" \
  --tasks=1 --max-retries=1 --task-timeout=3600 \
  --set-env-vars="FEDERATED_NODE_A_URI=gs://${BUCKET}/federated/nodes/bank-a/transactions.csv" \
  --set-env-vars="FEDERATED_NODE_B_URI=gs://${BUCKET}/federated/nodes/bank-b/synthetic_transactions_source2.csv" \
  --set-env-vars="FRAUD_MODEL_GCS_BUCKET=${BUCKET},FRAUD_MODEL_GCS_OBJECT=fraud-rf/current.pkl,FRAUD_MODEL_GCS_HISTORY_PREFIX=fraud-rf/history" \
  --service-account="YOUR_JOB_SA@${PROJECT}.iam.gserviceaccount.com"

gcloud run jobs execute fraudlens-federated-aggregator --project="${PROJECT}" --region="${REGION}" --wait
```

**IAM:** job SA needs `storage.objectViewer` on both node prefixes and `storage.objectAdmin` on `fraud-rf/**` (tighten with bucket conditions in production).

## Fraud API service

Point the **inference** Cloud Run service at the same bucket:

- `FRAUD_MODEL_GCS_BUCKET`
- `FRAUD_MODEL_GCS_OBJECT=fraud-rf/current.pkl`

After each successful job execution, **restart** inference or rely on your reload strategy (`/train/upload` reloads in-process; GCS-only loads at cold start unless you add polling).

## Local dry-run (no GCP)

```bash
cd ml
export FEDERATED_NODE_A_URI="/abs/path/bank_a.csv"
export FEDERATED_NODE_B_URI="/abs/path/to/synthetic_transactions_source2.csv"
export FRAUD_MODEL_GCS_BUCKET="your-bucket"
# Requires ADC: gcloud auth application-default login
python federated_aggregate_train.py
```
