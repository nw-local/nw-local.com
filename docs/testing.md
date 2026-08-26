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
- **Check links** — [Lychee](https://lychee.cli.rs/) walks every link in built HTML (internal + external). Accepts 200/301/302 plus 403/429 (bot-blockers and rate limits) so well-known breeder sites that block automated requests don't cause false positives. Blocking — broken links fail the check. A green result on the two `wa.cultiveramarket.com` storefront URLs is not evidence those URLs are right. Cultivera Market is a client-rendered SPA: the server returns the same shell for every path and resolves the slug in JavaScript afterwards. Requests for both real slugs and a deliberately fabricated control slug returned byte-identical 200s (7,659 bytes, same SHA), so an HTTP status check there asserts nothing and fails open — the same trap as the GROQ `match` operator in `CLAUDE.md`'s invariants. The slugs are correct because the operator confirmed them, and that is the only available source of truth. If one is ever mistyped, the link checker will stay green and the page will send licensed buyers to an empty storefront.
- **Check robots.txt** — [`scripts/check-robots.sh`](../scripts/check-robots.sh), run inside the sitemap job. Asserts `dist/robots.txt` exists, that its `Sitemap:` directive is absolute, and that its host matches the sitemap's own `<loc>` host. The site had no `robots.txt` at all until 2026-08-20; see [Silent-failure guards](#silent-failure-guards).
- **Validate analytics snippet** — [`scripts/check-analytics-snippet.sh`](../scripts/check-analytics-snippet.sh) asserts every built page still ships a Google Analytics snippet that can record hits. See [Silent-failure guards](#silent-failure-guards) below for why this is a separate check rather than something the other steps would notice.
- **Validate content style** — [`scripts/check-content-style.py`](../scripts/check-content-style.py) reads the rendered prose and fails on British spelling or on a temperature given in only one unit. See [Silent-failure guards](#silent-failure-guards).
- **Lighthouse audit** (informational, doesn't block PRs) — runs Lighthouse against the homepage, a strain page, and the about page; reports Performance, SEO, Accessibility, and Best Practices scores. HTML reports are uploaded to temporary public storage and linked in the workflow logs. Configured in [`lighthouserc.json`](../lighthouserc.json).

## Silent-failure guards

Two checks exist for failures where every positive signal stays green and the only symptom is an absence. Both are worth understanding before touching them, because both look redundant right up until they fire.

**A stalled nightly cron.** The nightly run is the only place external links get checked, so a stopped schedule silently removes that coverage. GitHub disables schedules in public repos after 60 days of inactivity without changing the workflow's reported state — `gh workflow list` still says `active`, and manual dispatches still succeed. `make check-nightly` (via the `nightly-freshness` job, on pushes to `main` only) fails when the last *completed, `event=schedule`* run is more than 3 days old.

**An analytics snippet that records nothing.** `gtag.js` inspects the entries it finds on `dataLayer` rather than executing them, and only treats an entry as a command when that entry is an `arguments` object. Rewriting Google's snippet to rest params pushes a plain `Array`, which it ignores — while the tag still loads, `gtag.js` still returns 200, and `window.google_tag_data` still initialises. Analytics recorded nothing from 2026-05-01 to 2026-08-19 for exactly this reason, and lint, `astro check`, the build, and the link checker were all green throughout. `make check-analytics` asserts the built HTML still pushes an `arguments` object and still assigns `window.gtag`; it runs on every PR, because the regression that caused it arrived in an unrelated formatting pass. Full rationale in the Invariants section of [`CLAUDE.md`](../CLAUDE.md).

**Prose nobody proofreads.** Content style has no compiler. A British spelling or a lone Celsius figure renders perfectly, passes every other check, and is caught only if a human happens to read that sentence. Both got through: `Favoured temperature` reached a published table, paraphrased out of a botrytis paper, and `28 to 29 °C` shipped in a table aimed at growers who work in Fahrenheit. Alt text is the worst of it, because nobody reads it while proofing — `pale grey backdrop` and `labelled as the trade` sat in two image asset `description` fields and rendered onto five pages. `make check-content-style` audits the built HTML, which is what makes it cover table cells, figure captions, alt text and meta descriptions without knowing which schema field produced any of them. It runs on every PR *and* on the nightly, and the nightly half matters more here than elsewhere: publishing in Sanity changes the prose with no diff for a reviewer to look at.

**A missing file.** The two guards above catch things that *broke*. `robots.txt` was never created in the first place, so `https://nw-local.com/robots.txt` returned the 404 page for the life of the site, and crawlers had no sitemap pointer beyond the `<link rel="sitemap">` hint in the page head. Nothing regressed, no check went red, and a file that has never existed leaves no trace in a diff to notice. It is now generated by [`src/pages/robots.txt.ts`](../src/pages/robots.txt.ts) and asserted by `make check-robots`. When auditing this site, ask what *should* exist and does not, not only what changed.

Note that the link checker cannot catch a related class of problem either: `audit.yml` excludes `^https?://(www\.)?nw-local\.com` from Lychee, because each page's canonical tag is self-referencing and unresolvable until after its PR merges. A canonical pointing at the wrong host of your own domain is therefore invisible to it.

## Manual verification of built output

Content changes are routinely verified by grepping `dist/` directly, outside CI — publish in Sanity,
`make build`, then assert the markup landed. With no test framework, these greps are the whole
automated surface, so it matters that they assert what they look like they assert. Two gotchas recur:

- **Count occurrences with `grep -o 'pattern' file | wc -l`, never `grep -c`.** `grep -c` counts
  matching *lines*, and Astro emits minified single-line HTML, so `grep -c` silently returns `1`
  regardless of how many times a pattern actually occurs. Confirm it on the feed: `grep -c
  'dc:creator' dist/rss.xml` returns `1`, while `grep -o 'dc:creator' dist/rss.xml | wc -l` returns
  two per post (an opening and a closing tag each). A verification step written the first way reads
  as satisfied for the wrong reason, and one has already shipped that way.
- **Glossary anchor text is whitespace-padded, and each term appears twice.** `GlossaryTerm.astro`
  renders its `<slot />` on its own line, so a glossary anchor's inner text is `> EC <`, not `>EC<` —
  a grep for `>EC<` finds nothing even when the mark is correctly placed. The hover card also emits a
  second `<a>` to the same href, with `class="glossary-tip-cta"`, so a plain `href="..."` grep
  double-counts. Match on `class="glossary-term"` to select only the real mark.
- **A scroll-driven or compositor-driven animation cannot be verified by reading it straight after a
  scroll.** Two traps, both of which make working code look broken and broken code look fine. First,
  these animations are committed on the compositor, so calling `getComputedStyle` immediately after
  `window.scrollTo` returns a stale frame — sample after two `requestAnimationFrame` ticks, not one,
  or a working parallax reads as frozen. Second, a *misconfigured* scroll timeline does not error,
  warn, or log; it renders as a completely static element, and `getAnimations()` will still report a
  live animation with `playState: "running"`. Confirming the animation exists therefore proves
  nothing about whether its timeline can advance. The only sound check is to sample the transform at
  several scroll offsets and assert it changes between the first two and progresses monotonically
  across the rest. Drive the built `dist/` with a throwaway static server for this; never start the
  dev server.

## Considered for future addition

- **Playwright smoke test** — build the site and verify the homepage and a strain detail page render with expected content. Would catch dead pages from broken queries or missing layouts that Lighthouse may not surface.

## Out of scope

- **Unit tests** — most code is data fetching and static rendering; minimal logic to test in isolation.
- **Visual regression** — overkill unless the design is iterating frequently.
- **Content metadata** (missing alt text, ghost terpenes, missing required fields) — already covered by the [`/audit-content`](../README.md#claude-code-skills) skill, which can be run on a schedule rather than as a CI gate.
