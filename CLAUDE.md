# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Customer-facing website for **Northwest Local Cannabis**, a Washington State i502 licensed cannabis producer/processor. Built with **Astro 6** + **Sanity CMS**. All content (strains, products, blog posts, pages, retailers, site settings) lives in Sanity and is fetched at build time. Deploys to **GitHub Pages** via GitHub Actions. Uses **yarn** as the package manager.

## Commands

Use `make` targets — they load `.env` automatically via `-include .env` + `export`. Always use Makefile targets for scripts that need env loading, so env vars are loaded consistently across the project.

| Task | Command |
|------|---------|
| Dev server | `make dev` (localhost:4321) |
| Build | `make build` (outputs to `./dist/`) |
| Preview build | `make preview` |
| Sanity Studio | `make studio` (localhost:3333) |
| Deploy Studio | `make deploy-studio` |
| Type check | `yarn astro check` |

No test framework is configured.

## Architecture

- **Astro 6** with static site generation (SSG), strict TypeScript
- **Sanity CMS** is the single source of truth for all content — no Markdown files in the repo
- **Integrations**: `@astrojs/rss`, `@astrojs/sitemap`
- **Data layer**: `src/lib/sanity.ts` — Sanity client + GROQ query functions; `src/lib/image.ts` — image URL builder
- **Styling**: Dark + Electric Green theme in `src/styles/global.css` using CSS custom properties. System font stack (no custom fonts).
- **Layout chain**: `Layout.astro` wraps every page — fetches site settings from Sanity, renders `BaseHead`, `Nav`, `Footer`, and `AgeGate`
- **Age gate**: Client-side 21+ overlay using `localStorage` for persistence
- **Dynamic routing**: `src/pages/strains/[...slug].astro` and `src/pages/blog/[...slug].astro` generate static pages via `getStaticPaths()`
- **Webhook rebuild**: Sanity content publish triggers a GitHub Actions rebuild via `workflow_dispatch`

## Coding Conventions

- **Strict env vars pattern** — established in `src/lib/sanity.ts` and `src/components/BaseHead.astro`. Assert at module level so the app fails fast on misconfiguration rather than rendering with broken data.
- **Use central data types** — card components (`StrainCard`, `ProductCard`, `BlogPostCard`, `RetailerCard`) import their `Props` from `src/lib/sanity.ts` rather than redeclaring inline shapes. This keeps the Sanity schema, data layer, and component layer in lockstep — when a field is added or renamed in `sanity.ts`, type errors surface in every consumer instead of silently drifting.
- **Whitespace inside parens** — codebase style is `function name( arg )` and `if( condition )` with spaces inside parens; ESLint enforces this, so `make format` will rewrite tight-paren code automatically
- **Accent green is for emphasis, not surface** — `--accent` (#00ff88) is reserved for CTAs, links, and interactive states. It is never a background for large areas; the dark surfaces carry the layout and the photography carries the visual weight.

## Invariants

- **`prep-images` dedup depends on byte-identical conversion output.** SHA-1 is computed on the converted JPG, not the source file, and matched against `sha1hash` on Sanity's image assets. The `sips -s formatOptions 90` setting in `scripts/prep-images.sh` is therefore part of the dedup contract — changing it silently invalidates every existing hash, and duplicate uploads start slipping through.
- **`studio/` is a separate project from the root, with its own style and its own package manager.** The root ESLint config explicitly ignores `studio/**` (`eslint.config.mjs`), so `make format` and `yarn lint` never touch it and the root's spaced-paren/double-quote/semicolon style does **not** apply there. Studio files follow the Prettier config in `studio/package.json` — no semicolons, single quotes, `bracketSpacing: false`, tight parens (`(rule) => rule.required()`). Studio is also **not a yarn workspace** of the root — the root `package.json` has no `workspaces` field, so a bare `yarn install` at the root does not install `studio/node_modules`. Use `make install`, which runs `yarn install` in both. Lint/type-check studio with `cd studio && npx eslint .` and `npx tsc --noEmit`, since `studio/package.json` defines no `lint` script. **`studio/` uses yarn, same as the root.** `studio/yarn.lock` is the tracked lockfile; the `package-lock.json` left behind by `sanity init` was deleted, because `make install` has always run `yarn install` there and two lockfiles for one project means neither is authoritative. Do not run `npm install` in `studio/` — it would resurrect the second lockfile.
- **GitHub disables this repo's nightly cron after 60 days of inactivity, silently.** The repo is public, and it is worked on in bursts with long gaps between them (2026-05-24 → 2026-08-04 was 72 days), so it crosses that line routinely rather than exceptionally. When it happens every signal still reads healthy: `gh workflow list` reports `state: active`, `workflow_dispatch` runs succeed, and nothing fails so no failure email is sent. The only symptom is the *absence* of runs with `event=schedule` — which is why neither a green manual dispatch nor an active-looking workflow is evidence of a working cron. Remedy: `gh workflow disable nightly.yml && gh workflow enable nightly.yml`, then confirm a scheduled run appears within ~24h. `scripts/check-nightly-freshness.sh`, wired into `ci.yml` as the `nightly-freshness` job on pushes to `main`, now fails loudly when this recurs. Background: `docs/superpowers/specs/2026-08-11-nightly-freshness-check-design.md`.

## Sanity Content Model

| Document Type | Purpose |
|---------------|---------|
| `strain` | Cannabis strains with effects, terpenes, THC/CBD ranges, gallery |
| `product` | SKUs (flower, preroll, concentrate, edible) referencing a parent strain |
| `author` | Post authors with role, bio, photo, and profile links |
| `blogPost` | Blog posts with rich text body, tags, hero image, author reference |
| `retailer` | Dispensary partners with address, contact info, products carried |
| `page` | Singleton pages (home, about, contact) with flexible body content |
| `siteSettings` | Global config: title, logo, social links, contact info, age gate message |
| `retailerPage` | Wholesale page singleton with downloadable product sheets |

## Environment Variables

Required in `.env` (and as GitHub Actions secrets):

- `SANITY_PROJECT_ID` — Sanity project ID (`nyd3p2n0`)
- `SANITY_DATASET` — Sanity dataset name (`production`)
- `SANITY_API_TOKEN` — Read-only API token for build-time fetching
- `PUBLIC_GOOGLE_ANALYTICS_ID` — Google Analytics 4 measurement ID (e.g. `G-XXXXXXXXXX`)

## Deployment

- **GitHub Pages**: Auto-deploys on push to `main` via `.github/workflows/deploy.yml`
- **Sanity Studio**: Hosted at https://nw-local.sanity.studio/ — deploy with `make deploy-studio`
- **Sanity webhook**: On content publish, Sanity sends a POST to the GitHub Actions `workflow_dispatch` endpoint, triggering a rebuild (~1-2 min)
  - Webhook URL: `https://api.github.com/repos/nw-local/nw-local.com/actions/workflows/deploy.yml/dispatches`
  - Projection: `{"ref": "main"}`
  - Auth: Fine-grained GitHub PAT with Actions (read/write) permission on the repo
  - Configured at: sanity.io/manage → project nyd3p2n0 → API → Webhooks

## Key Files

- `astro.config.mjs` — Astro configuration (site URL, integrations)
- `src/lib/sanity.ts` — Sanity client, all GROQ queries
- `src/lib/image.ts` — Sanity image URL builder (`urlFor()`)
- `src/layouts/Layout.astro` — Base layout wrapping all pages
- `src/components/AgeGate.astro` — 21+ age verification overlay
- `src/styles/global.css` — Full theme (dark + electric green)
- `studio/` — Sanity Studio project (schemas in `studio/schemaTypes/`)

## Available Skills

| Skill | Purpose |
|-------|---------|
| `/new-strain` | Add a strain to the Sanity catalog |
| `/update-strain` | Update a strain's images, content, or fields |
| `/new-product` | Add a product under an existing strain |
| `/new-post` | Create and publish a blog post |
| `/new-retailer` | Add a retail partner |
| `/audit-content` | Scan content for missing fields and quality issues |
| `/describe-assets` | Add alt text to image assets missing descriptions |
