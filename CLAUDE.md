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
- **Nothing inside a `.card` may be an anchor.** Most card call sites wrap their entire contents in `<a class="card">` — `BlogPostCard.astro`, `StrainCard.astro`, the terpene index, the two homepage tiles in `index.astro`, and the marketplace cards in `retailers.astro`. Nested `<a>` elements are invalid HTML and browsers respond by breaking the *outer* link, so adding a byline link, a tag chip, or a "read more" inside one silently destroys the card's own click target. Nothing catches it: not lint, not `astro check`, not the build, and not the link checker, which sees two valid hrefs. This is why post card bylines are plain text while the post header links the same author, and why the storefront CTA is a `<span class="btn-accent">` rather than a button-styled anchor. `RetailerCard.astro` and `ProductCard.astro` are plain `<div>`s and are not subject to this.
- **Whitespace inside parens** — codebase style is `function name( arg )` and `if( condition )` with spaces inside parens; ESLint enforces this, so `make format` will rewrite tight-paren code automatically
- **No em dashes in published copy.** They read as an AI tell, so all visitor-facing prose uses a colon, a comma pair, parentheses, or a full stop instead. This covers Sanity content and any user-facing string in the repo, including meta descriptions built in page templates. Code comments are exempt, since no visitor reads them. Two spots quietly reintroduce the habit and are worth checking when adding fields: **Studio `description` hints are copy templates**, not just docs, so an example like `"Earthy, musky — promotes relaxation"` teaches every future editor the wrong style; and en dashes in numeric ranges (`8–12 hours`, `13–24 °C`) are correct typography and are deliberately left alone. Swept sitewide in the em-dash pass; before that, ~200 instances spanned 25 rendered pages.

- **Accent green is for emphasis, not surface** — `--accent` (#00ff88) is reserved for CTAs, links, and interactive states. It is never a background for large areas; the dark surfaces carry the layout and the photography carries the visual weight.

## Invariants

- **`prep-images` dedup depends on byte-identical conversion output.** SHA-1 is computed on the converted JPG, not the source file, and matched against `sha1hash` on Sanity's image assets. The `sips -s formatOptions 90` setting in `scripts/prep-images.sh` is therefore part of the dedup contract — changing it silently invalidates every existing hash, and duplicate uploads start slipping through.
- **`studio/` is a separate project from the root, with its own style and its own package manager.** The root ESLint config explicitly ignores `studio/**` (`eslint.config.mjs`), so `make format` and `yarn lint` never touch it and the root's spaced-paren/double-quote/semicolon style does **not** apply there. Studio files follow the Prettier config in `studio/package.json` — no semicolons, single quotes, `bracketSpacing: true` (so `options: { hotspot: true }`, spaced), `printWidth: 100`, and tight parens (`(rule) => rule.required()`). Spaced braces with tight parens looks inconsistent and is not: braces are Prettier's `bracketSpacing`, parens are just how the code is written, and the two settings are independent. Studio is also **not a yarn workspace** of the root — the root `package.json` has no `workspaces` field, so a bare `yarn install` at the root does not install `studio/node_modules`. Use `make install`, which runs `yarn install` in both. Studio has its own scripts: `cd studio && yarn lint`, `yarn typecheck`, `yarn format`, `yarn format:check`. The `studio` job in `ci.yml` runs the last three on every PR. That job is new, and it exists because nothing verified `studio/` at all before it: the Prettier config sat in `package.json` for months while every one of the 15 files diverged from it, because no script and no CI step ever ran Prettier. A config that nothing executes is a suggestion, not a convention, and it will quietly contradict the code it claims to describe. **`studio/` uses yarn, same as the root.** `studio/yarn.lock` is the tracked lockfile; the `package-lock.json` left behind by `sanity init` was deleted, because `make install` has always run `yarn install` there and two lockfiles for one project means neither is authoritative. Do not run `npm install` in `studio/` — it would resurrect the second lockfile. **`yarn install` prints `warning Workspaces can only be enabled in private projects.` in both projects, and it is third-party noise, not a defect here.** Neither `package.json` declares `workspaces` and both are `private: true`; yarn v1 reads every *dependency's* manifest too and warns once per offender, currently `vitefu` and `emmet`, which ship a `workspaces` field without `private`. The warning reads like it is accusing this repo, which makes it tempting to "fix" a `package.json` that is already correct — and adding `workspaces` to silence it would make `studio/` a real workspace and break the deliberate separation described above. Verified 2026-08-20.
- **GitHub disables this repo's nightly cron after 60 days of inactivity, silently.** The repo is public, and it is worked on in bursts with long gaps between them (2026-05-24 → 2026-08-04 was 72 days), so it crosses that line routinely rather than exceptionally. When it happens every signal still reads healthy: `gh workflow list` reports `state: active`, `workflow_dispatch` runs succeed, and nothing fails so no failure email is sent. The only symptom is the *absence* of runs with `event=schedule` — which is why neither a green manual dispatch nor an active-looking workflow is evidence of a working cron. Remedy: `gh workflow disable nightly.yml && gh workflow enable nightly.yml`, then confirm a scheduled run appears within ~24h. `scripts/check-nightly-freshness.sh`, wired into `ci.yml` as the `nightly-freshness` job on pushes to `main`, now fails loudly when this recurs. The remaining rationale lives beside the code it explains: the script's header and inline comments cover why the query filters on `event=schedule` and `status=completed` and why the 3-day threshold is a hardcoded constant rather than an env var, and the `nightly-freshness` job comment in `ci.yml` covers why it never runs on pull requests. Proved by [#32](https://github.com/nw-local/nw-local.com/pull/32).

- **Portable Text image blocks store `caption` and `alt` outside `children`, so span-only queries silently miss them.** A GROQ audit shaped like `body[].children[...]` reads as exhaustive while asserting nothing about figure captions, which are siblings of `children`, not entries in it. During the em-dash sweep this under-reported the CO2 post by its full four captions and the purple post by three, and the query returned a confident empty result for both. This is the same fail-open shape as the `match` tokenizing trap above: the check looks like it is finding problems while covering only part of the content. Two habits defeat it. Audit rendered `dist/` HTML rather than GROQ alone, since the build flattens every field into one surface regardless of which schema field produced it. And when a query must run against the Content Lake, cover `[!defined(children)]` blocks explicitly alongside the span walk. Related trap in the same pass: concatenating fields across types (`coalesce(body,[]) + coalesce(description,[])`) evaluates to null for any document where one of them is a string rather than an array, so `blogPost` dropped out of a whole-dataset query and returned zero hits. Query per type when field types diverge.

- **Astro preserves template whitespace, unlike JSX.** Writing a multi-line expression inside an element emits stray whitespace text nodes into the rendered HTML — `<h1>{expr}</h1>` reformatted across multiple lines produced `<h1> About Us </h1>` and changed 13 pages. House convention is to hug expression braces tightly against their surrounding tags rather than spread them across lines for readability. `yarn format` is `eslint --fix` and does **not** reformat Astro markup, so the formatter neither catches this nor causes it — the risk is a human or agent "tidying" the line by hand. See the homepage hero lockup branch (`src/components/Hero.astro`).
- **`astro build --mode development` still sets `import.meta.env.PROD` to `true`, so it cannot test dev-only behaviour.** `--mode` selects which `.env.[mode]` files load and what `import.meta.env.MODE` says; `PROD` and `DEV` are tied to the *command*, so every `astro build` is `PROD`. A gate like `{import.meta.env.PROD && ...}` therefore looks broken when tested that way — the output is identical to an ungated build, which reads as "the conditional is being ignored" rather than "the flag is still true". The way to tell the two apart without booting the dev server (which is forbidden here) is a control: invert the condition to `import.meta.env.DEV` and run a normal production build. If the markup disappears, the conditional works and the flag was simply true. Used to verify the analytics gate in `BaseHead.astro`; the first, invalid attempt would have concluded the gate was broken. Verified 2026-08-20.
- **A new git worktree has no `.env`, and the build fails in a way that does not say so.** `git worktree add` materializes tracked files only, so everything gitignored — `.env`, `node_modules`, `studio/node_modules` — is absent by construction in a fresh worktree. Because `src/lib/sanity.ts` asserts its env vars at module level, `make build` then dies with `Missing SANITY_PROJECT_ID env var` and a stack trace pointing into `dist/.prerender/chunks/`, which reads like a build-system fault rather than a missing file. `yarn astro check` passes throughout, since type-checking never evaluates the module. First thing in any new worktree: `yarn install`, and copy `.env` in from the main checkout. Bit this repo three times in one session (2026-08-11). Worktrees also share one stash stack, one reflog, and one `.git` object store with the main checkout: `git stash` is per-repository, not per-worktree. So "stash, rebuild, compare, unstash" is unsafe here as a way to capture a before/after baseline, because a concurrent session in another worktree can push or pop between your two halves. Capture baselines by copying the artifact instead (`make build && cp -R dist /tmp/before-<branch>`) before making any edit.
- **GROQ `match` is a tokenizing full-text operator, not a substring test.** It tokenizes both operands and discards punctuation, so `field match "*—*"` collapses to a wildcard and returns every document. Verified on this dataset: it returned all 25 `glossaryTerm` docs while exactly one contained an em dash. Use `count(string::split(field, "needle")) > 1` for a literal substring test. This matters because a broken check of this shape fails *open* — it looks like it is finding problems while asserting nothing. Verified 2026-08-12.
- **Flattening `body[].markDefs` yields a phantom `null` for every block that lacks the field.** The purple post's three image blocks (`figKeracyanin`, `figPathway`, `figTemperature`) have no `markDefs`, so an unguarded count came back 3 too high (28 instead of 25). Guard with `body[defined(markDefs)].markDefs[]`. Verified 2026-08-12.

- **`grep -c` against built HTML always returns 1, because Astro minifies each page onto a single line.** `grep -c` counts matching *lines*, not occurrences, so an assertion like `grep -c 'class="card"' dist/index.html` reports 1 whether the page has one card or forty, and a plan that expects a specific count reads as satisfied for the wrong reason. Use `grep -o 'pattern' file | wc -l` instead, which counts occurrences. This matters more here than in most repos: there is no test framework, so grep assertions against `dist/` are the entire automated verification surface. Verified on this repo 2026-08-12.

- **Sanity's `rule.required()` is Studio-side validation only — the Content Lake does not enforce it on API writes.** It stops a human clicking Publish in the Studio UI. It does not stop `create`/`patch` through the HTTP API, the Sanity MCP tools, or a script, all of which will happily write a document missing a required field. So **every code path that creates documents must enforce required fields itself**, and adding a required field means auditing the writers: the `.claude/skills/` that create that document type, and anything in `scripts/`. This bit `blogPost.author` in [#34](https://github.com/nw-local/nw-local.com/pull/34) — the field was `rule.required()`, but `/new-post` writes via MCP and did not gather an author, so the next post would have published with no byline anywhere, no `<dc:creator>` in the feed, and an `Article.author` silently falling back to the Organization. Nothing would have failed: not lint, not `astro check`, not the build. The skill now resolves a real author reference and hard-fails when no author document exists.

- **The Google Analytics snippet in `BaseHead.astro` is a vendor contract, and `arguments` in it is load-bearing.** `gtag.js` does not execute the entries it finds on `dataLayer`; it inspects them, and only an entry that is an `arguments` object counts as a gtag command. `function gtag(){ dataLayer.push(arguments) }` is therefore Google's snippet on purpose, and the more modern `function gtag( ...args ){ dataLayer.push( args ) }` pushes a plain `Array` that `gtag.js` reads as legacy GTM data and ignores. ESLint's `prefer-rest-params` actively pushes you toward the broken form — it is enabled here through `eslint-plugin-astro`'s processor, not through `eslint:recommended`, and it is **not** auto-fixable, so it fails `yarn lint` until a human resolves it by hand. That is exactly how analytics died in [c154186](https://github.com/nw-local/nw-local.com/commit/c154186) and stayed dead from 2026-05-01 to 2026-08-19: the commit that added lint to CI surfaced the error, and the error got "fixed". The rule is now scoped off for that one file in `eslint.config.mjs`, and `scripts/check-analytics-snippet.sh` (wired into `audit.yml` as `validate-analytics`, so it runs on every PR) asserts the built HTML still pushes `arguments`. **Two things make this class of bug worth a permanent note.** First, it fails completely silently in every direction: lint, `astro check`, the build, and the link checker all pass, the `gtag.js` request returns 200, and `window.google_tag_data` initialises in the page — the only symptom is the *absence* of a request to `google-analytics.com/g/collect`, and absences are what no check was looking for. The diagnostic that actually works is loading the page in a real browser and watching for that request, not reading the markup, which looks entirely correct. Second, `define:vars` wraps the inline script in an IIFE, so the snippet's `function gtag` is closure-scoped rather than global the way Google's copy-paste assumes; `window.gtag = gtag` is required or the first `gtag( "event", ... )` anyone adds throws `ReferenceError`. **Scoping an ESLint override onto an `.astro` client-side script is its own trap:** `eslint-plugin-astro` lints those blocks as virtual TypeScript files named `<file>.astro/<block>_<index>.ts`, so a `files` pattern covering only the `.astro` path does nothing, and `eslint --print-config <file>.astro` will cheerfully report the rule as off while `eslint <file>.astro` still errors, because the two resolve different files. Use `eslint --debug` to print the real block name.

## Sanity Content Model

| Document Type | Purpose |
|---------------|---------|
| `strain` | Cannabis strains with effects, terpenes, THC/CBD ranges, gallery |
| `product` | SKUs (flower, preroll, concentrate, edible) referencing a parent strain |
| `author` | Post authors with role, bio, photo, and profile links |
| `blogPost` | Blog posts with rich text body, tags, hero image, author reference |
| `retailer` | Dispensary partners with address, contact info, products carried |
| `page` | Singleton pages (home, about, contact) with flexible body content |
| `siteSettings` | Global config: title, logo, hero lockup, social links, contact info, age gate message |
| `retailerPage` | Wholesale page singleton: Cultivera storefront links, contact details, product sheets. Required, since a missing or empty one fails the build |

## Environment Variables

Required in `.env` (and as GitHub Actions secrets):

- `SANITY_PROJECT_ID` — Sanity project ID (`nyd3p2n0`)
- `SANITY_DATASET` — Sanity dataset name (`production`)
- `SANITY_API_TOKEN` — Read-only API token for build-time fetching

The GA4 measurement ID is deliberately **not** an env var. It is a public identifier — it ships in the HTML of every page, and Astro's `PUBLIC_` prefix means "inlined into the client bundle" — so it lives in `src/lib/analytics.ts` under version control. Storing it as a secret bought no secrecy and cost real things: it was invisible without console access, never appeared in a diff, and was one more file a fresh worktree lacked. `.env.example` never listed it while the README told contributors to set it, so following the setup instructions produced a build that threw. Do not move it back into `.env`; the only genuinely secret build input is `SANITY_API_TOKEN`.

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
