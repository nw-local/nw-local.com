# nw-local.com

Customer-facing website for **Northwest Local Cannabis**, a Washington State i502 licensed cannabis producer/processor.

[![Deploy to GitHub Pages](https://github.com/nw-local/nw-local.com/actions/workflows/deploy.yml/badge.svg)](https://github.com/nw-local/nw-local.com/actions/workflows/deploy.yml)
[![CI](https://github.com/nw-local/nw-local.com/actions/workflows/ci.yml/badge.svg)](https://github.com/nw-local/nw-local.com/actions/workflows/ci.yml)
[![Nightly audit](https://github.com/nw-local/nw-local.com/actions/workflows/nightly.yml/badge.svg)](https://github.com/nw-local/nw-local.com/actions/workflows/nightly.yml)
[![Astro](https://img.shields.io/badge/Astro-6.x-FF5D01?logo=astro&logoColor=white)](https://astro.build)
[![Sanity CMS](https://img.shields.io/badge/Sanity-CMS-F03E2F?logo=sanity&logoColor=white)](https://www.sanity.io)
[![Node](https://img.shields.io/badge/node-%E2%89%A522.20-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Yarn](https://img.shields.io/badge/yarn-package%20manager-2C8EBB?logo=yarn&logoColor=white)](https://yarnpkg.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Deployed](https://img.shields.io/badge/site-nw--local.com-1f6feb)](https://nw-local.com)

The site is a static, content-driven catalog of strains, products, and retail partners, alongside a blog and a reference section covering terpenes and cannabis terminology. Content is authored in [Sanity Studio](https://nw-local.sanity.studio/), built into static HTML by [Astro](https://astro.build) at deploy time, and hosted on [GitHub Pages](https://pages.github.com/).

---

## Tech stack

| Layer            | Tool                                                   |
| ---------------- | ------------------------------------------------------ |
| Framework        | Astro 6 (SSG, strict TypeScript)                       |
| CMS              | Sanity (project ID `nyd3p2n0`, dataset `production`)   |
| Hosting          | GitHub Pages                                           |
| CI/CD            | GitHub Actions (`.github/workflows/deploy.yml`)        |
| Package manager  | yarn                                                   |
| Integrations     | `@astrojs/rss`, `@astrojs/sitemap`, `astro-portabletext` |
| Image handling   | `sharp`, `@sanity/image-url`                           |
| Analytics        | Google Analytics 4 (production builds only)             |

There are no Markdown files in the repo — every piece of content (strains, products, blog posts, pages, retailers, site settings) lives in Sanity and is fetched at build time via GROQ queries in `src/lib/sanity.ts`.

---

## Quick start

Prereqs: Node 22.20+, yarn, and access to the Sanity project.

```sh
# 1. Clone
git clone git@github.com:nw-local/nw-local.com.git
cd nw-local.com

# 2. Install (root + studio)
make install

# 3. Environment
cp .env.example .env  # then fill it in — see "Environment variables" below
# fill in SANITY_API_TOKEN — the project id and dataset are already in the template

# 4. Dev
make dev
```

The dev server runs at <http://localhost:4321>.

---

## Commands

All commands run from the repo root.

Run `make` (no args) to print the full target list with descriptions.

| Task                | Command              | Notes                                                |
| ------------------- | -------------------- | ---------------------------------------------------- |
| List all targets    | `make` or `make help`| self-documenting — auto-generated from `## comments` |
| Install deps        | `make install`       | runs `yarn install` in root and `studio/`            |
| Dev server          | `make dev`           | localhost:4321                                       |
| Production build    | `make build`         | output → `./dist/`                                   |
| Preview build       | `make preview`       | local preview of the built site                      |
| Sanity Studio (dev) | `make studio`        | localhost:3333                                       |
| Deploy Sanity Studio| `make deploy-studio` | deploys to <https://nw-local.sanity.studio/>         |
| Type check          | `yarn astro check`   |                                                      |
| Lint                | `make lint`          | ESLint                                               |
| Format              | `make format`        | ESLint `--fix` (auto-fix)                            |
| Upgrade deps (safe) | `make upgrade`       | minor/patch only, respects tilde ranges              |
| Upgrade deps (major)| `make upgrade-latest`| ignores semver — review `yarn outdated` before/after |
| Prep images         | `make prep-images`   | see [Image workflow](#image-workflow)                |
| Upload image        | `make upload-image`  | see [Image workflow](#image-workflow)                |
| Check nightly cron  | `make check-nightly` | fails if the nightly audit's schedule has stalled    |
| Check analytics     | `make check-analytics` | asserts `./dist/` ships a GA snippet that records hits |
| Check robots.txt    | `make check-robots`  | asserts `robots.txt` points crawlers at this build's sitemap |
| Studio lint         | `cd studio && yarn lint` | separate project; the root's ESLint ignores it   |
| Studio type check   | `cd studio && yarn typecheck` |                                             |
| Studio format       | `cd studio && yarn format` | Prettier; `format:check` verifies instead      |

The `studio` job in CI runs the three studio checks on every PR.

---

## Automated testing

Three GitHub Actions workflows guard the site: [`ci.yml`](.github/workflows/ci.yml) (type check + audit on every PR and push to `main`, plus a nightly-freshness check on pushes only), the reusable [`audit.yml`](.github/workflows/audit.yml) (build, sitemap validation, analytics-snippet check, Lychee link check, Lighthouse), and [`nightly.yml`](.github/workflows/nightly.yml) (the same audit on a daily cron, catching content drift between PRs).

Two of those steps guard *silent* failures — a stalled nightly cron, and a Google Analytics snippet that loads and initialises while recording nothing — where every positive signal stays green and only an absence reveals the problem. Why each exists and what it asserts: [docs/testing.md](docs/testing.md).

There are deliberately no unit tests — the failure modes of a content-driven static site are broken queries, broken links, and regressed SEO/perf signals, not logic bugs. Full rationale, per-step details, and the considered/rejected list: [docs/testing.md](docs/testing.md).

---

## Project structure

```text
.
├── astro.config.mjs   # site URL + integrations
├── Makefile           # all run/build/image commands
├── docs/              # deployment, content model, SEO, testing, images
├── public/            # static assets served as-is
├── scripts/           # image prep/upload, CI health checks
├── src/               # Astro site: pages, components, layouts, lib
└── studio/            # Sanity Studio: schemas + sidebar structure
```

Two entry points worth knowing: [`src/lib/sanity.ts`](src/lib/sanity.ts) holds the Sanity client and **every** GROQ query, and [`studio/structure.ts`](studio/structure.ts) defines the Studio sidebar — a document type not listed there is appended automatically rather than going missing.

The age-gate overlay (`src/components/AgeGate.astro`) is client-side and uses `localStorage` to persist the 21+ acknowledgement.

---

## Sanity content model

Ten document types live in `studio/schemaTypes/`: `strain`, `product`, `blogPost`, `author`, `retailer`, `page`, `siteSettings`, `retailerPage`, `terpene`, and `glossaryTerm`. Detail pages are statically generated via `getStaticPaths()`. Two further entries there are object types rather than documents: `blockContent`, the shared rich-text body, and `tableBlock`, a reference table usable inside it.

Full table, plus the gotchas worth knowing before you add content or write against the schema: [docs/content-model.md](docs/content-model.md).

---

## SEO

Every page emits **JSON-LD structured data** (`Organization` everywhere; `Product`, `Article`, `Person`, and `BreadcrumbList` on detail pages) via helpers in [`src/lib/jsonld.ts`](src/lib/jsonld.ts) — plus canonical URLs, OG/Twitter tags, an auto-generated sitemap, an RSS feed, and enforced image alt text. Schema tables, architecture, and testing guidance: [docs/seo.md](docs/seo.md).

## Deployment

The site auto-deploys to GitHub Pages on every push to `main`, via [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). Publishing content in Sanity also triggers a rebuild through a webhook (~1-2 min end-to-end), because the build fetches all content at build time.

The Studio itself is hosted separately at <https://nw-local.sanity.studio/> and deploys with `make deploy-studio` — **not** with the site. A schema or sidebar change needs that command before editors see it.

Webhook config, why Pages deploys are serialized behind a concurrency group, and the publish/rebuild ordering rule that follows from it: [docs/deployment.md](docs/deployment.md).

---

## Environment variables

All three are required for both local development and CI.

| Variable                       | Purpose                                                  |
| ------------------------------ | -------------------------------------------------------- |
| `SANITY_PROJECT_ID`            | Sanity project ID (`nyd3p2n0`)                           |
| `SANITY_DATASET`               | Sanity dataset name (`production`)                       |
| `SANITY_API_TOKEN`             | Read-only token for build-time content fetching          |

Local: put them in `.env` at the repo root. CI: stored as GitHub Actions secrets.

The GA4 measurement ID is **not** among them. It is a public identifier that ships in the HTML of every page, so it lives in [`src/lib/analytics.ts`](src/lib/analytics.ts) under version control rather than in `.env` and CI secrets, where it bought no secrecy and quietly broke fresh checkouts.

A separate `SANITY_WRITE_TOKEN` is used **only** by the image-upload helper script (`make upload-image`) when adding new image assets. It is not needed to build or run the site.

---

## Image workflow

Two scripts orchestrated by `make` — `prep-images` converts and dedups against Sanity, `upload-image` uploads with alt text:

```sh
make prep-images DIR="path/to/images" STRAIN="Strain Name"
make upload-image FILE="path/to/_processed/strain-name-bud-closeup.jpg" \
    LABEL="Short label" \
    DESCRIPTION="SEO-friendly alt text describing the image content"
```

**Keep the generated `_processed/` directory** — it is the local manifest the dedup logic reads on later runs.

Renames, the hashing contract, orientation handling, and hotspot cropping: [docs/images.md](docs/images.md).

---

## Claude Code skills

This repo ships with custom [Claude Code](https://claude.ai/code) slash-command skills under `.claude/skills/` that automate routine content operations against the Sanity MCP server. They drive the strain catalog, blog, and retailer onboarding.

| Skill              | Purpose                                                                |
| ------------------ | ---------------------------------------------------------------------- |
| `/new-strain`      | Add a strain — researches multiple sources, validates links, writes original copy, uploads images, publishes to Sanity |
| `/update-strain`   | Update an existing strain's images, content, or fields                |
| `/new-product`     | Add a product SKU under an existing strain                            |
| `/new-post`        | Create and publish a blog post                                         |
| `/new-retailer`    | Add a retail partner                                                   |
| `/audit-content`   | Scan content for missing fields and quality issues                     |
| `/describe-assets` | Add alt text to image assets missing descriptions                      |

Each skill encodes the full workflow (research → preview → user approval → image processing → Sanity mutations → publish) and uses the Sanity MCP with `workspaceName: "nw-local"`. See `.claude/skills/<skill>/SKILL.md` for the full instructions of each.

---

## Useful links

- Production site: <https://nw-local.com>
- Sanity Studio: <https://nw-local.sanity.studio/>
- Sanity project management: <https://www.sanity.io/manage/personal/project/nyd3p2n0>
- Astro docs: <https://docs.astro.build>
- Sanity GROQ reference: <https://www.sanity.io/docs/groq>

---

## License

Private — all rights reserved. Northwest Local Cannabis.
