-include .env
export

.DEFAULT_GOAL := help

.PHONY: help install dev build preview studio deploy-studio upload-image prep-images render-figures check-nightly check-analytics check-robots check-content-style check-email-routing test-check-email-routing check-anchors test-psychrometrics check-drop-lookup check-glossary check-glossary-browser check-person-jsonld check-portable-text-headings check-coa-contract test-coa check-coa-build test-check-coa-build check-glossary-build test-check-glossary-build check-navigation test-drops check-drop-build test-check-drop-build check-pesticide-disclosure-contract test-pesticide-disclosure check-pesticide-disclosure-build test-check-pesticide-disclosure-build check sanity-history lint format upgrade upgrade-latest

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

upload-file: ## Upload a file asset (e.g. MP4 video) to Sanity (vars: FILE, LABEL, DESCRIPTION)
	@./scripts/upload-file.sh "$(FILE)" "$(LABEL)" "$(DESCRIPTION)"

prep-images: ## Convert and rename a directory of images for Sanity (vars: DIR, STRAIN, RENAME)
	@./scripts/prep-images.sh "$(DIR)" "$(STRAIN)" "$(RENAME)"

render-figures: ## Rasterize figures/**/*.svg to PNG for upload (vars: FIGURE)
	@./scripts/render-figures.sh "$(FIGURE)"

check-nightly: ## Verify the nightly audit's cron is still firing
	@./scripts/check-nightly-freshness.sh

check-analytics: build ## Verify ./dist/ ships a working Google Analytics snippet
	@./scripts/check-analytics-snippet.sh

check-robots: build ## Verify ./dist/robots.txt points crawlers at this build's sitemap
	@./scripts/check-robots.sh

check-content-style: build ## Verify ./dist/ uses US spelling and pairs every temperature °F first
	@./scripts/check-content-style.py

check-email-routing: build ## Verify business and personal emails stay on their intended pages
	@./scripts/check-email-routing.py

test-check-email-routing: ## Regression-test malformed email-routing fixtures
	@python3 scripts/test-check-email-routing.py

check-anchors: build ## Verify ./dist/ heading anchor ids are unique per page
	@./scripts/check-heading-anchors.py

test-psychrometrics: ## Run the psychrometrics unit tests (no build required)
	@./scripts/test-psychrometrics.py

test-psychrometrics-ts: ## Test the browser calculator's psychrometrics port against the same fixtures
	@yarn vitest run src/lib/psychrometrics.test.ts

check-drop-lookup: ## Verify the drop collision rule: strongest status wins, whatever the row order
	@node scripts/check-drop-lookup.ts

check-glossary: ## Verify glossary content contracts and search mechanics
	@node scripts/check-glossary.ts

check-glossary-browser: ## Verify glossary progressive-enhancement behavior
	@node scripts/check-glossary-browser.ts

check-person-jsonld: ## Verify author profile structured-data contracts
	@node scripts/check-person-jsonld.ts

check-portable-text-headings: ## Verify collision-safe Portable Text heading preparation
	@node scripts/check-portable-text-headings.ts

check-coa-contract: ## Verify the public COA runtime contract
	@node scripts/check-coa-contract.ts

test-coa: ## Test COA destination validation, routing, and real Astro rendering
	@yarn vitest run src/lib/coa.test.ts src/components/CoaBody.test.ts

test-drops: ## Test drop chapter grouping, certificate validation, and real Astro chapter rendering
	@yarn vitest run src/lib/drops.test.ts src/components/DropStrainChapter.test.ts

check-drop-build: build ## Verify every built drop page against its own certificate manifest
	@python3 scripts/check-drop-build.py dist

test-check-drop-build: ## Regression-test malformed drop page fixtures
	@python3 scripts/test-check-drop-build.py

check-coa-build: build ## Verify every built public COA page and its certificate link
	@python3 scripts/check-coa-build.py dist

test-check-coa-build: ## Regression-test malformed public COA page fixtures
	@python3 scripts/test-check-coa-build.py

check-glossary-build: build ## Verify the built glossary index and entry contracts
	@./scripts/check-glossary-build.py dist

test-check-glossary-build: build ## Regression-test malformed glossary build fixtures
	@python3 scripts/test-check-glossary-build.py dist

check-navigation: ## Verify the top and footer navigation structure
	@python3 scripts/check-navigation.py

check-pesticide-disclosure-contract: ## Verify the public pesticide-disclosure runtime contract
	@node scripts/check-pesticide-disclosure-contract.ts

test-pesticide-disclosure: ## Test pesticide-disclosure validation, routing, search, and rendering
	@yarn vitest run src/lib/pesticide-disclosure.test.ts src/lib/pesticide-search.test.ts src/components/PesticideDisclosureBody.test.ts

check-pesticide-disclosure-build: build ## Verify every built public pesticide-disclosure page
	@python3 scripts/check-pesticide-disclosure-build.py dist

test-check-pesticide-disclosure-build: ## Regression-test malformed pesticide-disclosure page fixtures
	@python3 scripts/test-check-pesticide-disclosure-build.py

check: lint check-drop-lookup check-glossary check-glossary-browser check-person-jsonld check-portable-text-headings check-coa-contract test-coa test-drops test-psychrometrics test-psychrometrics-ts test-check-email-routing test-check-coa-build test-check-drop-build check-pesticide-disclosure-contract test-pesticide-disclosure test-check-pesticide-disclosure-build build check-analytics check-robots check-content-style check-email-routing check-anchors check-coa-build check-drop-build check-pesticide-disclosure-build check-glossary-build test-check-glossary-build check-navigation ## Run the local repository check aggregate
	@cd studio && yarn lint && yarn typecheck && yarn format:check
	@yarn astro check

sanity-history: ## Pull a document's revision history from Sanity (vars: DOC, QUERY, MATCH, RAW)
	@node scripts/sanity-history.ts "$(DOC)" "$(QUERY)"

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
