FROM python:3.12-slim AS backend

# System deps for PDF parsing (PyMuPDF) and OCR (Tesseract)
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-eng \
    tesseract-ocr-vie \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy and install Python deps first (layer caching)
COPY pyproject.toml ./
RUN pip install --no-cache-dir . \
    && pip install --no-cache-dir gunicorn

# Copy application code
COPY alembic.ini ./
COPY alembic/ ./alembic/
COPY app/ ./app/

# Ensure uploads directory exists
RUN mkdir -p /app/uploads

# Expose the port Heroku assigns via $PORT
EXPOSE ${PORT:-8000}

# Run migrations then start with gunicorn (Heroku-recommended).
# Auth rate limits are stored in the database, so WEB_CONCURRENCY can be
# raised for multi-worker deploys. Default stays conservative because the
# AI batch worker is still in-process.
CMD alembic upgrade head && gunicorn app.main:app \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind 0.0.0.0:${PORT:-8000} \
    --workers ${WEB_CONCURRENCY:-1} \
    --timeout 120
