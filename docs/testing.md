# Automated testing

For a content-driven static site with no business logic, heavy testing is overkill — the failure modes are different from those of a typical app. The workflows are shaped around catching failure modes that *do* happen: broken queries, broken links, regressed SEO/perf signals, and content drift over time.

## Workflow layout

- [`ci.yml`](../.github/workflows/ci.yml) — runs on every PR and push to `main`. Type check + audit.
- [`audit.yml`](../.github/workflows/audit.yml) — **reusable** workflow (`workflow_call`) that does build + sitemap validation + link check + Lighthouse. Called by both CI and the nightly job.
- [`nightly.yml`](../.github/workflows/nightly.yml) — runs the same audit on a daily cron (08:27 UTC). Catches content drift on `main` between PRs (e.g., a Sanity-published strain whose Learn More link rotted last week), and gives Lighthouse a daily perf data point. Manual `workflow_dispatch` trigger for ad-hoc runs.
- [`deploy.yml`](../.github/workflows/deploy.yml) — builds and publishes to Pages. Not an audit workflow, but it carries one blocking check, and it is the **only** workflow on the path a content publish takes. See [Content publishes skip the audit workflow](#content-publishes-skip-the-audit-workflow).

## What each audit step does

- **Type check** (CI only) — `yarn astro check`. Catches broken GROQ query types, missing required fields on Sanity entity types, and Astro template errors. The data layer in [`src/lib/sanity.ts`](../src/lib/sanity.ts) parameterizes each `fetch<T>()` call with a typed entity (`Strain`, `Product`, etc.), so consumers in `.astro` pages get strict typing for free.
- **Build** — `yarn build`. Uploads `dist/` as an artifact for the audit jobs below.
- **Validate sitemap** — `xmllint` checks `dist/sitemap-index.xml` and `dist/sitemap-0.xml` are well-formed and contain `<loc>` entries.
- **Check links** — [Lychee](https://lychee.cli.rs/) walks every link in built HTML (internal + external). Accepts 200/301/302 plus 403/429 (bot-blockers and rate limits) so well-known breeder sites that block automated requests don't cause false positives. Blocking — broken links fail the check. A green result on the two `wa.cultiveramarket.com` storefront URLs is not evidence those URLs are right. Cultivera Market is a client-rendered SPA: the server returns the same shell for every path and resolves the slug in JavaScript afterwards. Requests for both real slugs and a deliberately fabricated control slug returned byte-identical 200s (7,659 bytes, same SHA), so an HTTP status check there asserts nothing and fails open — the same trap as the GROQ `match` operator in `CLAUDE.md`'s invariants. The slugs are correct because the operator confirmed them, and that is the only available source of truth. If one is ever mistyped, the link checker will stay green and the page will send licensed buyers to an empty storefront.
- **Check robots.txt** — [`scripts/check-robots.sh`](../scripts/check-robots.sh), run inside the sitemap job. Asserts `dist/robots.txt` exists, that its `Sitemap:` directive is absolute, and that its host matches the sitemap's own `<loc>` host. The site had no `robots.txt` at all until 2026-08-20; see [Silent-failure guards](#silent-failure-guards).
- **Validate analytics snippet** — [`scripts/check-analytics-snippet.sh`](../scripts/check-analytics-snippet.sh) asserts every built page still ships a Google Analytics snippet that can record hits. Redirect stubs emitted by `astro.config.mjs` `redirects` are exempt and reported in the pass line, since the browser leaves before a hit could be recorded; the exemption requires a meta refresh **and** a `noindex` **and** no `googletagmanager.com`, so a real page that merely gained a refresh tag still fails. See [Silent-failure guards](#silent-failure-guards) below for why this is a separate check rather than something the other steps would notice.
- **Validate content style** — [`scripts/check-content-style.py`](../scripts/check-content-style.py) reads the rendered prose and fails on British spelling, on a temperature given in only one unit, or on a pair written Celsius first. One of two checks that also run outside this workflow, as a blocking step in `deploy.yml`. See [Silent-failure guards](#silent-failure-guards) and [Content publishes skip the audit workflow](#content-publishes-skip-the-audit-workflow).
- **Validate threshold tables** — [`scripts/check-threshold-tables.py`](../scripts/check-threshold-tables.py) fails when a table's caption promises a numeric limit its own cells break. The other check that also runs as a blocking step in `deploy.yml`, for the same reason. Its unit tests, [`scripts/test-threshold-tables.py`](../scripts/test-threshold-tables.py), run first in the same job and need no build. See [Silent-failure guards](#silent-failure-guards).
- **Lighthouse audit** (informational, doesn't block PRs) — runs Lighthouse against the homepage, a strain page, and the about page; reports Performance, SEO, Accessibility, and Best Practices scores. HTML reports are uploaded to temporary public storage and linked in the workflow logs. Configured in [`lighthouserc.json`](../lighthouserc.json).

## Silent-failure guards

Three checks exist for failures where every positive signal stays green and the only symptom is an absence. All are worth understanding before touching them, because each looks redundant right up until it fires.

**A stalled nightly cron.** The nightly run is the only place external links get checked, so a stopped schedule silently removes that coverage. GitHub disables schedules in public repos after 60 days of inactivity without changing the workflow's reported state — `gh workflow list` still says `active`, and manual dispatches still succeed. `make check-nightly` (via the `nightly-freshness` job, on pushes to `main` only) fails when the last *completed, `event=schedule`* run is more than 3 days old.

**An analytics snippet that records nothing.** `gtag.js` inspects the entries it finds on `dataLayer` rather than executing them, and only treats an entry as a command when that entry is an `arguments` object. Rewriting Google's snippet to rest params pushes a plain `Array`, which it ignores — while the tag still loads, `gtag.js` still returns 200, and `window.google_tag_data` still initialises. Analytics recorded nothing from 2026-05-01 to 2026-08-19 for exactly this reason, and lint, `astro check`, the build, and the link checker were all green throughout. `make check-analytics` asserts the built HTML still pushes an `arguments` object and still assigns `window.gtag`; it runs on every PR, because the regression that caused it arrived in an unrelated formatting pass. Full rationale in the Invariants section of [`CLAUDE.md`](../CLAUDE.md).

**A number that is wrong but well formatted.** Every other check in this repo verifies *form*. Is the spelling US, does the temperature carry both units, is the anchor unique, does the page ship an analytics snippet. None of them can tell whether a published figure is *correct*, so a wrong number sails through all of them looking exactly like a right one. That is how five of the ten ceilings in the CO2 post's dew point table shipped above the threshold its own caption promised: every cell was a Magnus-equation result rounded to the nearest whole °F, which put the 74 °F night's 70 percent ceiling at an actual 71.00 percent. The overshoot is a fraction of a unit, so the cell looks unremarkable beside its neighbors, and there is no compiler for arithmetic in prose.

`make check-threshold-tables` reads the rendered tables and recomputes them. Two design choices matter. **Tables opt in by describing themselves** rather than by a registry: a caption naming a bound plus a column header of the form "under N percent" is enough to derive the check, so a new table of the same shape is covered the day it is published without anyone remembering to register it. A registry would have exactly the fail-open shape this document keeps warning about, looking like coverage while asserting nothing about the table nobody added. **A caption that promises a bound whose columns cannot be parsed fails as unverifiable**, rather than passing silently, so rewording a header cannot switch the check off while the caption keeps making its promise to the reader. If a table trips that guard and genuinely is not a threshold table, reword the caption: the caption is what makes the promise.

The detection is deliberately narrow. `holds`, `target` and `optimum` do not trigger it, because a table can describe a target without promising a limit. The CO2 post's "Humidity that holds the dry end of the VPD band" names no bound, and its cells are correctly rounded to nearest, sitting up to 0.42 points off the exact value. Widening the patterns would fail a table that never made a promise.

**Prose nobody proofreads.** Content style has no compiler. A British spelling or a lone Celsius figure renders perfectly, passes every other check, and is caught only if a human happens to read that sentence. Both got through: `Favoured temperature` reached a published table, paraphrased out of a botrytis paper, and `28 to 29 °C` shipped in a table aimed at growers who work in Fahrenheit. A *complete* pair can be wrong too, which is why unit order is a separate rule from unit pairing: `13 to 24 °C (55 to 75 °F)` carries both units and passed the pairing check on every run for weeks, sitting in the `Botrytis cinerea` glossary entry. Glossary text is worse than alt text for this, because one entry renders as a tooltip into every article that links the term — that single definition put Celsius first on four pages. Alt text is the worst of it, because nobody reads it while proofing — `pale grey backdrop` and `labelled as the trade` sat in two image asset `description` fields and rendered onto five pages. `make check-content-style` audits the built HTML, which is what makes it cover table cells, figure captions, alt text and meta descriptions without knowing which schema field produced any of them. It runs on every PR, on the nightly, and as a blocking step in `deploy.yml` — that third one is the only place it can stop bad prose reaching the site, for the reason in the next section.

## Content publishes skip the audit workflow

Content reaches production by a path no audit workflow watches, and this is worth stating plainly because the coverage looks complete from either end.

`audit.yml` triggers on `pull_request` and on the nightly cron. Both describe *code* changing. But publishing a document in Sanity fires a webhook that dispatches `deploy.yml` directly: no branch, no pull request, no review, and a rebuild that can land hours before the next nightly run. So for content — the thing the style rules were written for — the dist-validating checks did not run at all. The failure mode had the usual shape: the publish succeeded, the deploy went green, the site updated, and the only evidence was a British spelling sitting on a live page until someone happened to read it.

`deploy.yml` therefore runs `check-content-style.py` itself, against the `dist/` the build step just produced. It is the last step of the `build` job and `deploy` declares `needs: build`, so a failure skips deployment entirely and the previously deployed site stays live. **The visible symptom of a rejected publish is that the content does not appear on the site.** There is no notification: if an editor publishes and the change never shows up, this check is the first thing to look at.

Only this one check is duplicated here. `robots` and the analytics snippet can only be broken by a code change, which always goes through a pull request and is already covered. Link checking is the other one content can genuinely break — a post linking to a deleted page — but it needs the built site served and is much slower, and `deploy.yml` is already serialized behind a Pages concurrency group that a document-batch publish floods. The nightly run covers it instead, within 24 hours.

### The allowlist

Because a failure now blocks deploys, [`scripts/content-style-allow.txt`](../scripts/content-style-allow.txt) exempts phrases that must keep a British spelling. A cited paper title is the case it exists for: Americanizing a word inside someone else's title misquotes them, and with no escape hatch the only options would have been altering a citation or an urgent commit while deploys were frozen.

Two properties keep it from becoming the fail-open hole an allowlist invites. Exemption is by **character span, not by page**, so an exempted citation does not also excuse a genuine misspelling elsewhere in the same document. And an entry matching nothing is reported on every run, because a stale entry silently widens what is exempt as soon as some future page happens to contain it. Adding a word to the exemption list is always wrong where removing it from `SPELLINGS` would be: the point is to exempt the quotation, not the word.

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
- **The print stylesheet is invisible to every check here, and reading the CSS does not substitute
  for rendering it.** `@media print` rules never run during a build, a type check, a link check, or
  a Lighthouse audit, and a page that prints as a blank sheet is byte-identical on screen — this is
  the same shape as the analytics snippet above, where the only symptom was an absence. Grep proves
  the block shipped, nothing more. Render it: copy `dist/` aside, rewrite the absolute `/_astro/`
  asset paths relative (a `file://` URL resolves a leading slash against the filesystem root, so the
  stylesheet silently 404s and the page renders in Times New Roman, which reads as "the print rules
  did nothing"), then `Google Chrome --headless --print-to-pdf` the page and rasterize with
  `pdftoppm` to look at it. Do not build the relative prefix with `seq 1 $depth`: BSD `seq` counts
  *down* when the first operand exceeds the last, so `seq 1 0` emits two lines where GNU `seq` emits
  none, and a depth-0 page comes out with a `../../` prefix and no stylesheet at all. That bug made
  a correct stylesheet look broken. Two print regressions were caught this way and by nothing else:
  a bare `header` selector that deleted every article's own title block, and a `.hero-backdrop`
  selector that deleted the homepage's entire masthead.

## Considered for future addition

- **Playwright smoke test** — build the site and verify the homepage and a strain detail page render with expected content. Would catch dead pages from broken queries or missing layouts that Lighthouse may not surface.

## Out of scope

- **Unit tests** — most code is data fetching and static rendering; minimal logic to test in isolation.
- **Visual regression** — overkill unless the design is iterating frequently.
- **Content metadata** (missing alt text, ghost terpenes, missing required fields) — already covered by the [`/audit-content`](../README.md#claude-code-skills) skill, which can be run on a schedule rather than as a CI gate.
