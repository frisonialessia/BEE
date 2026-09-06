# syntax=docker/dockerfile:1
# ----------------------------------------------------------------------------
# BEE API container image.
#
# Two stages from one base, so local and production run the same interpreter,
# the same dependency set and the same entrypoint — the whole point of the
# container. The only difference between them is the dev-only tooling
# (pytest, ruff, mypy), which has no business in a shipped image.
#
#   docker build --target runtime .   → what deploys
#   docker build --target dev .       → what `docker compose` runs locally
#
# Python 3.11, not 3.12: pyproject's requires-python, mypy's python_version
# and both GitHub Actions workflows all target 3.11. This image used to say
# 3.12, which meant the one environment advertised as "identical" was the
# only one on a different interpreter.
#
# See .dockerignore for what stays out of the build context (secrets, tests,
# caches).
# ----------------------------------------------------------------------------
FROM python:3.11-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# curl is here for the container healthcheck and for the local cron service
# to reach the tick endpoints. Nothing in the application uses it.
RUN apt-get update \
    && apt-get install --no-install-recommends -y curl \
    && rm -rf /var/lib/apt/lists/*

# Dependencies first, so editing application code doesn't reinstall them.
COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

# ----------------------------------------------------------------------------
# runtime — the image that deploys. No test tooling, unprivileged user.
# ----------------------------------------------------------------------------
FROM base AS runtime

COPY . .

RUN useradd --create-home --uid 1001 bee && chown -R bee:bee /app
USER bee

EXPOSE 8000

# No --reload here on purpose: it forks a supervisor process and watches the
# filesystem, which is dev behaviour. Workers are set by the platform.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

# ----------------------------------------------------------------------------
# dev — adds pytest/ruff/mypy so the suite can run inside the same image the
# API runs in:  docker compose run --rm api pytest
#
# Deliberately NOT the default target. An image that ships its own test
# runner is a bigger attack surface and a slower pull, for a capability
# production never uses.
# ----------------------------------------------------------------------------
FROM base AS dev

COPY requirements-dev.txt ./
RUN pip install -r requirements-dev.txt

COPY . .

# No USER here, unlike runtime above, and that is deliberate.
#
# docker-compose bind-mounts ./apps/api over /app so edits reload. That mount
# keeps the HOST's ownership, so a uid-1001 process inside the container
# cannot write into it on a Linux host — and pytest's first act is to create
# .pytest_cache and __pycache__ there. The suite would fail with permission
# errors that have nothing to do with the code.
#
# This target is only ever built by docker-compose.yml, never deployed. The
# image that deploys is `runtime`, and that one does drop privileges.

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
