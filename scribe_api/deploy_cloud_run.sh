#!/usr/bin/env bash
# Deploy Scribe API to Cloud Run (build from source in this directory).
# Prerequisites: gcloud auth, billing, APIs enabled (run.googleapis.com, artifactregistry.googleapis.com, aiplatform.googleapis.com).
set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-fraudlens-scribe-api}"
REGION="${REGION:-asia-south1}"
PROJECT="${GCP_PROJECT_ID:-${GOOGLE_CLOUD_PROJECT:-}}"

if [[ -z "${PROJECT}" ]]; then
  echo "Set GCP_PROJECT_ID or GOOGLE_CLOUD_PROJECT to your GCP project id." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

gcloud run deploy "${SERVICE_NAME}" \
  --project="${PROJECT}" \
  --region="${REGION}" \
  --source="${SCRIPT_DIR}" \
  --allow-unauthenticated \
  --memory=1Gi \
  --cpu=1 \
  --timeout=300 \
  --max-instances=10 \
  --set-env-vars="FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID:-${PROJECT}},VERTEX_PROJECT_ID=${VERTEX_PROJECT_ID:-${PROJECT}},VERTEX_LOCATION=${VERTEX_LOCATION:-asia-south1},VERTEX_GEMINI_MODEL=${VERTEX_GEMINI_MODEL:-gemini-2.5-flash},REQUIRE_AUTH=true"

echo ""
echo "Set additional secrets/env in Cloud Console or via:"
echo "  gcloud run services update ${SERVICE_NAME} --region=${REGION} --project=${PROJECT} --set-env-vars=CHRONOS_API_BASE=...,ASSISTANT_API_BASE=..."
echo "Assign the Cloud Run service account: roles/aiplatform.user, and roles/datastore.user if using Firestore."
