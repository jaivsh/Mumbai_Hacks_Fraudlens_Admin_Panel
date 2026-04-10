#!/usr/bin/env bash
# Build Fraud API image (Artifact Registry) and deploy Cloud Run service (GCS model).
set -euo pipefail

: "${GCP_PROJECT:?Set GCP_PROJECT}"
REGION="${GCP_REGION:-asia-south1}"
BUCKET="${FRAUD_ML_BUCKET:?Set FRAUD_ML_BUCKET}"
SERVICE="${FRAUD_API_SERVICE_NAME:-fraudlens-fraud-api}"
IMAGE="${FRAUD_API_IMAGE:-asia-south1-docker.pkg.dev/${GCP_PROJECT}/containers/fraudlens-fraud-api:latest}"
API_SA="${FRAUD_API_SA:-fraudlens-backend@${GCP_PROJECT}.iam.gserviceaccount.com}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ML_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "Building ${IMAGE}"
gcloud builds submit "${ML_DIR}" \
  --project="${GCP_PROJECT}" \
  --config="${ML_DIR}/cloudbuild.fraud-api.yaml" \
  --substitutions="_IMAGE=${IMAGE}"

echo "Deploying Cloud Run service ${SERVICE}"
gcloud run deploy "${SERVICE}" \
  --project="${GCP_PROJECT}" \
  --region="${REGION}" \
  --image="${IMAGE}" \
  --allow-unauthenticated \
  --memory=2Gi \
  --cpu=2 \
  --timeout=120 \
  --max-instances=10 \
  --service-account="${API_SA}" \
  --set-env-vars="FRAUD_MODEL_GCS_BUCKET=${BUCKET},FRAUD_MODEL_GCS_OBJECT=fraud-rf/current.pkl,FRAUD_MODEL_GCS_HISTORY_PREFIX=fraud-rf/history"

gcloud run services describe "${SERVICE}" --project="${GCP_PROJECT}" --region="${REGION}" --format='value(status.url)'
