# syntax=docker/dockerfile:1.7

###############################
# Frontend (Vite) build stage #
###############################
FROM node:20-bullseye-slim AS frontend-build

WORKDIR /frontend

COPY clerk-javascript/package*.json ./
RUN npm ci

COPY clerk-javascript/ ./
RUN npm run build

#############################
# Backend (Flask) final img #
#############################
FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=on \
    PIP_NO_CACHE_DIR=on

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for caching
COPY requirements.txt ./

RUN pip install --upgrade pip \
    && pip install -r requirements.txt

# Copy application source
COPY . .

# Replace the Vite output with the freshly built assets
COPY --from=frontend-build /frontend/dist ./clerk-javascript/dist

# Default envs (override at runtime)
ENV PORT=5000 \
    FLASK_ENV=production

EXPOSE 5000

# Use gunicorn if installed, otherwise fall back to Flask's dev server
CMD ["sh", "-lc", "python -c 'import importlib.util; exit(0 if importlib.util.find_spec(\"gunicorn\") else 1)' && exec gunicorn -b 0.0.0.0:$PORT app:app || exec python app.py"]
