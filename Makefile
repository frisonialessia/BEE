# BEE — developer convenience commands.
# Run `make help` to list targets.

.DEFAULT_GOAL := help
.PHONY: help up down api-install api-dev api-test api-lint web-install web-dev web-build

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

up: ## Start the full stack (Postgres + API) with docker compose
	docker compose up --build

down: ## Stop the docker compose stack
	docker compose down

api-install: ## Install backend dependencies (uv)
	cd apps/api && uv venv .venv && uv pip install -r requirements-dev.txt

api-dev: ## Run the API with autoreload
	cd apps/api && uvicorn app.main:app --reload

api-test: ## Run backend tests
	cd apps/api && pytest

api-lint: ## Lint the backend
	cd apps/api && ruff check .

web-install: ## Install frontend dependencies
	cd apps/web && pnpm install

web-dev: ## Run the frontend dev server
	cd apps/web && pnpm dev

web-build: ## Build the frontend
	cd apps/web && pnpm build
