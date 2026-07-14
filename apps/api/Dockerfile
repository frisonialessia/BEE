# syntax=docker/dockerfile:1
# ----------------------------------------------------------------------------
# BEE API container image.
# Multi-stage-friendly, slim base, non-root runtime user.
# ----------------------------------------------------------------------------
FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install dependencies first for better layer caching.
COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

# Copy application code.
COPY . .

# Run as an unprivileged user for security.
RUN useradd --create-home --uid 1001 bee && chown -R bee:bee /app
USER bee

EXPOSE 8000

# Uvicorn in production mode (no --reload). Adjust workers via the platform.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
