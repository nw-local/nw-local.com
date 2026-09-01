# Glossary Reference Library Final Fix Report

**Date:** 2026-08-31

**Implementation commit:** `4eed498` (`fix: harden glossary reference contracts`)

## Fixes

- Moved the progressive-enhancement controller into a dependency-free, testable module. Category filter discovery is scoped to the hidden control band and uses a marker that directory metadata cannot satisfy.
- Preserved the raw search input during input events, while continuing to normalize only for matching and URL serialization. Zero-result copy now names the active query.
- Allocated Portable Text heading IDs against one global used-ID set, including both natural-suffix order variants.
- Added shared Studio/runtime glossary validation. Blank aliases are rejected, absent Sanity aliases may be `null`, empty body arrays fail the featured contract, blank image alt text fails, and featured diagnostics accumulate `body`, `image`, `image.alt`, and `lastReviewedAt` together. Review dates remain optional for non-featured body entries.
- Replaced the glossary build check's fixed 59-document and permanently concise Cultivar assumptions with contracts derived from the built detail-page set.
- Cross-checked every directory entry's term, initial, category, normalized search text, visible definition/category, identity, link, and no-JavaScript visibility. Featured cards must match directory text and the detail image; constrained image URLs must carry Sanity crop rectangles.
- Added dynamic positive fixtures for corpus growth and concise-to-detailed content growth, plus isolated malformed fixtures for every search, card, image, and selector contract.
- Extracted shared glossary base/detail route helpers and covered `DefinedTerm.inDefinedTermSet` plus empty-alias omission.
- Added the browser-controller check to Make and CI. The CI-equivalent `make check` target now includes `check-drop-lookup` and `test-psychrometrics` as well.
- Corrected the built-check regression docstring and aligned README/testing documentation with the actual deploy, metadata, and hotspot coverage.

## TDD Evidence

- The new heading-order cases failed with duplicate `sources-2` IDs before the allocator change.
- The controller check first failed because the controller module did not exist; its real-controller harness now initializes with an intentionally ambiguous root selector and preserves `vapor ` while typing `pressure`.
- Runtime checks failed before implementation for missing accumulated `image.alt`, blank aliases, shared featured validation, route exports, and the actual Sanity `aliases: null` boundary.
- Built-output fixtures failed before implementation on the fixed 59 count, Cultivar's fixed concise status, unchecked entry metadata, selector compatibility, featured text, and missing crop rectangles.

## Verification

- `make format`: passed.
- `cd studio && yarn format`: passed.
- Focused red-green checks: `check-glossary`, `check-glossary-browser`, `check-portable-text-headings`, rendered glossary contracts, and malformed fixture regressions all passed.
- Final `make -j check`: exit 0 after a fresh Sanity-backed production build.
  - Astro built 93 pages.
  - Root lint passed.
  - Studio lint, type check, and format check passed.
  - Astro check reported 0 errors, 0 warnings, and 5 existing hints.
  - 195 heading anchors across 93 pages were unique.
  - Content style reported 94 clean rendered pages.
  - Analytics passed on 93 pages with 1 redirect stub exempt.
  - Robots, navigation, drop lookup, psychrometrics, glossary source/browser/heading checks, glossary build contracts, and malformed build fixtures all passed.
- `git diff --check`: passed before the implementation commit.
- No development or preview server was started.
