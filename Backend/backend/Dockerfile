FROM python:3.11-slim

# Prevent Python from writing .pyc files and enable unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    # Default to production environment — override via docker run -e or compose
    ENVIRONMENT=production \
    DEBUG=False

# Install system dependencies
# libmagic1: python-magic MIME detection
# libgl1, libglib2.0-0: opencv headless graphics support
# libsndfile1: soundfile audio decoding
RUN apt-get update && apt-get install -y --no-install-recommends \
    libmagic1 \
    libgl1 \
    libglib2.0-0 \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy and install Python dependencies first (layer cache optimization)
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY app/ ./app/

# Copy env example as documentation (contains NO real credentials)
COPY .env.example .env.example

# Create non-root user for security
RUN addgroup --system omniface && adduser --system --ingroup omniface omniface

# Create tmp directory for any transient files and set ownership
RUN mkdir -p /app/tmp && chown -R omniface:omniface /app

USER omniface

# Expose port
EXPOSE 8000

# Health check — waits 30s for startup, then checks every 30s
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# NOTE on workers: slowapi uses in-process memory for rate limiting.
# For multi-worker deployments (--workers > 1), replace slowapi with
# a Redis-backed rate limiter (e.g. fastapi-limiter with aioredis).
# Single worker is safe and recommended until Redis is configured.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log"]
