# Automated testing

For a content-driven static site with no business logic, heavy testing is overkill — the failure modes are different from those of a typical app. The workflows are shaped around catching failure modes that *do* happen: broken queries, broken links, regressed SEO/perf signals, and content drift over time.

## Workflow layout

- [`ci.yml`](../.github/workflows/ci.yml) — runs on every PR and push to `main`. Type check + audit.
- [`audit.yml`](../.github/workflows/audit.yml) — **reusable** workflow (`workflow_call`) that does build + sitemap validation + link check + Lighthouse. Called by both CI and the nightly job.
- [`nightly.yml`](../.github/workflows/nightly.yml) — runs the same audit on a daily cron (08:27 UTC). Catches content drift on `main` between PRs (e.g., a Sanity-published strain whose Learn More link rotted last week), and gives Lighthouse a daily perf data point. Manual `workflow_dispatch` trigger for ad-hoc runs.

## What each audit step does

- **Type check** (CI only) — `yarn astro check`. Catches broken GROQ query types, missing required fields on Sanity entity types, and Astro template errors. The data layer in [`src/lib/sanity.ts`](../src/lib/sanity.ts) parameterizes each `fetch<T>()` call with a typed entity (`Strain`, `Product`, etc.), so consumers in `.astro` pages get strict typing for free.
- **Build** — `yarn build`. Uploads `dist/` as an artifact for the audit jobs below.
- **Validate sitemap** — `xmllint` checks `dist/sitemap-index.xml` and `dist/sitemap-0.xml` are well-formed and contain `<loc>` entries.
- **Check links** — [Lychee](https://lychee.cli.rs/) walks every link in built HTML (internal + external). Accepts 200/301/302 plus 403/429 (bot-blockers and rate limits) so well-known breeder sites that block automated requests don't cause false positives. Blocking — broken links fail the check.
- **Lighthouse audit** (informational, doesn't block PRs) — runs Lighthouse against the homepage, a strain page, and the about page; reports Performance, SEO, Accessibility, and Best Practices scores. HTML reports are uploaded to temporary public storage and linked in the workflow logs. Configured in [`lighthouserc.json`](../lighthouserc.json).

## Considered for future addition

- **Playwright smoke test** — build the site and verify the homepage and a strain detail page render with expected content. Would catch dead pages from broken queries or missing layouts that Lighthouse may not surface.

## Out of scope

- **Unit tests** — most code is data fetching and static rendering; minimal logic to test in isolation.
- **Visual regression** — overkill unless the design is iterating frequently.
- **Content metadata** (missing alt text, ghost terpenes, missing required fields) — already covered by the [`/audit-content`](../README.md#claude-code-skills) skill, which can be run on a schedule rather than as a CI gate.
