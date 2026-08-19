-include .env
export

.DEFAULT_GOAL := help

.PHONY: help install dev build preview studio deploy-studio upload-image prep-images check-nightly check-analytics lint format upgrade upgrade-latest

help: ## Show this help message with all available targets
	@grep -hE '^[a-zA-Z_-]+:.*?##' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies for root and studio/
	yarn install
	cd studio && yarn install

dev: ## Start the Astro dev server at localhost:4321
	yarn dev

build: ## Build the production site to ./dist/
	yarn build

preview: ## Preview the production build locally
	yarn preview

studio: ## Start the Sanity Studio dev server at localhost:3333
	cd studio && npx sanity dev

deploy-studio: ## Deploy Sanity Studio to nw-local.sanity.studio
	cd studio && npx sanity deploy

upload-image: ## Upload an image asset to Sanity (vars: FILE, LABEL, DESCRIPTION, PORTRAIT_OK)
	@./scripts/upload-image.sh "$(FILE)" "$(LABEL)" "$(DESCRIPTION)" "$(PORTRAIT_OK)"

prep-images: ## Convert and rename a directory of images for Sanity (vars: DIR, STRAIN, RENAME)
	@./scripts/prep-images.sh "$(DIR)" "$(STRAIN)" "$(RENAME)"

check-nightly: ## Verify the nightly audit's cron is still firing
	@./scripts/check-nightly-freshness.sh

check-analytics: ## Verify ./dist/ ships a working Google Analytics snippet
	@./scripts/check-analytics-snippet.sh

lint: ## Run ESLint
	yarn lint

format: ## Auto-fix lint and formatting issues
	yarn format

# Upgrade dependencies to their latest minor/patch versions, respecting the
# tilde (~) ranges in package.json. Safe for routine maintenance — will not
# introduce breaking major-version changes.
upgrade: ## Upgrade deps within tilde range (safe minor/patch bumps)
	-@yarn outdated
	@yarn upgrade --tilde

# Upgrade dependencies to their absolute latest versions, ignoring semver
# ranges in package.json entirely. Use when intentionally adopting major
# version bumps. Review the `yarn outdated` output before and after carefully.
upgrade-latest: ## Upgrade deps to absolute latest, ignoring semver
	-@yarn outdated
	@yarn upgrade --latest
	-@yarn outdated
