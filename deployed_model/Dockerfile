# FraudLens fraud scoring API — Cloud Run (inference + optional train/upload)
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY config.py features.py train_pipeline.py gcs_model_store.py fastAPI.py ./
COPY random_forest_model.pkl ./

ENV PORT=8080
ENV PYTHONUNBUFFERED=1

CMD exec uvicorn fastAPI:app --host 0.0.0.0 --port ${PORT}
