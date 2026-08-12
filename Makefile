.PHONY: help dev dev-infra dev-infra-down build up down restart logs logs-server logs-client \
        clean ps shell-server shell-db shell-redis test test-coverage db-migrate db-studio db-seed

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ─── Development ──────────────────────────────────────

dev-infra: ## Start dev infrastructure (PostgreSQL + Redis, for local `npm run dev`)
	docker compose -f docker-compose.dev.yml up -d
	@echo ""
	@echo "Infrastructure ready:"
	@echo "  PostgreSQL: localhost:5432 (user: collab_user, pass: collab_pass, db: collab_editor)"
	@echo "  Redis:      localhost:6379"
	@echo "  Test DB:    localhost:5433 (optional, isolated — see .env.example's TEST_DATABASE_URL)"
	@echo ""
	@echo "First time on a fresh volume? Apply migrations once: make db-migrate"
	@echo ""
	@echo "Run the app:"
	@echo "  Terminal 1: npm run dev:server"
	@echo "  Terminal 2: npm run dev:client"

dev-infra-down: ## Stop dev infrastructure
	docker compose -f docker-compose.dev.yml down

dev: dev-infra ## Alias for dev-infra — see its output for next steps

# ─── Production Docker ─────────────────────────────────

build: ## Build all Docker images
	docker compose build

up: ## Start all containers (production mode)
	docker compose --env-file .env.docker up -d
	@echo ""
	@echo "CollabEdit is running:"
	@echo "  App:    http://localhost"
	@echo "  API:    http://localhost:3001"
	@echo "  Health: http://localhost:3001/api/health"

down: ## Stop all containers
	docker compose down

restart: ## Restart all containers
	docker compose restart

logs: ## Follow container logs
	docker compose logs -f

logs-server: ## Follow server logs only
	docker compose logs -f server

logs-client: ## Follow client logs only
	docker compose logs -f client

# ─── Maintenance ─────────────────────────────────────

clean: ## Stop containers and remove volumes (WARNING: deletes data)
	docker compose down -v
	docker compose -f docker-compose.dev.yml down -v
	@echo "All containers stopped and volumes removed."

ps: ## Show container status
	docker compose ps

shell-server: ## Open a shell in the server container
	docker compose exec server sh

shell-db: ## Open psql in the database container
	docker compose exec postgres psql -U $${POSTGRES_USER:-collab} -d $${POSTGRES_DB:-collab_editor}

shell-redis: ## Open redis-cli in the Redis container
	docker compose exec redis redis-cli

# ─── Testing ──────────────────────────────────────────

test: ## Run tests (requires dev infrastructure)
	npm test --workspace=server

test-coverage: ## Run tests with coverage
	npm run test:coverage --workspace=server

# ─── Database ─────────────────────────────────────────

db-migrate: ## Run database migrations (local, against DATABASE_URL)
	npx prisma migrate deploy --schema=server/prisma/schema.prisma

db-studio: ## Open Prisma Studio
	npx prisma studio --schema=server/prisma/schema.prisma

db-seed: ## Seed the local (non-Docker) database with demo data (alice/bob/carol @demo.com, password: demo1234)
	npm run prisma:seed --workspace=server

db-seed-docker: ## Seed the Dockerized database with demo data (requires `make up` first)
	docker compose exec -w /app/server server npx prisma db seed
