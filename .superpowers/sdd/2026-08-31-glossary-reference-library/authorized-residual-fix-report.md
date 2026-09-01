# Glossary Reference Library Authorized Residual Fix Report

**Date:** 2026-08-31

## Authorized scope

This round addressed only the three residual review findings authorized after the final fix report:

1. Remove the glossary build regression fixture's dependency on Cultivar remaining concise.
2. Fail closed when the browser controller's query-input or directory-entry hooks are absent.
3. Correct local, CI audit, nightly link, and content-triggered deploy coverage claims.

## Changes

- The corpus-growth fixture now constructs a complete synthetic concise entry at an unused fixture slug, then expands that entry for the body-growth case. It no longer clones Cultivar or appends content to a document whose editorial state it does not own.
- A separate regression first makes Cultivar long-form when needed, then proves the independently constructed growth case still passes. The body helper itself rejects attempts to append a second Portable Text body.
- The rendered checker now requires the `data-glossary-query` hook on the labeled search input and `data-glossary-entry` on every directory entry. These are the selectors consumed by `src/lib/glossary-browser.ts`.
- Isolated mutation fixtures remove each hook independently and require one exact failure from the checker.
- `make check`, README, and testing documentation now call the target a local aggregate. They explicitly identify sitemap XML validation, Lychee link checks, and Lighthouse as CI-only, distinguish nightly external-link coverage, and document both deploy-time Sanity-content guards: content style and the rendered glossary contract.

## TDD evidence

Before the checker and fixture changes, `python3 scripts/test-check-glossary-build.py dist` failed in the three intended ways:

- the simulated already-long-form Cultivar received a second Portable Text body and failed the one-body/one-contents contract;
- removing `data-glossary-query` was accepted with exit 0; and
- removing `data-glossary-entry` was accepted with exit 0.

After the minimal fixes, the same command passed all positive and isolated malformed-fixture cases. `./scripts/check-glossary-build.py dist` also passed the pristine production build.

## Verification

- `make format`: passed.
- Focused GREEN: `python3 scripts/test-check-glossary-build.py dist`: passed.
- Focused GREEN: `./scripts/check-glossary-build.py dist`: passed.
- `git diff --check`: passed.
- Fresh `make -j check`: passed after rerunning with network access for the Sanity-backed build. The sandboxed attempt failed only at DNS resolution for `nyd3p2n0.api.sanity.io`.
  - Astro built 93 pages.
  - Root lint passed.
  - Studio lint, type check, and format check passed.
  - Astro check reported 0 errors, 0 warnings, and 5 existing hints.
  - 195 heading anchors across 93 pages were unique.
  - Content style reported 94 clean rendered pages.
  - Analytics passed on 93 pages with 1 redirect stub exempt.
  - Glossary source, browser, heading, rendered-output, and malformed-fixture checks passed.
  - Robots, navigation, drop lookup, and psychrometric checks passed.
- No development or preview server was started.
