#!/usr/bin/env bash
# Build federated aggregator image and deploy Cloud Run Job (edit variables below).
set -euo pipefail

: "${GCP_PROJECT:?Set GCP_PROJECT}"
REGION="${GCP_REGION:-asia-south1}"
BUCKET="${FRAUD_ML_BUCKET:?Set FRAUD_ML_BUCKET (GCS bucket for nodes + models)}"
JOB_NAME="${FEDERATED_JOB_NAME:-fraudlens-federated-aggregator}"
IMAGE="${FEDERATED_IMAGE:-asia-south1-docker.pkg.dev/${GCP_PROJECT}/containers/fraudlens-fed-aggregator:latest}"
JOB_SA="${FEDERATED_JOB_SA:?Set FEDERATED_JOB_SA e.g. federated-aggregator@PROJECT.iam.gserviceaccount.com}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ML_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "Building ${IMAGE} (Cloud Build)"
gcloud builds submit "${ML_DIR}" \
  --project="${GCP_PROJECT}" \
  --config="${ML_DIR}/cloudbuild.federated.yaml" \
  --substitutions="_IMAGE=${IMAGE}"

echo "Deploying Cloud Run Job ${JOB_NAME}"
gcloud run jobs deploy "${JOB_NAME}" \
  --project="${GCP_PROJECT}" \
  --region="${REGION}" \
  --image="${IMAGE}" \
  --tasks=1 \
  --max-retries=1 \
  --task-timeout=3600 \
  --service-account="${JOB_SA}" \
  --set-env-vars="FEDERATED_NODE_A_URI=gs://${BUCKET}/federated/nodes/bank-a/transactions.csv,FEDERATED_NODE_B_URI=gs://${BUCKET}/federated/nodes/bank-b/synthetic_transactions_source2.csv,FRAUD_MODEL_GCS_BUCKET=${BUCKET},FRAUD_MODEL_GCS_OBJECT=fraud-rf/current.pkl,FRAUD_MODEL_GCS_HISTORY_PREFIX=fraud-rf/history"

echo "Execute with: gcloud run jobs execute ${JOB_NAME} --project=${GCP_PROJECT} --region=${REGION} --wait"
