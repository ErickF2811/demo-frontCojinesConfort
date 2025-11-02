# syntax=docker/dockerfile:1.7

FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=on \
    PIP_NO_CACHE_DIR=on

WORKDIR /app

# System deps (just in case locales/SSL are needed)
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better layer caching
COPY requirements.txt ./

RUN pip install --upgrade pip \
    && pip install -r requirements.txt

# Copy the rest of the source
COPY . .

# Default envs (can be overridden at runtime)
ENV PORT=5000 \
    FLASK_ENV=production 
    # DATABASE_URL="postgresql://admin:admin123@172.21.0.8:5432/cojines"

EXPOSE 5000

# Use gunicorn in production; fall back to Flask dev server if not available
CMD ["sh", "-lc", "python -c 'import importlib.util; exit(0 if importlib.util.find_spec(\"gunicorn\") else 1)' && exec gunicorn -b 0.0.0.0:$PORT app:app || exec python app.py"]

