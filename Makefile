.DEFAULT_GOAL := help
export WRANGLER_WRITE_LOGS := false
export WRANGLER_SEND_METRICS := false
.PHONY: test-notifications help install dev build lint test check up local-init down logs cloud-login cloud-db-create cloud-config cloud-build cloud-check cloud-migrate cloud-release deploy cloud-secrets-check cloud-secrets-apply github-secrets-sync test-config

help: ## Show available commands
	@awk 'BEGIN {FS = ":.*## "} /^[a-z-]+:.*## / {printf "%-18s %s\n", $$1, $$2}' $(MAKEFILE_LIST)
install: ## Install locked dependencies
	cd web && npm ci
dev: ## Start development on HTTPS :8083, or HTTP :8080 without certificates
	cd web && npm run dev
build: ## Build the local Workers bundle
	cd web && npm run build
lint: ## Run the linter
	cd web && npm run lint
test: ## Run Playwright tests (install Chromium first)
	cd web && npm run test:accessibility
test-notifications: ## Test notification tool adapters without sending real messages
	cd web && npx playwright test --config playwright.notifications.config.ts
check: lint build ## Lint and build
up: local-init host-config ## Build and start Docker preview (HTTP :8080, HTTPS :8083)
	docker compose -f compose.local.yaml up --build --force-recreate -d --wait
	@echo "✓ Docker container started successfully"
	@echo "  HTTP:  http://carestead.com:8080"
	@echo "  HTTPS: https://carestead.com:8083 (when certificates are present)"
host-config: ## Ensure /etc/hosts has carestead.com entry
	@grep -q "127.0.0.1 carestead.com" /etc/hosts || (echo "Adding carestead.com to /etc/hosts (may prompt for password)"; echo "127.0.0.1 carestead.com" | sudo tee -a /etc/hosts > /dev/null && echo "✓ Added carestead.com to /etc/hosts")
	@echo "✓ /etc/hosts configured"
check-ports: ## Verify required Docker ports are available (HTTP 8080, HTTPS 8083)
	@bash scripts/check-ports.sh
local-init: ## Create local runtime settings without overwriting an existing file
	cd web && node scripts/local-init.mjs
down: ## Stop Docker preview, keeping the database volume
	docker compose -f compose.local.yaml down
logs: ## Follow Docker preview logs
	docker compose -f compose.local.yaml logs -f web
cloud-login: ## Authenticate with Cloudflare in your browser
	cd web && npx wrangler login
cloud-db-create: ## Create the initial carestead D1 database (run once)
	cd web && npx wrangler d1 create carestead
cloud-config: ## Generate production config from CLOUDFLARE_D1_DATABASE_ID
	cd web && node scripts/cloud-config.mjs
cloud-build: cloud-config ## Build for Cloudflare Workers
	cd web && CARESTEAD_CLOUD=1 npm run build
cloud-check: cloud-build ## Validate the deployment bundle without publishing
	cd web && npx wrangler deploy --config dist/server/wrangler.json --dry-run
cloud-migrate: ## Apply SQL migrations to the remote D1 database
	cd web && node scripts/cloud-config.mjs --production
	cd web && npx wrangler d1 migrations apply DB --remote --config wrangler.deploy.json
deploy: ## Build and publish the Worker (apply database migrations first)
	cd web && node scripts/cloud-config.mjs --production
	cd web && CARESTEAD_CLOUD=1 npm run build
	cd web && npx wrangler deploy --config dist/server/wrangler.json
cloud-release: ## Validate, migrate D1, then publish the validated Worker bundle
	cd web && node scripts/cloud-config.mjs --production
	$(MAKE) cloud-check
	$(MAKE) cloud-migrate
	cd web && npx wrangler deploy --config dist/server/wrangler.json
cloud-secrets-check: ## Validate configured cloud integration groups without uploading
	cd web && node scripts/cloud-secrets.mjs --check
cloud-secrets-apply: cloud-secrets-check ## Upload cloud runtime secrets to the configured Worker
	cd web && node scripts/cloud-config.mjs --production
	cd web && node scripts/cloud-secrets.mjs --apply
github-secrets-sync: ## Sync local secrets to GitHub production environment (requires gh CLI)
	cd web && node scripts/github-secrets-sync.mjs
test-config: ## Test deployment configuration and secret handling without network access
	cd web && node --test scripts/*.test.mjs
