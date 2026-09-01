# Automated testing

For a content-driven static site with a small isolated logic surface, a general-purpose test framework would add more machinery than value. The checks are shaped around failures that *do* happen here: broken queries, broken links, regressed SEO/perf signals, controller regressions, and content drift over time.

## Workflow layout

- [`ci.yml`](../.github/workflows/ci.yml) — runs on every PR and push to `main`. Type checks, Studio checks, glossary source and browser contracts, author structured data, Portable Text headings, drop lookup, psychrometrics, and navigation, then calls the audit. Pushes also check nightly freshness.
- [`audit.yml`](../.github/workflows/audit.yml) — **reusable** workflow (`workflow_call`) that builds once, then validates sitemap XML, robots.txt, analytics, content style, email routing, heading anchors, glossary output, links, and Lighthouse. Called by both CI and the nightly job.
- [`nightly.yml`](../.github/workflows/nightly.yml) — runs the same audit on a daily cron (08:27 UTC). Catches content drift on `main` between PRs (e.g., a Sanity-published strain whose Learn More link rotted last week), and gives Lighthouse a daily perf data point. Manual `workflow_dispatch` trigger for ad-hoc runs.
- [`deploy.yml`](../.github/workflows/deploy.yml) — builds and publishes to Pages. Not an audit workflow, but it carries the three content-sensitive blocking checks, and it is the **only** workflow on the path a content publish takes. See [Content publishes skip the audit workflow](#content-publishes-skip-the-audit-workflow).

## What each check does

`make check` is the local aggregate. It runs lint, type and Studio checks, the production build, dependency-free source checks, and the repository-owned rendered-output checks. It does **not** run the audit workflow's sitemap XML validation, Lychee link jobs, or informational Lighthouse job. Sitemap XML and Lychee therefore remain CI-only; external links are enabled only by the nightly caller because network failures should not block an unrelated pull request.

- **Type check** (local aggregate and CI) — `yarn astro check`. Catches broken GROQ query types, missing required fields on Sanity entity types, and Astro template errors. The data layer in [`src/lib/sanity.ts`](../src/lib/sanity.ts) parameterizes each `fetch<T>()` call with a typed entity (`Strain`, `Product`, etc.), so consumers in `.astro` pages get strict typing for free.
- **Validate glossary source contracts and search mechanics** (local aggregate and CI) — `make check-glossary` runs dependency-free fixtures for category and alias validation, JSON-LD, search text, combined filters, and URL filter serialization. It protects the pure data and search helpers, but cannot establish that the templates emitted their controls or that published content produced valid pages.
- **Validate glossary browser behavior** (local aggregate and CI) — `make check-glossary-browser` runs the real progressive-enhancement controller against a small dependency-free DOM boundary. It proves filter discovery stays inside the control band, multi-word typing preserves the input value, clicking an active letter or topic deselects it, zero results name the active query, and `popstate` restores state. It does not replace the manual keyboard and visual checks below.
- **Validate author structured data** (local aggregate and CI) — `make check-person-jsonld` runs `buildPerson` against a complete author fixture and asserts the canonical profile URL and optional direct email reach the resulting `Person`. It protects the person-scoped contact boundary without depending on live Sanity content.
- **Validate email routing** (local aggregate, CI audit, and deploy) — `make check-email-routing` inspects the built site and fails if the personal address appears outside Ben Petty's author page, if the contact and retailer pages lose the sales address, or if any other `@nw-local.com` address reaches a generated artifact. Isolated malformed fixtures prove each negative check fails closed. The deploy copy protects content-only changes because Sanity publishes bypass pull-request CI.
- **Build** (local aggregate and CI) — `yarn build`. CI uploads `dist/` as an artifact for the audit jobs below; local checks consume it in place.
- **Validate sitemap XML** (CI audit only) — `xmllint` checks `dist/sitemap-index.xml` and `dist/sitemap-0.xml` are well-formed and contain `<loc>` entries. `make check` does not install or invoke `xmllint`.
- **Check links** (CI audit only) — [Lychee](https://lychee.cli.rs/) checks internal links offline on pull requests and pushes to `main`; the nightly run additionally checks external links over the network. The external run accepts 200/202/301/302 plus 403/429 (bot-blockers and rate limits) so well-known breeder sites that block automated requests do not cause false positives. Broken links remain blocking. A green result on the two `wa.cultiveramarket.com` storefront URLs is not evidence those URLs are right. Cultivera Market is a client-rendered SPA: the server returns the same shell for every path and resolves the slug in JavaScript afterwards. Requests for both real slugs and a deliberately fabricated control slug returned byte-identical 200s (7,659 bytes, same SHA), so an HTTP status check there asserts nothing and fails open — the same trap as the GROQ `match` operator in `CLAUDE.md`'s invariants. The slugs are correct because the operator confirmed them, and that is the only available source of truth. If one is ever mistyped, the link checker will stay green and the page will send licensed buyers to an empty storefront.
- **Check robots.txt** (local aggregate and CI audit) — [`scripts/check-robots.sh`](../scripts/check-robots.sh), run inside the sitemap job in CI. Asserts `dist/robots.txt` exists, that its `Sitemap:` directive is absolute, and that its host matches the sitemap's own `<loc>` host. The site had no `robots.txt` at all until 2026-08-20; see [Silent-failure guards](#silent-failure-guards).
- **Validate analytics snippet** (local aggregate and CI audit) — [`scripts/check-analytics-snippet.sh`](../scripts/check-analytics-snippet.sh) asserts every built page still ships a Google Analytics snippet that can record hits. Redirect stubs emitted by `astro.config.mjs` `redirects` are exempt and reported in the pass line, since the browser leaves before a hit could be recorded; the exemption requires a meta refresh **and** a `noindex` **and** no `googletagmanager.com`, so a real page that merely gained a refresh tag still fails. See [Silent-failure guards](#silent-failure-guards) below for why this is a separate check rather than something the other steps would notice.
- **Validate content style** (local aggregate, CI audit, and deploy) — [`scripts/check-content-style.py`](../scripts/check-content-style.py) reads the rendered prose and fails on British spelling, on a temperature given in only one unit, or on a pair written Celsius first. It is one of the three content-sensitive checks duplicated in `deploy.yml`. See [Silent-failure guards](#silent-failure-guards) and [Content publishes skip the audit workflow](#content-publishes-skip-the-audit-workflow).
- **Validate heading anchors** (local aggregate and CI audit) — [`scripts/check-heading-anchors.py`](../scripts/check-heading-anchors.py) fails when two headings on one rendered page share an ID.
- **Validate glossary output** (local aggregate, CI audit, and deploy) — `make check-glossary-build` derives the expected directory from every built glossary detail page instead of pinning a document count or a permanently concise example. For every directory entry it verifies the controller hooks, canonical term, initial, category, normalized search text, visible definition and category, and link. Detail pages may add one modest Portable Text explanation, but the checker structurally rejects promotional sections, editorial figures, reading-time copy, and article navigation so the glossary cannot quietly grow a second article system. `make check` also runs isolated malformed-fixture regressions for these contracts. The deploy copy fails before GitHub Pages receives the artifact, leaving the prior deployment live.
- **Lighthouse audit** (CI audit only, informational) — runs Lighthouse against the homepage, a strain page, and the about page; reports Performance, SEO, Accessibility, and Best Practices scores. HTML reports are uploaded to temporary public storage and linked in the workflow logs. Configured in [`lighthouserc.json`](../lighthouserc.json).

## Silent-failure guards

Three checks exist for failures where every positive signal stays green and the only symptom is an absence. All are worth understanding before touching them, because each looks redundant right up until it fires.

**A stalled nightly cron.** The nightly run is the only place external links get checked, so a stopped schedule silently removes that coverage. GitHub disables schedules in public repos after 60 days of inactivity without changing the workflow's reported state — `gh workflow list` still says `active`, and manual dispatches still succeed. `make check-nightly` (via the `nightly-freshness` job, on pushes to `main` only) fails when the last *completed, `event=schedule`* run is more than 3 days old.

**An analytics snippet that records nothing.** `gtag.js` inspects the entries it finds on `dataLayer` rather than executing them, and only treats an entry as a command when that entry is an `arguments` object. Rewriting Google's snippet to rest params pushes a plain `Array`, which it ignores — while the tag still loads, `gtag.js` still returns 200, and `window.google_tag_data` still initialises. Analytics recorded nothing from 2026-05-01 to 2026-08-19 for exactly this reason, and lint, `astro check`, the build, and the link checker were all green throughout. `make check-analytics` asserts the built HTML still pushes an `arguments` object and still assigns `window.gtag`; it runs on every PR, because the regression that caused it arrived in an unrelated formatting pass. Full rationale in the Invariants section of [`CLAUDE.md`](../CLAUDE.md).

**Prose nobody proofreads.** Content style has no compiler. A British spelling or a lone Celsius figure renders perfectly, passes every other check, and is caught only if a human happens to read that sentence. Both got through: `Favoured temperature` reached a published table, paraphrased out of a botrytis paper, and `28 to 29 °C` shipped in a table aimed at growers who work in Fahrenheit. A *complete* pair can be wrong too, which is why unit order is a separate rule from unit pairing: `13 to 24 °C (55 to 75 °F)` carries both units and passed the pairing check on every run for weeks, sitting in the `Botrytis cinerea` glossary entry. Glossary text is worse than alt text for this, because one entry renders as a tooltip into every article that links the term — that single definition put Celsius first on four pages. Alt text is the worst of it, because nobody reads it while proofing — `pale grey backdrop` and `labelled as the trade` sat in two image asset `description` fields and rendered onto five pages. `make check-content-style` audits the built HTML, which is what makes it cover table cells, figure captions, alt text and meta descriptions without knowing which schema field produced any of them. It runs on every PR, on the nightly, and as a blocking step in `deploy.yml` — that third one is the only place it can stop bad prose reaching the site, for the reason in the next section.

## What is no longer checked

**Arithmetic in published prose.** Every check here verifies *form*: is the spelling US, does the temperature carry both units, is the anchor unique, does the page ship an analytics snippet. None can tell whether a published figure is *correct*, so a wrong number passes all of them looking exactly like a right one. That is how five of the ten ceilings in the CO2 post's dew point table once shipped above the limit its own caption promised, every cell a Magnus-equation result rounded to the nearest whole degree rather than down.

A checker for this existed and was removed on 2026-08-27. It read rendered tables out of `dist/` and recomputed them, which meant an assertion living in this repo about prose living in Sanity, on a different release cadence from the thing it described. By the end it covered exactly one table, and that table was deleted for being a constant displayed as eleven rows.

The defense now is to recompute rather than to verify after the fact. [`scripts/psychrometrics.py`](../scripts/psychrometrics.py) computes the figures at drafting time, and [`scripts/test-psychrometrics.py`](../scripts/test-psychrometrics.py) pins its constants against values already published, running in `ci.yml` with no build required. The rounding rule it encodes still holds whenever a published figure sits under a stated limit: a ceiling rounds down and a minimum rounds up, because rounding to nearest is what steps over the line.

## Content publishes skip the audit workflow

Content reaches production by a path no audit workflow watches, and this is worth stating plainly because the coverage looks complete from either end.

`ci.yml` calls the reusable audit on pull requests and pushes to `main`, while `nightly.yml` calls it on the daily cron. Neither path runs at publish time. Publishing a document in Sanity fires a webhook that dispatches `deploy.yml` directly: no branch, no pull request, no review, and a rebuild that can land hours before the next nightly run. Before the deploy checks existed, content-sensitive dist validation did not run on that path. The failure mode had the usual shape: the publish succeeded, the deploy went green, the site updated, and the only evidence was a British spelling sitting on a live page until someone happened to read it.

`deploy.yml` therefore runs both `check-content-style.py` and `check-glossary-build.py` against the `dist/` the build step just produced. They are the final validation steps in the `build` job and `deploy` declares `needs: build`, so a failure in either skips deployment entirely and the previously deployed site stays live. **The visible site symptom of a rejected publish is that the content does not appear.** If an editor publishes and the change never shows up, the failed deploy run is the first place to look.

Three checks are duplicated here: content style, email routing, and the glossary build contract. `robots` and the analytics snippet can only be broken by a code change, which always goes through a pull request and is already covered. Link checking is another check content can genuinely break — a post linking to a deleted page — but it needs the built site served and is much slower, and `deploy.yml` is already serialized behind a Pages concurrency group that a document-batch publish floods. The nightly run covers it instead, within 24 hours.

The glossary build contract is also duplicated there. A published glossary document can change the directory's category, aliases, body, or related references without a code diff; `check-glossary-build.py` reads the emitted pages, so it is the guard that confirms both the code path and the content-only path preserve the same glossary contract.

### The allowlist

Because a failure now blocks deploys, [`scripts/content-style-allow.txt`](../scripts/content-style-allow.txt) exempts phrases that must keep a British spelling. A cited paper title is the case it exists for: Americanizing a word inside someone else's title misquotes them, and with no escape hatch the only options would have been altering a citation or an urgent commit while deploys were frozen.

Two properties keep it from becoming the fail-open hole an allowlist invites. Exemption is by **character span, not by page**, so an exempted citation does not also excuse a genuine misspelling elsewhere in the same document. And an entry matching nothing is reported on every run, because a stale entry silently widens what is exempt as soon as some future page happens to contain it. Adding a word to the exemption list is always wrong where removing it from `SPELLINGS` would be: the point is to exempt the quotation, not the word.

**A missing file.** The two guards above catch things that *broke*. `robots.txt` was never created in the first place, so `https://nw-local.com/robots.txt` returned the 404 page for the life of the site, and crawlers had no sitemap pointer beyond the `<link rel="sitemap">` hint in the page head. Nothing regressed, no check went red, and a file that has never existed leaves no trace in a diff to notice. It is now generated by [`src/pages/robots.txt.ts`](../src/pages/robots.txt.ts) and asserted by `make check-robots`. When auditing this site, ask what *should* exist and does not, not only what changed.

Note that the link checker cannot catch a related class of problem either: `audit.yml` excludes `^https?://(www\.)?nw-local\.com` from Lychee, because each page's canonical tag is self-referencing and unresolvable until after its PR merges. A canonical pointing at the wrong host of your own domain is therefore invisible to it.

## Manual verification of built output

### Manual glossary interaction checklist

Use the existing local server after a glossary change; do not start another one for this check.

- **Instant search:** enter a canonical term, an alias, and definition text. Results and the live count update while typing.
- **Combined filters:** choose a letter and a topic, then add a search query. Only terms meeting every active filter remain; clicking an active letter or topic deselects it, and Clear filters restores the full directory.
- **URL state:** reload a filtered URL, then use Back and Forward after changing filters. The input, pressed buttons, result set, and URL stay synchronized.
- **Keyboard operation:** tab to the search field, filter buttons, clear button, and directory links. Visible focus appears, Space or Enter activates or deselects a filter, and Clear returns focus to the search field.
- **Responsive layout:** check the directory and filter rails at a narrow viewport as well as desktop width. Controls remain usable without clipped content or horizontal overflow.
- **Zero results:** search for text that cannot match. The empty state names the active query, and Clear filters restores the directory.
- **Definition-only entries:** open an entry without an expanded explanation. It has no empty body region or article-style metadata.
- **Expanded explanations:** open EC and one definition-only term. EC may add concise supporting context, while neither page should look or read like a blog article.

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

- **General-purpose unit-test framework** — most code is data fetching and static rendering. The dependency-free glossary, drop, heading, and psychrometric checks cover the isolated logic that warrants it.
- **Visual regression** — overkill unless the design is iterating frequently.
- **Content metadata outside the glossary contract** (ghost terpenes and missing fields on other document types) — covered by the [`/audit-content`](../README.md#claude-code-skills) skill, which can be run on a schedule rather than as a CI gate. Glossary category and search metadata remain blocking build contracts.
