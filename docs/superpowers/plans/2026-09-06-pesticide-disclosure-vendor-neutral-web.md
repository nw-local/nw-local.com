# Vendor-Neutral Pesticide Disclosure — Website Phase Implementation Plan

> **For agentic workers:** this is a tightly-coupled rename that conforms the public site to
> the `publicCode` doc contract fixed by the ops phase (`nw-local-ops` #367). The whole
> surface changes in lockstep — it does not land task-by-task with green tests between, so it
> is executed **inline** in one worktree, guarded by the repo's existing pesticide contract
> suite, not via subagent-driven-development.

**Goal:** Rename the public pesticide-disclosure lookup from a Cultivera-keyed surface
(`lotCultiveraId` / `/pesticides/<cultiveraId>` / "Cultivera number") to the vendor-neutral
`publicCode` (`NWL-XXXXX`) contract the ops side now publishes.

**Architecture:** A mechanical field/route/copy rename across the Sanity schema, the shared
lib (interface, allowlists, projection, queries, asserts, static-path builder), the route
file, the index, the display component, the browser search, and their tests/fixtures — plus
two genuine additions: (1) `assertPesticideDisclosure` validates `publicCode` matches
`NWL-` + 5 Crockford-base32 chars; (2) the Python build checker asserts the page carries no
"Cultivera" text. The legitimate Cultivera *marketplace* surface (`CultiveraImageLink`,
`cultiveraMarketProductId`, "Order on Cultivera", `DropPortal`) is **out of scope and
untouched** — Cultivera is the real wholesale marketplace; vendor-neutrality governs the
*compliance/public-identity* surface only.

**Tech Stack:** Astro, Sanity (Studio schema), TypeScript, vitest, Python 3 (dist checker).

**Spec:** `nw-local-ops:docs/superpowers/specs/2026-09-05-pesticide-disclosure-vendor-neutral-design.md`
(§ "Website side", "Doc contract", "Testing").

## Global Constraints

- **Doc contract (owned by ops):** `_id: disclosure.<lot-uuid>` (unchanged), `publicCode`
  (renamed from `lotCultiveraId`; the route/query key), `strain`, `grade` (omitted when
  blank), `noneApplied`, `applications[]`. **No vendor identifier appears in the doc.**
- **`publicCode` format:** `NWL-` + 5 Crockford-base32 chars, alphabet
  `0123456789ABCDEFGHJKMNPQRSTVWXYZ` (excludes I L O U). Pattern:
  `/^NWL-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{5}$/`. Stored uppercase; the route normalizes input case.
- **`_id` and `publicCode` are independent identifiers** — as in SP3, the id cannot be
  cross-checked against the query key; each is validated by its own shape.
- **Fixture codes:** applied fixture (Blue Dream / Top Shelf) → `NWL-4A7KP`; none-applied
  fixture (Gelato #33 / Value) → `NWL-9G2TX`. The applied fixture's code is the checker's
  `EXPECTED_FIXTURE_LOT_CODE`.
- **The neutral row attribute `data-disclosure-row-id` stays** (already vendor-neutral); only
  the landmark attribute `data-disclosure-lot-cultivera-id` → `data-disclosure-lot-code`.
- **No "Cultivera" string in the disclosure consumer surface** (schema description, index,
  component, route copy). Marketplace surfaces elsewhere keep theirs.
- **No local full `make check`** (build needs Sanity env, absent in a fresh worktree). Guard
  locally with: `check-pesticide-disclosure-contract`, `test-pesticide-disclosure`,
  `test-check-pesticide-disclosure-build`, `lint`, and `tsc`/`astro check` where env-free.
  The build-gated `check-pesticide-disclosure-build` runs in CI.

---

## Task 1: Sanity schema field rename

**Files:** Modify `studio/schemaTypes/pesticideDisclosure.ts`

- `defineField` `name: 'lotCultiveraId'` → `name: 'publicCode'`; `title: 'Lot Cultivera ID'`
  → `title: 'Public Code'`; description `...The number printed on the jar; the public lookup
  key.` → `...The lot code printed on the jar; the public lookup key.`
- `preview.select.title: 'lotCultiveraId'` → `'publicCode'`.
- Nothing else in this file changes (application fields, validation rule unchanged).

**Guard:** studio typecheck (`make studio` build is env-gated; rely on tsc + review).

---

## Task 2: Shared lib rename + `publicCode` format validation

**Files:** Modify `src/lib/pesticide-disclosure.ts`, `src/lib/sanity.ts`

### `src/lib/pesticide-disclosure.ts`

- Interface `PesticideDisclosure.lotCultiveraId: string` → `publicCode: string`.
- `DISCLOSURE_FIELDS`: `"lotCultiveraId"` → `"publicCode"`.
- `DESTINATION_DOCUMENT_FIELDS`: `"lotCultiveraId"` → `"publicCode"`.
- Add `const PUBLIC_CODE_PATTERN = /^NWL-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{5}$/;` beside the other
  patterns.
- `DISCLOSURE_BUYER_PROJECTION`: `_id, lotCultiveraId, strain, noneApplied,` →
  `_id, publicCode, strain, noneApplied,`.
- `DISCLOSURE_LIST_QUERY`: `order(lotCultiveraId asc)` → `order(publicCode asc)`.
- `DISCLOSURE_BY_CULTIVERA_ID_QUERY` → rename const to `DISCLOSURE_BY_PUBLIC_CODE_QUERY`;
  body `lotCultiveraId == $lotCultiveraId` → **case-insensitive**
  `lower(publicCode) == lower($publicCode)`.
- `assertPesticideDisclosure`: replace
  `assertRequiredString( value[ "lotCultiveraId" ], `${path}.lotCultiveraId` );`
  with:
  ```ts
  const publicCode = value[ "publicCode" ];
  assertRequiredString( publicCode, `${path}.publicCode` );
  if( !PUBLIC_CODE_PATTERN.test( publicCode ) ) {
    throw new Error( `${path}.publicCode must be NWL- followed by 5 Crockford base32 chars.` );
  }
  ```
- `assertUniqueLotCultiveraIds` → rename to `assertUniquePublicCodes`; body uses
  `disclosure.publicCode`; messages `lotCultiveraId ${...}` → `publicCode ${...}`. Update both
  call sites (`normalizeDisclosureFetchResults`, `preparePesticideDisclosureStaticPaths`).
- `fetchPesticideDisclosureByCultiveraIdFromDestination` → rename to
  `fetchPesticideDisclosureByPublicCodeFromDestination`; param `lotCultiveraId: string` →
  `publicCode: string`; uses `DISCLOSURE_BY_PUBLIC_CODE_QUERY` and passes `{ publicCode }`.
- `PesticideDisclosureStaticPath.params: { cultiveraId: string }` → `{ code: string }`
  (must match the new `[...code].astro` filename).
- `preparePesticideDisclosureStaticPaths`: `assertUniquePublicCodes(...)`; map
  `params: { cultiveraId: disclosure.lotCultiveraId }` → `params: { code: disclosure.publicCode }`.
- `resolvePesticideDisclosureRouteDocument( lotCultiveraId, disclosure )` → param
  `publicCode`; compare `disclosure.publicCode !== publicCode`; message
  `...drifted for lotCultiveraId ${...}` → `...drifted for publicCode ${...}`.

### `src/lib/sanity.ts`

- Import `fetchPesticideDisclosureByCultiveraIdFromDestination` →
  `fetchPesticideDisclosureByPublicCodeFromDestination`.
- Getter `getPesticideDisclosureByCultiveraId( lotCultiveraId: string )` →
  `getPesticideDisclosureByPublicCode( publicCode: string )`; body calls the renamed fetch
  with `publicCode`.
- Leave the strain/drop `cultiveraMarketProductId` and "Order on Cultivera" lines untouched.

**Guard:** `make check-pesticide-disclosure-contract`, `make test-pesticide-disclosure`
(after Task 6 updates the tests), `tsc`.

---

## Task 3: Route file rename

**Files:** Rename `src/pages/pesticides/[...cultiveraId].astro` →
`src/pages/pesticides/[...code].astro` (via `git mv`); Modify the renamed file.

- Imports: `getPesticideDisclosureByCultiveraId` → `getPesticideDisclosureByPublicCode`.
- `const { cultiveraId } = Astro.params;` → `const { code } = Astro.params;`
- Guard: `if( !cultiveraId ) throw new Error( "Pesticide disclosure route requires a Cultivera
  id." );` → `if( !code ) throw new Error( "Pesticide disclosure route requires a lot code." );`
- Normalize case: `const normalizedCode = code.toUpperCase();`
- `getPesticideDisclosureByPublicCode( normalizedCode )`;
  `resolvePesticideDisclosureRouteDocument( normalizedCode, directlyFetched )`.
- `pageTitle`: `lot ${disclosure.lotCultiveraId}` → `lot ${disclosure.publicCode}`.
- `description`: `lot ${disclosure.lotCultiveraId}` → `lot ${disclosure.publicCode}`.

**Guard:** `tsc` / `astro check` (env-gated build in CI).

---

## Task 4: Index page copy + keys

**Files:** Modify `src/pages/pesticides/index.astro`

- `PAGE_SUBTITLE`: `...by its Cultivera inventory number.` → `...by its lot code.`
- `EMPTY_STATE_MESSAGE`: `Try another Cultivera number, strain, or grade.` →
  `Try another lot code, strain, or grade.`
- Sort: `first.lotCultiveraId.localeCompare( second.lotCultiveraId )` →
  `first.publicCode.localeCompare( second.publicCode )`.
- `<label>`: `Search by lot number, strain, or grade` → `Search by lot code, strain, or grade`.
- `<input placeholder>`: `Try 2043117 or Blue Dream` → `Try NWL-4A7KP or Blue Dream`.
- Column header `<span>Lot (Cultivera no.)</span>` → `<span>Lot code</span>`.
- `data-disclosure-row-id={disclosure.lotCultiveraId}` → `{disclosure.publicCode}`.
- Link `href={`/pesticides/${disclosure.lotCultiveraId}/`}` → `${disclosure.publicCode}`;
  inner `{disclosure.lotCultiveraId}` → `{disclosure.publicCode}`.
- `data-disclosure-row` / `-strain` / `-grade` attributes unchanged.

**Guard:** `tsc`; visual review of markup.

---

## Task 5: Display component + browser search

**Files:** Modify `src/components/PesticideDisclosureBody.astro`, `src/lib/pesticide-browser.ts`

### `PesticideDisclosureBody.astro`

- `FOOTER_NOTE`: `...identified by its Cultivera inventory number.` →
  `...identified by its lot code.`
- `data-disclosure-lot-cultivera-id={disclosure.lotCultiveraId}` →
  `data-disclosure-lot-code={disclosure.publicCode}`.
- `<dt>Lot (Cultivera no.)</dt>` → `<dt>Lot code</dt>`.
- `<dd>{disclosure.lotCultiveraId}</dd>` → `<dd>{disclosure.publicCode}</dd>`.

### `pesticide-browser.ts`

- `DisclosureSearchRecord` comes from `pesticide-search.ts` (Task 6); here rename the local
  var `const lotCultiveraId = element.dataset.disclosureRowId;` → `const publicCode = ...`
  (the DOM attribute `data-disclosure-row-id` → `dataset.disclosureRowId` is unchanged).
- Guard `if( !lotCultiveraId || !strain )` → `if( !publicCode || !strain )`.
- `record: { lotCultiveraId, strain, ... }` → `record: { publicCode, strain, ... }`.
- `row.record.lotCultiveraId` in `render()` → `row.record.publicCode`.

**Guard:** `tsc`.

---

## Task 6: Search lib + all tests + fixtures

**Files:** Modify `src/lib/pesticide-search.ts`, `src/lib/pesticide-search.test.ts`,
`src/lib/pesticide-disclosure.test.ts`, `scripts/fixtures/pesticide-disclosure.ts`.

### `src/lib/pesticide-search.ts`

- `DisclosureSearchRecord.lotCultiveraId` → `publicCode`.
- `disclosureSearchText`: `[ record.lotCultiveraId, record.strain, ... ]` →
  `[ record.publicCode, record.strain, ... ]`.
- `filterPesticideDisclosures`: `.map( record => record.lotCultiveraId )` →
  `.map( record => record.publicCode )`.

### `scripts/fixtures/pesticide-disclosure.ts`

- `DISCLOSURE_LOT_CULTIVERA_ID = "2043117"` → `DISCLOSURE_PUBLIC_CODE = "NWL-4A7KP"`.
- `DISCLOSURE_NONE_APPLIED_LOT_CULTIVERA_ID = "2043118"` →
  `DISCLOSURE_NONE_APPLIED_PUBLIC_CODE = "NWL-9G2TX"`.
- `makePesticideDisclosureFixture`: `lotCultiveraId: DISCLOSURE_LOT_CULTIVERA_ID` →
  `publicCode: DISCLOSURE_PUBLIC_CODE`.
- `makeNoneAppliedDisclosureFixture`: `lotCultiveraId: DISCLOSURE_NONE_APPLIED_LOT_CULTIVERA_ID`
  → `publicCode: DISCLOSURE_NONE_APPLIED_PUBLIC_CODE`.

### `src/lib/pesticide-search.test.ts`

- `RECORDS`: `lotCultiveraId` → `publicCode`; values `"2043117"`/`"2051002"` →
  `"NWL-4A7KP"`/`"NWL-9G2TX"`.
- Test `"matches on the Cultivera number"` → `"matches on the lot code"`, query/expected →
  `"NWL-4A7KP"`.
- Case-insensitive strain test, empty-query, unrelated-query updated to the new codes.

### `src/lib/pesticide-disclosure.test.ts`

- Import `DISCLOSURE_LOT_CULTIVERA_ID` → `DISCLOSURE_PUBLIC_CODE`.
- `makeDestinationDocument`: `lotCultiveraId: DISCLOSURE_LOT_CULTIVERA_ID` →
  `publicCode: DISCLOSURE_PUBLIC_CODE`.
- Query-shape test: `.not.toContain( "$lotCultiveraId" )` → `.not.toContain( "$publicCode" )`.
- Duplicate test: `/duplicate pesticide disclosure list result/` message unchanged (it names
  the description, not the field) — keep, but the internal dedupe now keys on `publicCode`.
- Static-paths test: `params: { cultiveraId: DISCLOSURE_LOT_CULTIVERA_ID }` →
  `params: { code: DISCLOSURE_PUBLIC_CODE }`.
- Route-identity test: `resolvePesticideDisclosureRouteDocument( "9999999", disclosure )` →
  `( "NWL-00000", disclosure )` (a valid-shaped but different code) still throws
  `/build data drifted/`; `resolvePesticideDisclosureRouteDocument( DISCLOSURE_PUBLIC_CODE,
  disclosure )` returns `disclosure`.
- **Add** a `publicCode` format test:
  `expect( () => assertPesticideDisclosure({ ...makePesticideDisclosureFixture(), publicCode:
  "2043117" }) ).toThrow( /publicCode must be NWL-/ );`
- **Add** a case-insensitive by-code query assertion (the query lowercases both sides):
  `expect( DISCLOSURE_BY_PUBLIC_CODE_QUERY ).toContain( "lower(publicCode) == lower($publicCode)" );`
  (export the query const for the assertion, or assert via a fetch spy that lowercases).

**Guard:** `make test-pesticide-disclosure`, `make check-pesticide-disclosure-contract`.

---

## Task 7: Python build checker + HTML fixtures + "no Cultivera text" guard

**Files:** Modify `scripts/check-pesticide-disclosure-build.py`,
`scripts/fixtures/pesticide-disclosure-page-hidden-application.html`,
`scripts/fixtures/pesticide-disclosure-page-none-applied-has-applications.html`.

### `scripts/check-pesticide-disclosure-build.py`

- Docstring: `<lot Cultivera id>` → `<lot code>`; "one with pesticide applications" prose
  unchanged.
- `LOT_CULTIVERA_ID_ATTRIBUTE = "data-disclosure-lot-cultivera-id"` →
  `LOT_CODE_ATTRIBUTE = "data-disclosure-lot-code"` (update every reference).
- `EXPECTED_FIXTURE_LOT_CULTIVERA_ID = "2043117"` → `EXPECTED_FIXTURE_LOT_CODE = "NWL-4A7KP"`.
- All failure strings/params: `lot Cultivera id` → `lot code`; `expected_lot_cultivera_id`
  param → `expected_lot_code`.
- **Add a "no Cultivera text" page guard** in `check_page`: after the landmark checks,
  `if "Cultivera" in parser_full_text: failures.append("pesticide disclosure page contains
  the vendor name 'Cultivera'")`. Implementation note: the `html_elements` parser exposes
  element `.text`; capture the whole document's visible text (the landmark article's `.text`
  covers the disclosure body) and assert `"Cultivera"` (case-insensitive) is absent. Keep the
  guard scoped to the rendered disclosure text so it does not false-trip on unrelated chrome.

### HTML fixtures

- Both: `data-disclosure-lot-cultivera-id="2043117"` → `data-disclosure-lot-code="NWL-4A7KP"`
  (hidden-application fixture — must equal `EXPECTED_FIXTURE_LOT_CODE`).
- none-applied-has-applications fixture: `...="2043118"` → `data-disclosure-lot-code="NWL-9G2TX"`.
- No "Cultivera" text exists in either fixture body already — confirm the new guard passes.

**Guard:** `make test-check-pesticide-disclosure-build`, and the component test in
`make test-pesticide-disclosure` (renders the real component through `--fixture` mode).

---

## Task 8: CLAUDE.md vendor-neutrality principle

**Files:** Modify `CLAUDE.md` (nw-local.com)

- Add a short **Vendor neutrality** note (mirroring the ops CLAUDE.md addition from #367):
  compliance/public-identity surfaces key on the vendor-neutral `publicCode`, never a POS
  vendor's id; the disclosure lookup is the reference implementation; the *marketplace*
  Cultivera surfaces (buy links, `cultiveraMarketProductId`) are a separate, legitimate
  concern and are not affected.

**Guard:** prose review; `make check-content-style` if it ranges over CLAUDE.md.

---

## Final verification

1. `make check-pesticide-disclosure-contract` — node runtime contract green.
2. `make test-pesticide-disclosure` — vitest (lib, search, component) green.
3. `make test-check-pesticide-disclosure-build` — Python fixture regressions green.
4. `make lint` — eslint clean.
5. `tsc --noEmit` (or `astro check` where env permits) — no type errors.
6. Grep the disclosure surface for residual `cultivera` (case-insensitive) — only the
   marketplace files (`CultiveraImageLink`, `cultivera.ts`, `cultiveraMarketProductId`,
   `DropPortal`, drop/strain/retailer pages) may match; **no pesticide-disclosure file may**.
7. The build-gated `check-pesticide-disclosure-build` and full `astro build` run in CI.

## Invariants this holds (each with a guard)

1. **No vendor identifier in the public disclosure surface** — the destination audit rejects
   any unknown stored field (so a re-introduced `lotCultiveraId` is refused), and the Python
   checker asserts no "Cultivera" text renders.
2. **`publicCode` is well-formed** — `assertPesticideDisclosure` rejects any non-`NWL-XXXXX`
   code, so a malformed or vendor-shaped id cannot reach a page.
3. **The by-code lookup is case-insensitive** — a scanned uppercase code and a typed lowercase
   code resolve to the same lot.
