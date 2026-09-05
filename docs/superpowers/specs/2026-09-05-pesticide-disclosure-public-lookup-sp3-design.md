# SP3 — Public Pesticide-Disclosure Lookup (design)

**Repo:** `nw-local.com` (this repo — the Astro 6 + Sanity website). SP3 is the
public, consumer-facing half of the pesticide-disclosure feature.

**Predecessors (other repo):** SP1 and SP2 live in `nw-local-ops`. SP2
(`nw-local-ops` PR #357) is the one-way, operator-driven push that publishes
each lot's pesticide disclosure to Sanity as a `pesticideDisclosure` document.
**SP2 owns the document shape; SP3 defines the matching Sanity schema and a
GROQ query keyed on `lotCultiveraId`, and conforms to it.** This spec restates
that frozen shape as the contract and never re-invents it.

## Goal

A buyer who reads the Cultivera inventory number off a jar can find that lot's
pesticide disclosure on nw-local.com — either by typing the number into a
browsable `/pesticides` directory or by following a deep link to
`/pesticides/<cultiveraId>`. Fulfils the public-disclosure obligation behind
WAC 314-55-105(9).

## The frozen document contract (owned by SP2)

Published by `nw-local-ops` at the deterministic id `disclosure.<lot-uuid>`
via idempotent `createOrReplace`; retracted via idempotent `delete`. The body:

```json
{
  "_id": "disclosure.<lot-uuid>",
  "_type": "pesticideDisclosure",
  "lotCultiveraId": "<string — the number on the jar; the public lookup key>",
  "strain": "<string — the cultivar name>",
  "grade": "<string — omitted entirely when blank>",
  "noneApplied": false,
  "applications": [
    {
      "productName": "<string>",
      "activeIngredient": "<string>",
      "epaRegistrationNumber": "<string>",
      "appliedOn": "YYYY-MM-DD",
      "targetPest": "<string>"
    }
  ]
}
```

Contract facts SP3 depends on, all guaranteed by SP2:

- **`lotCultiveraId` is the query/route key**, not the document `_id`. A buyer
  holds the Cultivera number, not the internal lot UUID.
- **`appliedOn` is always `"YYYY-MM-DD"`** (SP2 sends `applied_on.isoformat()`
  from a Django `DateField`). SP3 stores it as a Sanity `date`, which is exactly
  that format. If SP2 ever sent a full datetime, the `date` field would reject
  it — this is a deliberate, documented pin across both repos.
- **`noneApplied` is true iff `applications` is empty.** SP2 sends one or the
  other, never both, never neither.
- **`strain` and `grade` are plain strings**, not references (SP2 sends
  `str(lot.harvest.strain.name)` and the grade display string). `grade` is
  omitted when blank — SP3 must treat absent grade as "no grade shown", never a
  blank separator.
- **The `applications` list is pre-sorted** by SP2 (ascending `appliedOn`, then
  `productName`). SP3 renders in received order; it does not re-sort.

The consumer subset is deliberate: applicator name/license (farm-staff PII),
application rate, and internal notes are **never** in the document. SP3 renders
only what it receives and can add no field SP2 did not send.

## Scope

**In scope:** the `pesticideDisclosure` Sanity schema, its Studio registration,
the typed query layer, a browsable `/pesticides` index with client-side search,
per-lot deep-link detail pages, the shared rendering component, and the paired
CI checks.

**Out of scope (clean future follow-ups):**

- **Drop-page cross-linking** — a drop page showing "what was sprayed" for its
  lots. The disclosure is keyed on a lot's Cultivera number while a drop
  references products/COAs, so the join is not clean; SP3 stays a standalone
  compliance lookup. Deferred deliberately.
- **A tailored per-id "not published yet" page for unknown deep links** — see
  Not-found handling; a static site cannot SSR one, and the index search already
  covers the buyer-facing miss.

## Approach

Mirror the existing **COA** feature end-to-end — it is already a machine-owned,
read-only, OPS-published Sanity document (`studio/schemaTypes/coa.ts`), rendered
by a component (`src/components/CoaBody.astro`) at a static detail page
(`src/pages/coas/[...sourceId].astro`), with paired CI checks. A
`pesticideDisclosure` is the same species of object, keyed on `lotCultiveraId`
instead of `sourceId`. SP3 adds the one thing COA lacks: a browsable index.

## Components

### 1. Sanity schema — `studio/schemaTypes/pesticideDisclosure.ts`

Machine-owned and read-only, modeled on `coa.ts`: every field carries
`readOnly: true` and a "Set by Northwest Local OPS. Do not edit in Studio."
description, so no one hand-edits what SP2 owns.

- `name: 'pesticideDisclosure'`, `title: 'Pesticide Disclosure'`, `type: 'document'`.
- Fields: `lotCultiveraId` (string, required), `strain` (string, required),
  `grade` (string, optional), `noneApplied` (boolean, required), `applications`
  (array of an inline `pesticideApplication` object: `productName`,
  `activeIngredient`, `epaRegistrationNumber`, `appliedOn` as **`type: 'date'`**,
  `targetPest`).
- `lotCultiveraId` gets `.required()` but **no format regex** — a regex could
  silently reject a validly-published doc, a content gap the site cannot see;
  "SP2 owns the value" is the governing principle.
- A document-level custom validation encodes the contract as a Studio guard:
  `noneApplied` is true iff `applications` is empty.
- `preview` shows `lotCultiveraId` as the title, `strain · grade` as subtitle.

**Registration (both steps required):** import + add `pesticideDisclosureType`
to the `schemaTypes` array in `studio/schemaTypes/index.ts` (alphabetically,
between `page` and `product`); add
`{ kind: 'list', type: 'pesticideDisclosure', title: 'Pesticide Disclosures' }`
to `STRUCTURE[]` in `studio/structure.ts` so it appears in the Studio sidebar.

Studio code style (Prettier): no semicolons, single quotes, spaced braces, tight
arrow parens.

### 2. Query layer — `src/lib/pesticide-disclosure.ts` (re-exported via `src/lib/sanity.ts`)

The COA split-file convention. Exposes:

- `interface PesticideApplication` and `interface PesticideDisclosure` matching
  the frozen shape (`grade?` optional; `applications: PesticideApplication[]`).
- A module-level `PESTICIDE_DISCLOSURE_PROJECTION` fragment that selects the six
  fields and `coalesce( applications[]{...}, [] )` so a `noneApplied` doc still
  returns `applications: []`, never `null`.
- `getPesticideDisclosures(): Promise<PesticideDisclosure[]>` —
  `*[_type == "pesticideDisclosure"] | order( lotCultiveraId asc )` + projection.
  Feeds the index and `getStaticPaths()`.
- `getPesticideDisclosureByCultiveraId(id): Promise<PesticideDisclosure | null>`
  — `*[_type == "pesticideDisclosure" && lotCultiveraId == $id][0]` + projection.
  The exact realization of SP2's "GROQ query keyed on `lotCultiveraId`."

Both getters and both interfaces are re-exported from `src/lib/sanity.ts` so
components import from the central module (repo convention).

House JS style (root ESLint): double quotes, semicolons, spaced parens.

### 3. Rendering component — `src/components/PesticideDisclosureBody.astro`

Props: `disclosure: PesticideDisclosure`. Modeled on `CoaBody.astro`.

- **Header:** `strain` and, when present, `grade` (omitted cleanly when absent —
  no stray separator); "Lot `{lotCultiveraId}`".
- **When `noneApplied`:** a prominent affirmative callout —
  *"No pesticides were applied to this lot."* — **not** an empty table. This is
  the WAC-meaningful positive assertion and must read as deliberate.
- **Otherwise:** a table, one row per application, columns Product | Active
  ingredient | EPA reg. # | Date applied | Target pest, in received order.
- **Footer note:** brief, plain-English WAC 314-55-105(9) framing. US spelling
  (`check-content-style`).

### 4. Index page — `src/pages/pesticides/index.astro`

A **browsable directory** (consistent with `/strains` and `/glossary`):

- `getPesticideDisclosures()` at build; server-renders a table (Cultivera # |
  Strain | Grade | link →), each row carrying `data-disclosure-id` /
  `data-disclosure-strain` for client filtering.
- A `<input type="search">` on top with a live `aria-live` result count, and
  short intro copy ("Find the pesticide disclosure for any lot — type the
  Cultivera number from your jar").
- Progressive enhancement via `src/lib/pesticide-search.ts` (a pure,
  unit-tested match helper) plus a small browser module (the
  `glossary-search.ts` / `glossary-browser.ts` split). Search matches on
  Cultivera number and strain, case-insensitive.
- **Empty search state:** *"No published disclosure matches '<query>'. That lot
  may not be published yet"* + a contact link.
- `<Layout title="Pesticide Disclosures" description=…>`.

### 5. Detail page — `src/pages/pesticides/[...cultiveraId].astro`

- `getStaticPaths()` maps each `getPesticideDisclosures()` row to
  `{ params: { cultiveraId: d.lotCultiveraId } }`.
- Body reads the param, `getPesticideDisclosureByCultiveraId(id)`, renders
  `<PesticideDisclosureBody>`, wrapped in
  `<Layout title={\`Lot ${id} — Pesticide Disclosure\`}>`.

**Not-found handling.** `getStaticPaths()` emits a page only for a disclosure
that exists, so a deep link to an unknown/unpublished Cultivera number hits the
site's standard `404.astro` — a static site cannot SSR a tailored per-id
message. The tailored *"not published yet"* message lives on the index search,
which is the primary buyer path and which SP3 fully controls. Split: **unknown
deep link → site 404; index search miss → friendly empty state.**

## Invariants this feature introduces

- **`lotCultiveraId` is unique across all published disclosures.** The detail
  route's `getStaticPaths()` derives its paths from it; a duplicate would emit
  duplicate static paths and break the build. The contract check asserts this
  and fails with a clear message ("duplicate lotCultiveraId X across N
  disclosures") rather than a generic Astro dup-path error. The `[0]` in the
  by-id query is the belt to that suspenders.
- **`appliedOn` is `"YYYY-MM-DD"` on the wire and a Sanity `date` in the
  schema.** A cross-repo pin: SP2 must keep sending a date-only string.
- **Content-validating checks must gate `deploy.yml`, not only PR CI.** Deploy
  is content-triggered (a Sanity publish fires a webhook that runs `deploy.yml`
  directly, no PR), so a uniqueness/shape regression in *content* would ship
  unless the check is a blocking step on the deploy path itself.

## CI / checks

Mirror COA's `check-coa-*` / `test-coa` / `check-coa-build` set:

- **`check-pesticide-contract`** (validates fetched published content) —
  asserts (1) `lotCultiveraId` uniqueness across all published disclosures and
  (2) every doc satisfies the shape contract (required fields present;
  `noneApplied` iff `applications` empty). Wired into **both** `make check`
  **and** `deploy.yml` as a blocking step, because it validates content that
  publishes outside the PR flow.
- **`check-pesticide-build`** (validates `dist/` after `astro build`) — asserts
  the `/pesticides` index and one `/pesticides/<id>` page per published
  disclosure were emitted. Runs wherever the build runs.
- **`test-pesticide` / `test-check-pesticide-build`** — paired tests that prove
  each check exits non-zero on a bad fixture (duplicate id, shape violation,
  missing page).
- Folded into the `make check` aggregate, plus
  `cd studio && yarn lint && yarn typecheck && yarn format:check` for the schema.

## Testing

Guard-first; each guard tied to the wrong version it catches.

- **`src/lib/pesticide-search.test.ts`** — matches on Cultivera number; matches
  on strain (case-insensitive); does not match an unrelated string. Catches a
  helper that matches everything or ignores strain.
- **`src/components/PesticideDisclosureBody.test.ts`** — (a) applications
  present → one table row per application with all five columns (catches a
  dropped column); (b) `noneApplied: true` → the affirmative callout and **no**
  table (catches the empty-table-on-none-applied mutation, which renders as
  blank-looks-fine); (c) `grade` absent → header omits the separator entirely
  (catches the `value or ""` trap).
- **Contract-check test** — a fixture with two docs sharing a `lotCultiveraId`
  → non-zero; a `noneApplied: true` doc that also carries applications →
  non-zero; a clean set → zero.
- **Build-check test** — a `dist/` missing a per-lot page → non-zero.
- **Studio** — the schema participates in `cd studio && yarn typecheck`.

## Data flow (end to end)

1. `nw-local-ops` operator publishes a harvest's disclosures (SP2): a
   `pesticideDisclosure` doc per eligible lot, `createOrReplace` at
   `disclosure.<lot-uuid>`.
2. The Sanity publish fires the content webhook → `deploy.yml` rebuilds the site.
3. `check-pesticide-contract` gates the deploy; `getStaticPaths()` regenerates
   the index rows and one detail page per `lotCultiveraId`.
4. A buyer reads the Cultivera number off the jar → types it into `/pesticides`
   (or follows a deep link to `/pesticides/<number>`) → sees the frozen
   disclosure (or the affirmative "none applied" callout).
