# Public Pesticide-Disclosure Lookup (SP3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the buyer-facing half of the pesticide-disclosure feature on nw-local.com — a `pesticideDisclosure` Sanity schema, a typed GROQ query keyed on `lotCultiveraId`, per-lot deep-link detail pages, and a browsable/searchable `/pesticides` index — conforming exactly to the document SP2 (`nw-local-ops`) already publishes.

**Architecture:** Mirror the existing COA feature end-to-end (machine-owned read-only Sanity schema → pure dependency-injected contract lib → typed getters in `sanity.ts` → static `getStaticPaths()` detail pages → Python `dist/` build checker gating deploy), keyed on `lotCultiveraId` instead of `sourceId`, and add the one thing COA lacks: a browsable index using the glossary search pattern.

**Tech Stack:** Astro 6 (static output, GitHub Pages), Sanity (`@sanity/client` 7, Studio 5), TypeScript (node built-in type stripping for scripts), vitest 4, Python 3 dist checkers, global CSS with dark-only tokens.

**Spec:** `docs/superpowers/specs/2026-09-05-pesticide-disclosure-public-lookup-sp3-design.md`

**Pattern reference (verbatim COA/glossary excerpts to mirror):** the implementer should read the existing files named in each task directly. A verbatim extraction also exists at the scratchpad path noted in the dispatch, but the repo files are the source of truth.

## Global Constraints

- **The frozen document contract is owned by SP2; never invent a field.** Fields: `lotCultiveraId` (string, the lookup key), `strain` (string), `grade` (string, optional — omitted when blank), `noneApplied` (boolean), `applications[]` of `{ productName, activeIngredient, epaRegistrationNumber, appliedOn ("YYYY-MM-DD"), targetPest }`. Document `_id` is `disclosure.<lot-uuid>` where `<lot-uuid>` is the internal lot UUID, **not** `lotCultiveraId` — so `_id` is validated by prefix+UUID pattern only, never cross-checked against `lotCultiveraId` (this is the one place the COA template's `_id === coa.<sourceId>` check does NOT transfer).
- **`noneApplied` is true iff `applications` is empty.** SP2 sends one or the other, never both, never neither.
- **`appliedOn` is always `"YYYY-MM-DD"`** (SP2 sends `applied_on.isoformat()` from a Django `DateField`). Validate as calendar-valid date-only; the Studio field is `type: 'date'`.
- **The `applications` list is pre-sorted by SP2** (ascending `appliedOn`, then `productName`). Render in received order.
- **Consumer subset only** — never render or add applicator name/license, application rate, or internal notes; they are not in the document.
- **Two code styles, matched per file:** root site code (`src/`, `scripts/`) uses **semicolons, double quotes, spaced parens** (`assertX( value )`) and `.ts` import extensions. Studio code (`studio/`) uses **no semicolons, single quotes, printWidth 100** (Prettier). Match the file you are in.
- **`structure.ts` refinement:** do **NOT** add `pesticideDisclosure` to `studio/structure.ts`. Machine-owned types (like `coa`) are deliberately left unlisted and auto-append under their raw type name; adding a curated sidebar entry breaks that convention. (This intentionally diverges from the spec's Section 2, which predates reading the COA precedent.)
- **Content checks gate deploy.** A Sanity publish (no PR) can create or change a disclosure document, so the `dist/` build checker must be a blocking step in `deploy.yml`'s build job, not only in `ci.yml`/`audit.yml`.
- **No `<table>` for the applications list** — the codebase has no generic table classes; render tabular data as `<dl>` register grids keyed by `data-*` attributes (the `.coa-panel-register` idiom).
- **US spelling in all user-visible copy** (enforced by `check-content-style.py`).

## File Structure

New files (all under the worktree root):

- `studio/schemaTypes/pesticideDisclosure.ts` — the machine-owned read-only schema. Responsibility: the Studio document shape + contract guard.
- `src/lib/pesticide-disclosure.ts` — pure contract module (no `@sanity/client`): interfaces, field allowlists, GROQ projection + queries, injected-fetcher functions, assertions, destination audit, static-path prep, uniqueness. Responsibility: validate and shape disclosure data at the fetch boundary.
- `src/lib/pesticide-search.ts` — pure search-match helper for the index. Responsibility: filter disclosure rows by a query string over number + strain.
- `src/lib/pesticide-browser.ts` — progressive-enhancement client module wiring the index search input to the rows. Responsibility: client-side filtering + live count + empty state.
- `scripts/fixtures/pesticide-disclosure.ts` — fixture factory (`makePesticideDisclosureFixture`, `makeNoneAppliedDisclosureFixture`, exported constant ids). Responsibility: one canonical fixture shared by every test/checker.
- `scripts/check-pesticide-disclosure-contract.ts` — node/TS static contract check (valid + invalid inputs against the pure lib).
- `scripts/check-pesticide-disclosure-build.py` — Python `dist/` checker for the detail pages (and `--fixture` mode for the component test).
- `scripts/test-check-pesticide-disclosure-build.py` — regression test proving the Python checker rejects malformed fixtures.
- `scripts/fixtures/pesticide-disclosure-page-*.html` — committed malformed fixtures for the regression test.
- `src/lib/pesticide-disclosure.test.ts` — vitest: destination audit, none-applied XOR, uniqueness, static paths, route identity.
- `src/lib/pesticide-search.test.ts` — vitest: the pure search helper.
- `src/components/PesticideDisclosureBody.astro` — renders one disclosure (header + none-applied callout OR application register blocks + WAC footer). Owns the `data-disclosure-lot-cultivera-id` landmark.
- `src/components/PesticideDisclosureBody.test.ts` — vitest: renders the real component → runs the Python checker in `--fixture` mode (applications and none-applied cases).
- `src/pages/pesticides/[...cultiveraId].astro` — per-lot detail page.
- `src/pages/pesticides/index.astro` — browsable directory + search.

Modified files:

- `studio/schemaTypes/index.ts` — register the new type (import + array entry, between `page` and `product`).
- `src/lib/sanity.ts` — re-export the pure module's types/functions, add the injected fetcher + `getPesticideDisclosures()` / `getPesticideDisclosureByCultiveraId()`.
- `Makefile` — four new targets + `.PHONY` + wire into the `check` aggregate.
- `.github/workflows/deploy.yml` — add the build checker as a blocking step.
- `.github/workflows/ci.yml` — add contract + vitest targets to `typecheck`, the node contract script to `drop-lookup`.
- `.github/workflows/audit.yml` — add the build checker + regression test to `validate-content-style`.
- `docs/content-model.md` — one paragraph documenting the new type.

---

### Task 1: Sanity schema + registration

**Files:**
- Create: `studio/schemaTypes/pesticideDisclosure.ts`
- Modify: `studio/schemaTypes/index.ts`
- Do NOT modify: `studio/structure.ts` (see Global Constraints)

**Interfaces:**
- Produces: a `pesticideDisclosure` document type with fields `lotCultiveraId` (string), `strain` (string), `grade` (string, optional), `noneApplied` (boolean), `applications` (array of inline `pesticideApplication` objects: `productName`, `activeIngredient`, `epaRegistrationNumber`, `appliedOn` [date], `targetPest`). All fields `readOnly`. Exported as `pesticideDisclosureType`.

**Template to read:** `studio/schemaTypes/coa.ts` (machine-owned/read-only style), `studio/schemaTypes/index.ts`.

- [ ] **Step 1: Write the schema (studio style — no semicolons, single quotes)**

Create `studio/schemaTypes/pesticideDisclosure.ts`:

```ts
import { defineField, defineType } from 'sanity'

const MACHINE_OWNED_DESCRIPTION = 'Set by Northwest Local OPS. Do not edit in Studio.'

const applicationFields = [
  defineField({
    name: 'productName',
    title: 'Product Name',
    type: 'string',
    description: MACHINE_OWNED_DESCRIPTION,
    readOnly: true,
    validation: (rule) => rule.required(),
  }),
  defineField({
    name: 'activeIngredient',
    title: 'Active Ingredient',
    type: 'string',
    description: MACHINE_OWNED_DESCRIPTION,
    readOnly: true,
    validation: (rule) => rule.required(),
  }),
  defineField({
    name: 'epaRegistrationNumber',
    title: 'EPA Registration Number',
    type: 'string',
    description: MACHINE_OWNED_DESCRIPTION,
    readOnly: true,
    validation: (rule) => rule.required(),
  }),
  defineField({
    name: 'appliedOn',
    title: 'Date Applied',
    type: 'date',
    description: MACHINE_OWNED_DESCRIPTION,
    readOnly: true,
    validation: (rule) => rule.required(),
  }),
  defineField({
    name: 'targetPest',
    title: 'Target Pest',
    type: 'string',
    description: MACHINE_OWNED_DESCRIPTION,
    readOnly: true,
    validation: (rule) => rule.required(),
  }),
]

export const pesticideDisclosureType = defineType({
  name: 'pesticideDisclosure',
  title: 'Pesticide Disclosure',
  type: 'document',
  fields: [
    defineField({
      name: 'lotCultiveraId',
      title: 'Lot Cultivera ID',
      type: 'string',
      description: `${MACHINE_OWNED_DESCRIPTION} The number printed on the jar; the public lookup key.`,
      readOnly: true,
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'strain',
      title: 'Strain',
      type: 'string',
      description: MACHINE_OWNED_DESCRIPTION,
      readOnly: true,
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'grade',
      title: 'Grade',
      type: 'string',
      description: `${MACHINE_OWNED_DESCRIPTION} Omitted when blank.`,
      readOnly: true,
    }),
    defineField({
      name: 'noneApplied',
      title: 'No Pesticides Applied',
      type: 'boolean',
      description: MACHINE_OWNED_DESCRIPTION,
      readOnly: true,
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'applications',
      title: 'Applications',
      type: 'array',
      description: MACHINE_OWNED_DESCRIPTION,
      readOnly: true,
      of: [{ type: 'object', name: 'pesticideApplication', fields: applicationFields }],
    }),
  ],
  validation: (rule) =>
    rule.custom((document) => {
      const applications = (document?.applications as unknown[] | undefined) ?? []
      const noneApplied = document?.noneApplied === true
      if (noneApplied === (applications.length === 0)) return true
      return 'noneApplied must be true if and only if there are zero applications.'
    }),
  preview: {
    select: { title: 'lotCultiveraId', strain: 'strain', grade: 'grade' },
    prepare: ({ title, strain, grade }) => ({
      title: title as string,
      subtitle: [strain, grade].filter(Boolean).join(' · '),
    }),
  },
})
```

- [ ] **Step 2: Register the type in `studio/schemaTypes/index.ts`**

Add the import between the `pageType` and `productType` import lines:
```ts
import { pesticideDisclosureType } from './pesticideDisclosure'
```
Add the array entry between `pageType,` and `productType,`:
```ts
  pageType,
  pesticideDisclosureType,
  productType,
```

- [ ] **Step 3: Run the Studio checks (they must pass)**

Run: `cd studio && yarn typecheck && yarn lint && yarn format:check`
Expected: all pass. If `format:check` fails, run `yarn format` and re-run.

- [ ] **Step 4: Commit**

```bash
git add studio/schemaTypes/pesticideDisclosure.ts studio/schemaTypes/index.ts
git commit -m "feat(studio): add machine-owned pesticideDisclosure schema"
```

---

### Task 2: Pure contract lib + fixture + tests

**Files:**
- Create: `src/lib/pesticide-disclosure.ts`
- Create: `scripts/fixtures/pesticide-disclosure.ts`
- Create: `src/lib/pesticide-disclosure.test.ts`
- Create: `scripts/check-pesticide-disclosure-contract.ts`

**Interfaces:**
- Consumes: nothing (pure module; no Sanity import).
- Produces (exact names later tasks rely on):
  - Types `PesticideApplication`, `PesticideDisclosure`, `PesticideDisclosureFetcher`, `PesticideDisclosureStaticPath`.
  - `DISCLOSURE_DOCUMENT_ID_PREFIX = "disclosure."`, `DISCLOSURE_BUYER_PROJECTION`, `DISCLOSURE_LIST_QUERY`, `DISCLOSURE_BY_CULTIVERA_ID_QUERY`.
  - `assertPesticideDisclosure( value )`, `normalizePesticideDisclosure( value )`, `normalizeDisclosureFetchResult( value )`, `normalizeDisclosureFetchResults( value )`.
  - `fetchPesticideDisclosuresFromDestination( fetcher )`, `fetchPesticideDisclosureByCultiveraIdFromDestination( fetcher, lotCultiveraId )`.
  - `preparePesticideDisclosureStaticPaths( disclosures )`, `resolvePesticideDisclosureRouteDocument( lotCultiveraId, disclosure )`.
  - Fixture: `makePesticideDisclosureFixture()`, `makeNoneAppliedDisclosureFixture()`, `DISCLOSURE_LOT_CULTIVERA_ID = "2043117"`, `DISCLOSURE_NONE_APPLIED_LOT_CULTIVERA_ID = "2043118"`.

**Template to read:** `src/lib/coa.ts`, `src/lib/coa.test.ts`, `scripts/check-coa-contract.ts`, `scripts/fixtures/coa.ts`.

- [ ] **Step 1: Write the fixture factory**

Create `scripts/fixtures/pesticide-disclosure.ts`:

```ts
import type { PesticideDisclosure } from "../../src/lib/pesticide-disclosure.ts";

export const DISCLOSURE_LOT_UUID = "00000000-0000-4000-8000-000000000001";
export const DISCLOSURE_LOT_CULTIVERA_ID = "2043117";
export const DISCLOSURE_NONE_APPLIED_LOT_UUID = "00000000-0000-4000-8000-000000000002";
export const DISCLOSURE_NONE_APPLIED_LOT_CULTIVERA_ID = "2043118";

export function makePesticideDisclosureFixture(): PesticideDisclosure {
  return {
    _id: `disclosure.${DISCLOSURE_LOT_UUID}`,
    lotCultiveraId: DISCLOSURE_LOT_CULTIVERA_ID,
    strain: "Blue Dream",
    grade: "Top Shelf",
    noneApplied: false,
    applications: [
      {
        productName: "Regalia",
        activeIngredient: "Reynoutria sachalinensis extract",
        epaRegistrationNumber: "84059-3",
        appliedOn: "2026-07-14",
        targetPest: "Powdery mildew",
      },
      {
        productName: "Grandevo",
        activeIngredient: "Chromobacterium subtsugae strain PRAA4-1",
        epaRegistrationNumber: "84059-15",
        appliedOn: "2026-07-28",
        targetPest: "Spider mites",
      },
    ],
  };
}

export function makeNoneAppliedDisclosureFixture(): PesticideDisclosure {
  return {
    _id: `disclosure.${DISCLOSURE_NONE_APPLIED_LOT_UUID}`,
    lotCultiveraId: DISCLOSURE_NONE_APPLIED_LOT_CULTIVERA_ID,
    strain: "Gelato #33",
    grade: "Value",
    noneApplied: true,
    applications: [],
  };
}
```

- [ ] **Step 2: Write the pure contract lib**

Create `src/lib/pesticide-disclosure.ts`:

```ts
export interface PesticideApplication {
  productName: string;
  activeIngredient: string;
  epaRegistrationNumber: string;
  appliedOn: string; // "YYYY-MM-DD"
  targetPest: string;
}

export interface PesticideDisclosure {
  _id: string;
  lotCultiveraId: string;
  strain: string;
  grade?: string;
  noneApplied: boolean;
  applications: PesticideApplication[];
}

export const DISCLOSURE_DOCUMENT_ID_PREFIX = "disclosure.";

const DISCLOSURE_FIELDS = new Set( [
  "_id",
  "lotCultiveraId",
  "strain",
  "grade",
  "noneApplied",
  "applications",
] );
const APPLICATION_FIELDS = new Set( [
  "productName",
  "activeIngredient",
  "epaRegistrationNumber",
  "appliedOn",
  "targetPest",
] );
const SANITY_DOCUMENT_SYSTEM_FIELDS = [ "_id", "_type", "_rev", "_createdAt", "_updatedAt" ];
const SANITY_ARRAY_OBJECT_SYSTEM_FIELDS = [ "_key", "_type" ];
const DESTINATION_DOCUMENT_FIELDS = new Set( [
  ...SANITY_DOCUMENT_SYSTEM_FIELDS,
  "lotCultiveraId",
  "strain",
  "grade",
  "noneApplied",
  "applications",
] );
const DESTINATION_APPLICATION_FIELDS = new Set( [
  ...SANITY_ARRAY_OBJECT_SYSTEM_FIELDS,
  "productName",
  "activeIngredient",
  "epaRegistrationNumber",
  "appliedOn",
  "targetPest",
] );
const NULLABLE_DISCLOSURE_FIELDS = [ "grade" ];
const FETCH_RESULT_FIELDS = new Set( [ "disclosure", "destination" ] );
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// The buyer projection is the whole document minus Sanity system noise. grade is
// conditionally projected so an absent grade is omitted rather than sent as null.
export const DISCLOSURE_BUYER_PROJECTION = `{
  _id, lotCultiveraId, strain, noneApplied,
  defined(grade) => { "grade": grade },
  "applications": coalesce( applications[] {
    productName, activeIngredient, epaRegistrationNumber, appliedOn, targetPest
  }, [] )
}`;

const DISCLOSURE_FETCH_PROJECTION = `{
  "disclosure": ${DISCLOSURE_BUYER_PROJECTION},
  "destination": @
}`;

export const DISCLOSURE_LIST_QUERY =
  `*[_type == "pesticideDisclosure"] | order(lotCultiveraId asc) ${DISCLOSURE_FETCH_PROJECTION}`;
export const DISCLOSURE_BY_CULTIVERA_ID_QUERY =
  `*[_type == "pesticideDisclosure" && lotCultiveraId == $lotCultiveraId][0] ${DISCLOSURE_FETCH_PROJECTION}`;

export type PesticideDisclosureFetcher = (
  query: string,
  parameters?: Record<string, string>,
) => Promise<unknown>;

export function isRecord( value: unknown ): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray( value );
}

function assertRecord( value: unknown, path: string ): asserts value is Record<string, unknown> {
  if( !isRecord( value ) ) throw new Error( `${path} must be an object.` );
}

function assertExactFields(
  value: Record<string, unknown>,
  fields: ReadonlySet<string>,
  path: string,
): void {
  for( const fieldName of Object.keys( value ) ) {
    if( !fields.has( fieldName ) ) throw new Error( `${path} has an unknown field: ${fieldName}.` );
  }
}

function assertRequiredString( value: unknown, path: string ): asserts value is string {
  if( typeof value !== "string" || !value.trim() ) {
    throw new Error( `${path} must be a non-empty string.` );
  }
}

function assertCalendarDate( value: unknown, path: string ): asserts value is string {
  assertRequiredString( value, path );
  const match = DATE_PATTERN.exec( value );
  if( !match ) throw new Error( `${path} must be a YYYY-MM-DD date.` );
  const year = Number( match[1] );
  const month = Number( match[2] );
  const day = Number( match[3] );
  const daysInMonth = month >= 1 && month <= 12
    ? new Date( Date.UTC( year, month, 0 ) ).getUTCDate()
    : 0;
  if( day < 1 || day > daysInMonth ) throw new Error( `${path} must be a valid calendar date.` );
}

function assertApplication( value: unknown, path: string ): asserts value is PesticideApplication {
  assertRecord( value, path );
  assertExactFields( value, APPLICATION_FIELDS, path );
  assertRequiredString( value[ "productName" ], `${path}.productName` );
  assertRequiredString( value[ "activeIngredient" ], `${path}.activeIngredient` );
  assertRequiredString( value[ "epaRegistrationNumber" ], `${path}.epaRegistrationNumber` );
  assertCalendarDate( value[ "appliedOn" ], `${path}.appliedOn` );
  assertRequiredString( value[ "targetPest" ], `${path}.targetPest` );
}

export function assertPesticideDisclosure( value: unknown ): asserts value is PesticideDisclosure {
  const path = "Pesticide disclosure";
  assertRecord( value, path );
  assertExactFields( value, DISCLOSURE_FIELDS, path );

  const documentId = value[ "_id" ];
  assertRequiredString( documentId, `${path}._id` );
  if( !documentId.startsWith( DISCLOSURE_DOCUMENT_ID_PREFIX ) ) {
    throw new Error( `${path}._id must start with ${DISCLOSURE_DOCUMENT_ID_PREFIX}.` );
  }
  const lotUuid = documentId.slice( DISCLOSURE_DOCUMENT_ID_PREFIX.length );
  if( !UUID_PATTERN.test( lotUuid ) ) {
    throw new Error( `${path}._id must be ${DISCLOSURE_DOCUMENT_ID_PREFIX}<lot uuid>.` );
  }

  assertRequiredString( value[ "lotCultiveraId" ], `${path}.lotCultiveraId` );
  assertRequiredString( value[ "strain" ], `${path}.strain` );
  if( value[ "grade" ] !== undefined ) assertRequiredString( value[ "grade" ], `${path}.grade` );

  const noneApplied = value[ "noneApplied" ];
  if( typeof noneApplied !== "boolean" ) throw new Error( `${path}.noneApplied must be a boolean.` );

  const applications = value[ "applications" ];
  if( !Array.isArray( applications ) ) throw new Error( `${path}.applications must be an array.` );
  applications.forEach(
    ( application, index ) => assertApplication( application, `${path}.applications[${index}]` ),
  );

  if( noneApplied !== ( applications.length === 0 ) ) {
    throw new Error( `${path}.noneApplied must be true iff applications is empty.` );
  }
}

export function normalizePesticideDisclosure( value: unknown ): unknown {
  if( !isRecord( value ) ) return value;
  const normalized = { ...value };
  for( const fieldName of NULLABLE_DISCLOSURE_FIELDS ) {
    if( normalized[ fieldName ] === null ) delete normalized[ fieldName ];
  }
  return normalized;
}

function assertDestinationObject(
  value: unknown,
  allowedFields: ReadonlySet<string>,
  path: string,
): asserts value is Record<string, unknown> {
  assertRecord( value, path );
  for( const fieldName of Object.keys( value ) ) {
    if( !allowedFields.has( fieldName ) ) {
      throw new Error( `${path} has an unknown destination field: ${fieldName}.` );
    }
  }
}

function assertDestinationAudit( value: unknown ): void {
  const path = "Pesticide disclosure destination";
  assertDestinationObject( value, DESTINATION_DOCUMENT_FIELDS, path );
  const applications = value[ "applications" ];
  if( applications !== undefined && applications !== null ) {
    if( !Array.isArray( applications ) ) throw new Error( `${path}.applications must be an array.` );
    applications.forEach( ( application, index ) => {
      assertDestinationObject(
        application,
        DESTINATION_APPLICATION_FIELDS,
        `${path}.applications[${index}]`,
      );
    });
  }
}

export function normalizeDisclosureFetchResult( value: unknown ): PesticideDisclosure {
  const path = "Pesticide disclosure fetch result";
  assertRecord( value, path );
  assertExactFields( value, FETCH_RESULT_FIELDS, path );
  assertDestinationAudit( value[ "destination" ] );
  const normalized = normalizePesticideDisclosure( value[ "disclosure" ] );
  assertPesticideDisclosure( normalized );
  return normalized;
}

function assertUniqueLotCultiveraIds( disclosures: PesticideDisclosure[], description: string ): void {
  const seen = new Set<string>();
  for( const disclosure of disclosures ) {
    if( seen.has( disclosure.lotCultiveraId ) ) {
      throw new Error( `duplicate pesticide disclosure ${description} for lotCultiveraId ${disclosure.lotCultiveraId}.` );
    }
    seen.add( disclosure.lotCultiveraId );
  }
}

export function normalizeDisclosureFetchResults( value: unknown ): PesticideDisclosure[] {
  if( !Array.isArray( value ) ) throw new Error( "Pesticide disclosure query must return an array." );
  const disclosures = value.map( normalizeDisclosureFetchResult );
  assertUniqueLotCultiveraIds( disclosures, "list result" );
  return disclosures;
}

export async function fetchPesticideDisclosuresFromDestination(
  fetcher: PesticideDisclosureFetcher,
): Promise<PesticideDisclosure[]> {
  return normalizeDisclosureFetchResults( await fetcher( DISCLOSURE_LIST_QUERY ) );
}

export async function fetchPesticideDisclosureByCultiveraIdFromDestination(
  fetcher: PesticideDisclosureFetcher,
  lotCultiveraId: string,
): Promise<PesticideDisclosure | null> {
  const value = await fetcher( DISCLOSURE_BY_CULTIVERA_ID_QUERY, { lotCultiveraId });
  if( value === null ) return null;
  return normalizeDisclosureFetchResult( value );
}

export interface PesticideDisclosureStaticPath {
  params: { cultiveraId: string };
  props: { disclosure: PesticideDisclosure };
}

export function preparePesticideDisclosureStaticPaths(
  disclosures: PesticideDisclosure[],
): PesticideDisclosureStaticPath[] {
  assertUniqueLotCultiveraIds( disclosures, "static route" );
  return disclosures.map( disclosure => ({
    params: { cultiveraId: disclosure.lotCultiveraId },
    props: { disclosure },
  }) );
}

export function resolvePesticideDisclosureRouteDocument(
  lotCultiveraId: string,
  disclosure: PesticideDisclosure,
): PesticideDisclosure {
  if( disclosure.lotCultiveraId !== lotCultiveraId ) {
    throw new Error( `pesticide disclosure build data drifted for lotCultiveraId ${lotCultiveraId}.` );
  }
  return disclosure;
}
```

- [ ] **Step 3: Write the failing vitest lib test**

Create `src/lib/pesticide-disclosure.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  DISCLOSURE_LOT_CULTIVERA_ID,
  DISCLOSURE_LOT_UUID,
  makeNoneAppliedDisclosureFixture,
  makePesticideDisclosureFixture,
} from "../../scripts/fixtures/pesticide-disclosure.ts";
import {
  assertPesticideDisclosure,
  fetchPesticideDisclosuresFromDestination,
  normalizeDisclosureFetchResult,
  normalizeDisclosureFetchResults,
  preparePesticideDisclosureStaticPaths,
  resolvePesticideDisclosureRouteDocument,
} from "./pesticide-disclosure.ts";

function makeDestinationDocument() {
  return {
    _id: `disclosure.${DISCLOSURE_LOT_UUID}`,
    _type: "pesticideDisclosure",
    _rev: "revision-1",
    _createdAt: "2026-09-05T00:00:00Z",
    _updatedAt: "2026-09-05T00:00:00Z",
    lotCultiveraId: DISCLOSURE_LOT_CULTIVERA_ID,
    strain: "Blue Dream",
    grade: "Top Shelf",
    noneApplied: false,
    applications: [
      {
        _key: "application-1",
        _type: "pesticideApplication",
        productName: "Regalia",
        activeIngredient: "Reynoutria sachalinensis extract",
        epaRegistrationNumber: "84059-3",
        appliedOn: "2026-07-14",
        targetPest: "Powdery mildew",
      },
      {
        _key: "application-2",
        _type: "pesticideApplication",
        productName: "Grandevo",
        activeIngredient: "Chromobacterium subtsugae strain PRAA4-1",
        epaRegistrationNumber: "84059-15",
        appliedOn: "2026-07-28",
        targetPest: "Spider mites",
      },
    ],
  };
}

function makeFetchResult() {
  return { disclosure: makePesticideDisclosureFixture(), destination: makeDestinationDocument() };
}

describe( "pesticide disclosure publication contract", () => {
  test( "requires the deterministic disclosure. id prefix", () => {
    expect( () => assertPesticideDisclosure({ ...makePesticideDisclosureFixture(), _id: "generated-id" }) )
      .toThrow( /_id must start with disclosure\./ );
  });

  test( "rejects noneApplied true with applications present", () => {
    expect( () => assertPesticideDisclosure({ ...makeNoneAppliedDisclosureFixture(), applications: makePesticideDisclosureFixture().applications }) )
      .toThrow( /noneApplied must be true iff applications is empty/ );
  });

  test( "rejects noneApplied false with an empty application list", () => {
    expect( () => assertPesticideDisclosure({ ...makePesticideDisclosureFixture(), applications: [] }) )
      .toThrow( /noneApplied must be true iff applications is empty/ );
  });

  test( "accepts a valid none-applied disclosure", () => {
    expect( () => assertPesticideDisclosure( makeNoneAppliedDisclosureFixture() ) ).not.toThrow();
  });

  test.each( [
    [ "document", ( destination: ReturnType<typeof makeDestinationDocument> ) => Object.assign( destination, { applicatorName: "person" }) ],
    [ "application", ( destination: ReturnType<typeof makeDestinationDocument> ) => Object.assign( destination.applications[0], { applicationRate: "private" }) ],
  ] )( "rejects an unknown stored %s field before returning the buyer projection", ( _level, mutate ) => {
    const fetchResult = makeFetchResult();
    mutate( fetchResult.destination );
    expect( () => normalizeDisclosureFetchResult( fetchResult ) ).toThrow( /unknown destination field/ );
  });

  test( "does not expose the audited destination document in the public disclosure", () => {
    expect( normalizeDisclosureFetchResult( makeFetchResult() ) ).toEqual( makePesticideDisclosureFixture() );
  });

  test( "executes the buyer projection with the destination audit at the fetch boundary", async () => {
    const queries: string[] = [];
    const result = await fetchPesticideDisclosuresFromDestination( async query => {
      queries.push( query );
      return [ makeFetchResult() ];
    });
    expect( result ).toEqual( [ makePesticideDisclosureFixture() ] );
    expect( queries[0] ).toContain( '"disclosure": {' );
    expect( queries[0] ).toContain( '"destination": @' );
    expect( queries[0] ).not.toContain( "$lotCultiveraId" ); // the list query, not the by-id query
  });

  test( "rejects duplicate lotCultiveraId returned by the list query", () => {
    expect( () => normalizeDisclosureFetchResults( [ makeFetchResult(), makeFetchResult() ] ) )
      .toThrow( /duplicate pesticide disclosure list result/ );
  });

  test( "prepares unique static paths and rejects duplicates", () => {
    const disclosure = makePesticideDisclosureFixture();
    expect( preparePesticideDisclosureStaticPaths( [ disclosure ] ) ).toEqual( [
      { params: { cultiveraId: DISCLOSURE_LOT_CULTIVERA_ID }, props: { disclosure } },
    ] );
    expect( () => preparePesticideDisclosureStaticPaths( [ disclosure, disclosure ] ) )
      .toThrow( /duplicate pesticide disclosure static route/ );
  });

  test( "validates route identity and returns the direct fetch", () => {
    const disclosure = makePesticideDisclosureFixture();
    expect( () => resolvePesticideDisclosureRouteDocument( "9999999", disclosure ) )
      .toThrow( /build data drifted/ );
    expect( resolvePesticideDisclosureRouteDocument( DISCLOSURE_LOT_CULTIVERA_ID, disclosure ) ).toBe( disclosure );
  });
});
```

- [ ] **Step 4: Write the node contract script**

Create `scripts/check-pesticide-disclosure-contract.ts`:

```ts
#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  assertPesticideDisclosure,
  normalizePesticideDisclosure,
} from "../src/lib/pesticide-disclosure.ts";
import {
  makeNoneAppliedDisclosureFixture,
  makePesticideDisclosureFixture,
} from "./fixtures/pesticide-disclosure.ts";

const fixture = makePesticideDisclosureFixture();

assertPesticideDisclosure( fixture );
assertPesticideDisclosure( makeNoneAppliedDisclosureFixture() );
// grade is optional
assertPesticideDisclosure( normalizePesticideDisclosure({ ...fixture, grade: null }) );

// bad calendar date
assert.throws( () => assertPesticideDisclosure({
  ...fixture,
  applications: [ { ...fixture.applications[0], appliedOn: "2026-13-40" } ],
}) );
// non-date-only string
assert.throws( () => assertPesticideDisclosure({
  ...fixture,
  applications: [ { ...fixture.applications[0], appliedOn: "2026-07-14T00:00:00Z" } ],
}) );
// unknown application field
assert.throws( () => assertPesticideDisclosure({
  ...fixture,
  applications: [ { ...fixture.applications[0], applicationRate: "2 oz/acre" } ],
}) );
// noneApplied contradiction
assert.throws( () => assertPesticideDisclosure({ ...fixture, applications: [] }) );
// missing required string
assert.throws( () => assertPesticideDisclosure({ ...fixture, strain: "" }) );
// bad id prefix
assert.throws( () => assertPesticideDisclosure({ ...fixture, _id: "coa.abc" }) );

console.log( "Pesticide disclosure contract checks passed." );
```

- [ ] **Step 5: Run the tests (both must pass)**

Run: `yarn vitest run src/lib/pesticide-disclosure.test.ts && node scripts/check-pesticide-disclosure-contract.ts`
Expected: vitest green; the node script prints "Pesticide disclosure contract checks passed."

- [ ] **Step 6: Commit**

```bash
git add src/lib/pesticide-disclosure.ts src/lib/pesticide-disclosure.test.ts scripts/fixtures/pesticide-disclosure.ts scripts/check-pesticide-disclosure-contract.ts
git commit -m "feat(lib): pure pesticide-disclosure contract module + fixture + tests"
```

---

### Task 3: Wire the client getters into `sanity.ts`

**Files:**
- Modify: `src/lib/sanity.ts`

**Interfaces:**
- Consumes: `fetchPesticideDisclosuresFromDestination`, `fetchPesticideDisclosureByCultiveraIdFromDestination`, and the `PesticideDisclosure*` types from Task 2.
- Produces: `getPesticideDisclosures(): Promise<PesticideDisclosure[]>`, `getPesticideDisclosureByCultiveraId( lotCultiveraId: string ): Promise<PesticideDisclosure | null>`, plus re-exported types `PesticideApplication`, `PesticideDisclosure`, and re-exported `preparePesticideDisclosureStaticPaths`, `resolvePesticideDisclosureRouteDocument`.

**Template to read:** the COA sections of `src/lib/sanity.ts` (the `fetchCoaDestination` fetcher and `getCoas`/`getCoaBySourceId`).

- [ ] **Step 1: Add the import + re-exports near the top of `src/lib/sanity.ts`**

Alongside the existing `./coa.ts` import block, add:
```ts
import {
  fetchPesticideDisclosureByCultiveraIdFromDestination,
  fetchPesticideDisclosuresFromDestination,
  type PesticideDisclosure,
  type PesticideDisclosureFetcher,
} from "./pesticide-disclosure.ts";
```
And with the other `export { ... } from` lines:
```ts
export { preparePesticideDisclosureStaticPaths, resolvePesticideDisclosureRouteDocument } from "./pesticide-disclosure.ts";
export type { PesticideApplication, PesticideDisclosure } from "./pesticide-disclosure.ts";
```

- [ ] **Step 2: Add the injected fetcher next to `fetchCoaDestination`**

```ts
const fetchDisclosureDestination: PesticideDisclosureFetcher = ( query, parameters ) => {
  if( parameters ) return sanityClient.fetch<unknown>( query, parameters );
  return sanityClient.fetch<unknown>( query );
};
```

- [ ] **Step 3: Add the getters (near the COA getters)**

```ts
// --- Pesticide disclosures ---

export async function getPesticideDisclosures(): Promise<PesticideDisclosure[]> {
  return fetchPesticideDisclosuresFromDestination( fetchDisclosureDestination );
}

export async function getPesticideDisclosureByCultiveraId(
  lotCultiveraId: string,
): Promise<PesticideDisclosure | null> {
  return fetchPesticideDisclosureByCultiveraIdFromDestination(
    fetchDisclosureDestination,
    lotCultiveraId,
  );
}
```

- [ ] **Step 4: Type-check**

Run: `yarn astro check`
Expected: 0 errors (this requires the Sanity env vars to be present; if the worktree lacks them, run instead `yarn tsc --noEmit -p tsconfig.json` which type-checks without connecting — either proves `sanity.ts` compiles).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sanity.ts
git commit -m "feat(lib): expose pesticide-disclosure getters from sanity.ts"
```

---

### Task 4: Rendering component + Python build checker + regression test

**Files:**
- Create: `src/components/PesticideDisclosureBody.astro`
- Create: `scripts/check-pesticide-disclosure-build.py`
- Create: `scripts/test-check-pesticide-disclosure-build.py`
- Create: `src/components/PesticideDisclosureBody.test.ts`
- Create: `scripts/fixtures/pesticide-disclosure-page-none-applied-has-applications.html`
- Create: `scripts/fixtures/pesticide-disclosure-page-hidden-application.html`

**Interfaces:**
- Consumes: `PesticideDisclosure` type (from `sanity.ts` / the lib), the fixture factory (Task 2).
- Produces: a component whose article root carries `data-disclosure-lot-cultivera-id`, and a Python checker with `--fixture` mode matching the fixture's exact values.

**Template to read:** `src/components/CoaBody.astro`, `src/components/CoaBody.test.ts`, `scripts/check-coa-build.py`, `scripts/test-check-coa-build.py`, `scripts/fixtures/coa-page-*.html`. The Python checker imports the local `html_elements` module (`parse_html_file`, `elements_with_attribute`, `is_descendant_of`) exactly as `check-coa-build.py` does.

Data-attribute contract the component renders and the checker asserts:
- Article root: `data-disclosure-lot-cultivera-id`, `data-disclosure-strain`, and `data-disclosure-grade` (only when grade present).
- A summary element: `data-disclosure-none-applied` = `"true"` or `"false"`.
- When `noneApplied`: the summary element's visible text states no pesticides were applied; zero application blocks.
- When not `noneApplied`: one block per application with `data-disclosure-application` and `data-disclosure-application-product` / `-active-ingredient` / `-epa` / `-applied-on` / `-target-pest`; each value visible in the block text; `-applied-on` matches `YYYY-MM-DD`.

- [ ] **Step 1: Write the component (root style — double quotes, semicolons)**

Create `src/components/PesticideDisclosureBody.astro`:

```astro
---
import type { PesticideDisclosure } from "../lib/pesticide-disclosure.ts";

interface Props {
  disclosure: PesticideDisclosure
}

const KICKER = "Northwest Local Cannabis";
const PAGE_TITLE = "Pesticide disclosure";
const NONE_APPLIED_STATEMENT = "No pesticides were applied to this lot.";
const APPLICATIONS_HEADING = "Pesticides applied";
const PRODUCT_LABEL = "Product";
const ACTIVE_INGREDIENT_LABEL = "Active ingredient";
const EPA_LABEL = "EPA registration no.";
const APPLIED_ON_LABEL = "Date applied";
const TARGET_PEST_LABEL = "Target pest";
const FOOTER_NOTE =
  "Washington rules (WAC 314-55-105) require producers to disclose the pesticides applied to cannabis. This lists what was applied to the lot identified by its Cultivera inventory number.";

const { disclosure }: Props = Astro.props;
const appliedSummary = disclosure.noneApplied
  ? NONE_APPLIED_STATEMENT
  : `${disclosure.applications.length} pesticide application${disclosure.applications.length === 1 ? "" : "s"} disclosed for this lot.`;
---

<article
  class="disclosure"
  aria-labelledby="disclosure-title"
  data-disclosure-lot-cultivera-id={disclosure.lotCultiveraId}
  data-disclosure-strain={disclosure.strain}
  data-disclosure-grade={disclosure.grade}
>
  <header class="disclosure-header">
    <p class="disclosure-kicker">{KICKER}</p>
    <h1 id="disclosure-title">{PAGE_TITLE}</h1>
    <dl class="disclosure-identifiers">
      <div>
        <dt>Strain</dt>
        <dd>{disclosure.grade ? `${disclosure.strain} · ${disclosure.grade}` : disclosure.strain}</dd>
      </div>
      <div>
        <dt>Lot (Cultivera no.)</dt>
        <dd>{disclosure.lotCultiveraId}</dd>
      </div>
    </dl>
  </header>

  <p class="disclosure-summary" data-disclosure-none-applied={String( disclosure.noneApplied )}>
    {appliedSummary}
  </p>

  {!disclosure.noneApplied && (
    <section class="disclosure-applications-section" aria-labelledby="disclosure-applications-heading">
      <h2 id="disclosure-applications-heading">{APPLICATIONS_HEADING}</h2>
      <ol class="disclosure-applications">
        {disclosure.applications.map( application => (
          <li>
            <dl
              class="disclosure-application"
              data-disclosure-application
              data-disclosure-application-product={application.productName}
              data-disclosure-application-active-ingredient={application.activeIngredient}
              data-disclosure-application-epa={application.epaRegistrationNumber}
              data-disclosure-application-applied-on={application.appliedOn}
              data-disclosure-application-target-pest={application.targetPest}
            >
              <div><dt>{PRODUCT_LABEL}</dt><dd>{application.productName}</dd></div>
              <div><dt>{ACTIVE_INGREDIENT_LABEL}</dt><dd>{application.activeIngredient}</dd></div>
              <div><dt>{EPA_LABEL}</dt><dd>{application.epaRegistrationNumber}</dd></div>
              <div><dt>{APPLIED_ON_LABEL}</dt><dd><time datetime={application.appliedOn}>{application.appliedOn}</time></dd></div>
              <div><dt>{TARGET_PEST_LABEL}</dt><dd>{application.targetPest}</dd></div>
            </dl>
          </li>
        ) )}
      </ol>
    </section>
  )}

  <p class="disclosure-footnote">{FOOTER_NOTE}</p>
</article>
```

- [ ] **Step 2: Add component styles to `src/styles/global.css`**

Add a `disclosure-*` block near the `coa-*` styles, reusing tokens (`--bg-surface`, `--border`, `--text-primary`, `--text-secondary`, `--accent`). Mirror `.coa-summary` / `.coa-identifiers` / `.coa-panel-register` for `.disclosure-identifiers` and `.disclosure-application` (a `<dl>` grid: `dt` uppercase secondary label, `dd` primary). Make `.disclosure-summary[data-disclosure-none-applied="true"]` visually prominent (accent border/left rule). Keep it minimal and consistent with the dark palette.

- [ ] **Step 3: Write the Python build checker**

Create `scripts/check-pesticide-disclosure-build.py` mirroring `scripts/check-coa-build.py`. Key specifics:
- `DISCLOSURE_ROUTE_DIRECTORY = "pesticides"`, `DISCLOSURE_PAGE_NAME = "index.html"`, `FIXTURE_PAGE_NAME = "pesticide-disclosure-page.html"`, `FIXTURE_MODE_FLAG = "--fixture"`.
- Landmark attribute `data-disclosure-lot-cultivera-id`; in build mode, `pages_for_root` globs `dist/pesticides/*/index.html` and derives the route id from `page.parent.name` (skip `pesticides/index.html` itself — the directory index — by excluding the page whose parent is exactly the route directory; i.e. only accept `*/index.html` one level below `pesticides/`).
- `check_page(page, expected_lot_cultivera_id)` asserts: exactly one landmark; its `data-disclosure-lot-cultivera-id` non-empty and (when `expected_lot_cultivera_id` given) equal to the route; exactly one `data-disclosure-none-applied` element with value in `{"true","false"}`; if `"true"`, zero `data-disclosure-application` elements and the summary text contains "No pesticides were applied"; if `"false"`, at least one application element, each with all five `data-disclosure-application-*` attributes non-empty, `applied-on` matching `^\d{4}-\d{2}-\d{2}$`, and each of the five values present in that element's visible text.
- **Fixture mode handles both fixtures via one structural pass.** `check_page` reads `data-disclosure-none-applied` and branches: if `"false"`, enforce the applications-fixture `EXPECTED_FIXTURE_*` constants exactly (lotCultiveraId `2043117`, strain `Blue Dream`, grade `Top Shelf`, and the two applications, in order, by their `data-disclosure-application-*` tuples); if `"true"`, assert zero application elements, a non-empty lotCultiveraId and strain, and the affirmative "No pesticides were applied" text. In build mode, only the structural rules apply (no `EXPECTED_FIXTURE_*` equality) plus the route-id match. So a single `check_page(page, expected_lot_cultivera_id_or_none)` serves fixture and build modes; fixture mode passes the expected id only for the applications fixture.
- Empty build root (no `pesticides/` dir or no per-lot pages) → print an OK message and `return 0` (pre-publication success), exactly like `check-coa-build.py`.

Follow `check-coa-build.py`'s `main()`/`pages_for_root()`/exit-code structure verbatim (exit 0 success, 1 failures, 2 usage/missing-fixture).

- [ ] **Step 4: Write the regression test + malformed fixtures**

Create the two malformed HTML fixtures (a `<main>`-wrapped single page, like `coa-page-*.html`):
- `pesticide-disclosure-page-none-applied-has-applications.html`: a `data-disclosure-none-applied="true"` summary but with an application block present (contradiction the checker must reject).
- `pesticide-disclosure-page-hidden-application.html`: an application block whose `data-disclosure-application-target-pest` value is NOT present in the visible text (invisibility the checker must reject).

Create `scripts/test-check-pesticide-disclosure-build.py` mirroring `scripts/test-check-coa-build.py`: copy each malformed fixture into a temp dir, run the checker in `--fixture` mode, assert exit code 1 and the expected failure substring; assert empty-build-root success (exit 0) and empty-fixture-root failure (exit 2).

- [ ] **Step 5: Write the component test (renders the real component → runs the checker)**

Create `src/components/PesticideDisclosureBody.test.ts` mirroring `CoaBody.test.ts`: two `test(...)` cases, one per fixture (`makePesticideDisclosureFixture()` and `makeNoneAppliedDisclosureFixture()`). Each renders the component via `AstroContainer.renderToString`, writes the body wrapped as `<main>${body}</main>` to a fresh temp dir file named `pesticide-disclosure-page.html`, runs `spawnSync("python3", ["scripts/check-pesticide-disclosure-build.py", "--fixture", fixtureRoot])`, and asserts `result.status === 0`. Both pass through the single structural `check_page` from Step 3 — the applications fixture exercises the `EXPECTED_FIXTURE_*` equality branch, the none-applied fixture the affirmative-statement branch — so no extra checker flags are needed.

- [ ] **Step 6: Run everything**

Run: `yarn vitest run src/components/PesticideDisclosureBody.test.ts && python3 scripts/test-check-pesticide-disclosure-build.py`
Expected: vitest green; the regression test prints its "regression holds" lines.

- [ ] **Step 7: Commit**

```bash
git add src/components/PesticideDisclosureBody.astro src/styles/global.css scripts/check-pesticide-disclosure-build.py scripts/test-check-pesticide-disclosure-build.py src/components/PesticideDisclosureBody.test.ts scripts/fixtures/pesticide-disclosure-page-*.html
git commit -m "feat(web): pesticide disclosure body component + dist build checker"
```

---

### Task 5: Per-lot detail page

**Files:**
- Create: `src/pages/pesticides/[...cultiveraId].astro`

**Interfaces:**
- Consumes: `getPesticideDisclosures`, `getPesticideDisclosureByCultiveraId`, `preparePesticideDisclosureStaticPaths`, `resolvePesticideDisclosureRouteDocument` (from `sanity.ts`), and `PesticideDisclosureBody`.
- Produces: static pages at `/pesticides/<lotCultiveraId>/`.

**Template to read:** `src/pages/coas/[...sourceId].astro`.

- [ ] **Step 1: Write the page**

```astro
---
import Layout from "../../layouts/Layout.astro";
import PesticideDisclosureBody from "../../components/PesticideDisclosureBody.astro";
import {
  getPesticideDisclosureByCultiveraId,
  getPesticideDisclosures,
  preparePesticideDisclosureStaticPaths,
  resolvePesticideDisclosureRouteDocument,
} from "../../lib/sanity";

export async function getStaticPaths() {
  return preparePesticideDisclosureStaticPaths( await getPesticideDisclosures() );
}

const { cultiveraId } = Astro.params;
if( !cultiveraId ) throw new Error( "Pesticide disclosure route requires a Cultivera id." );

const directlyFetched = await getPesticideDisclosureByCultiveraId( cultiveraId );
if( !directlyFetched ) return Astro.redirect( "/pesticides" );
const disclosure = resolvePesticideDisclosureRouteDocument( cultiveraId, directlyFetched );

const pageTitle = `Pesticide disclosure: lot ${disclosure.lotCultiveraId}`;
const description = `Pesticides applied to lot ${disclosure.lotCultiveraId} (${disclosure.strain}) from Northwest Local Cannabis.`;
---

<Layout title={pageTitle} description={description}>
  <PesticideDisclosureBody {disclosure} />
</Layout>
```

- [ ] **Step 2: Build and run the dist checker against real output**

Run: `make check-pesticide-disclosure-build` (this depends on `build`; if the worktree lacks Sanity env vars and cannot fetch, the build produces zero pesticide pages and the checker returns the pre-publication success — that still proves the page + checker wire up without error). If env is available, expect one page per published disclosure verified.

- [ ] **Step 3: Commit**

```bash
git add src/pages/pesticides/\[...cultiveraId\].astro
git commit -m "feat(web): per-lot pesticide disclosure detail page"
```

---

### Task 6: Browsable index page + search

**Files:**
- Create: `src/pages/pesticides/index.astro`
- Create: `src/lib/pesticide-search.ts`
- Create: `src/lib/pesticide-search.test.ts`
- Create: `src/lib/pesticide-browser.ts`

**Interfaces:**
- Consumes: `getPesticideDisclosures`, `PesticideDisclosure` (from `sanity.ts`).
- Produces: the `/pesticides` directory page; `filterPesticideDisclosures( records, query )` returning matching `lotCultiveraId`s.

**Template to read:** `src/lib/glossary-search.ts`, `src/lib/glossary-browser.ts`, `src/components/GlossarySearch.astro` (for the row/`data-*`/progressive-enhancement pattern), and the `.card-grid`/`.glossary-index` classes.

- [ ] **Step 1: Write the pure search helper + its failing test**

Create `src/lib/pesticide-search.ts`:

```ts
export interface DisclosureSearchRecord {
  lotCultiveraId: string;
  strain: string;
  grade?: string;
}

export function normalizeDisclosureSearchText( value: string ): string {
  return value
    .normalize( "NFKD" )
    .replace( /\p{M}+/gu, "" )
    .toLowerCase()
    .replace( /[\p{P}\p{S}]+/gu, " " )
    .replace( /\s+/g, " " )
    .trim();
}

function disclosureSearchText( record: DisclosureSearchRecord ): string {
  return normalizeDisclosureSearchText(
    [ record.lotCultiveraId, record.strain, record.grade ?? "" ].join( " " ),
  );
}

export function filterPesticideDisclosures(
  records: readonly DisclosureSearchRecord[],
  query: string,
): string[] {
  const normalizedQuery = normalizeDisclosureSearchText( query );
  return records
    .filter( record => !normalizedQuery || disclosureSearchText( record ).includes( normalizedQuery ) )
    .map( record => record.lotCultiveraId );
}
```

Create `src/lib/pesticide-search.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { filterPesticideDisclosures } from "./pesticide-search.ts";

const RECORDS = [
  { lotCultiveraId: "2043117", strain: "Blue Dream", grade: "Top Shelf" },
  { lotCultiveraId: "2051002", strain: "Gelato #33", grade: "Value" },
];

describe( "pesticide disclosure search", () => {
  test( "matches on the Cultivera number", () => {
    expect( filterPesticideDisclosures( RECORDS, "2043117" ) ).toEqual( [ "2043117" ] );
  });
  test( "matches on strain, case-insensitively", () => {
    expect( filterPesticideDisclosures( RECORDS, "gelato" ) ).toEqual( [ "2051002" ] );
  });
  test( "returns every id for an empty query", () => {
    expect( filterPesticideDisclosures( RECORDS, "  " ) ).toEqual( [ "2043117", "2051002" ] );
  });
  test( "returns nothing for an unrelated query", () => {
    expect( filterPesticideDisclosures( RECORDS, "zzzz" ) ).toEqual( [] );
  });
});
```

Run: `yarn vitest run src/lib/pesticide-search.test.ts` — expect green.

- [ ] **Step 2: Write the browser module**

Create `src/lib/pesticide-browser.ts` mirroring `glossary-browser.ts` (simpler — one search input, no letter/category rails): on `initializePesticideBrowser()`, read the search input, filter `[data-disclosure-row]` elements by `filterPesticideDisclosures` over their `data-disclosure-row-id` / `data-disclosure-row-strain` / `data-disclosure-row-grade` attributes, toggle `hidden` on non-matches, update a live `aria-live` result count, sync `?q=` via `history.replaceState`, and show an empty-state element when zero match. Reveal the controls band (which starts `hidden`) on init (progressive enhancement).

- [ ] **Step 3: Write the index page**

Create `src/pages/pesticides/index.astro`: `getPesticideDisclosures()` at build; server-render intro copy, a search band (starting `hidden`, revealed by the client module), a live result count, an empty-state element, and a `<dl>`/grid directory (mirror `.glossary-index`) with one row per disclosure carrying `data-disclosure-row`, `data-disclosure-row-id`, `data-disclosure-row-strain`, `data-disclosure-row-grade`, each row linking to `/pesticides/<lotCultiveraId>/`. Sort rows by `lotCultiveraId`. Include an inline `<script>` importing and calling `initializePesticideBrowser`. Wrap in `<Layout title="Pesticide disclosures" description="Look up the pesticides applied to any Northwest Local Cannabis lot by its Cultivera inventory number.">`.

- [ ] **Step 4: Type-check and build**

Run: `yarn astro check` (or `yarn tsc --noEmit` if env-less), then `yarn build` if Sanity env is available (expect the index + per-lot pages to emit).

- [ ] **Step 5: Commit**

```bash
git add src/pages/pesticides/index.astro src/lib/pesticide-search.ts src/lib/pesticide-search.test.ts src/lib/pesticide-browser.ts
git commit -m "feat(web): browsable /pesticides index with client search"
```

---

### Task 7: Makefile targets, CI wiring, docs

**Files:**
- Modify: `Makefile`
- Modify: `.github/workflows/deploy.yml`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/audit.yml`
- Modify: `docs/content-model.md`

**Interfaces:**
- Consumes: all scripts/tests from Tasks 2, 4.
- Produces: `make check` runs the full pesticide-disclosure suite; deploy is gated on the dist checker.

**Template to read:** the COA/glossary targets in `Makefile`, and the three workflow files.

- [ ] **Step 1: Add the Makefile targets**

```makefile
check-pesticide-disclosure-contract: ## Verify the public pesticide-disclosure runtime contract
	@node scripts/check-pesticide-disclosure-contract.ts

test-pesticide-disclosure: ## Test pesticide-disclosure validation, routing, search, and rendering
	@yarn vitest run src/lib/pesticide-disclosure.test.ts src/lib/pesticide-search.test.ts src/components/PesticideDisclosureBody.test.ts

check-pesticide-disclosure-build: build ## Verify every built public pesticide-disclosure page
	@python3 scripts/check-pesticide-disclosure-build.py dist

test-check-pesticide-disclosure-build: ## Regression-test malformed pesticide-disclosure page fixtures
	@python3 scripts/test-check-pesticide-disclosure-build.py
```

Add all four target names to the `.PHONY` line. Wire them into the `check` aggregate: add `check-pesticide-disclosure-contract test-pesticide-disclosure test-check-pesticide-disclosure-build` to the pre-`build` group (next to `check-coa-contract test-coa ... test-check-coa-build`), and `check-pesticide-disclosure-build` to the post-`build` group (next to `check-coa-build check-drop-build`).

- [ ] **Step 2: Gate deploy on the dist checker (`deploy.yml`)**

In the `build` job, after the existing `Check drop build contracts` step, add:
```yaml
      # A pesticide disclosure is published to Sanity by nw-local-ops with no
      # pull request, so its per-lot pages can change without CI. Fail the build
      # before GitHub Pages receives the artifact, keeping the previous
      # deployment live.
      - name: Check pesticide disclosure build contracts
        run: ./scripts/check-pesticide-disclosure-build.py dist
```
(Ensure `scripts/check-pesticide-disclosure-build.py` is executable: `chmod +x`.)

- [ ] **Step 3: Add PR checks (`ci.yml`)**

In the `typecheck` job, extend the make line:
```yaml
        run: make check-coa-contract test-coa test-drops test-check-drop-build check-pesticide-disclosure-contract test-pesticide-disclosure test-check-pesticide-disclosure-build
```
(The node-only `check-pesticide-disclosure-contract` could also go in the `drop-lookup` job, but it imports the lib which imports nothing Sanity — keeping it with `test-pesticide-disclosure` in `typecheck` is simplest since that job has yarn installed for vitest.)

- [ ] **Step 4: Add the dist check to PR audit (`audit.yml`)**

In `validate-content-style`, after the drop steps, add:
```yaml
      - name: Regression-test malformed pesticide-disclosure build fixtures
        run: python3 scripts/test-check-pesticide-disclosure-build.py
      - name: Check pesticide disclosure build contracts
        run: ./scripts/check-pesticide-disclosure-build.py dist
```

- [ ] **Step 5: Document the type in `docs/content-model.md`**

Add a short paragraph: the `pesticideDisclosure` document is machine-owned (published by nw-local-ops SP2), keyed on `lotCultiveraId`, rendered at `/pesticides/<lotCultiveraId>/` with a browsable `/pesticides` index; note it is intentionally absent from the Studio sidebar (machine-owned, auto-appended) and that its `dist` checker gates deploy.

- [ ] **Step 6: Run the full aggregate**

Run: `make check`
Expected: green (studio lint/typecheck/format + `astro check` included). If Sanity env vars are absent locally, the `build`-dependent steps still pass because empty pesticide output is a pre-publication success and `astro check`/vitest do not need live data; confirm no NEW failures relative to a clean `main` `make check`.

- [ ] **Step 7: Commit**

```bash
git add Makefile .github/workflows/deploy.yml .github/workflows/ci.yml .github/workflows/audit.yml docs/content-model.md
git commit -m "ci: wire pesticide-disclosure checks into make check and gate deploy"
```

---

## Notes for the executor

- **Env-less worktree:** if the worktree has no Sanity credentials, `getPesticideDisclosures()` cannot fetch, so `yarn build` yields zero pesticide pages and `check-pesticide-disclosure-build.py` returns the pre-publication success — that is expected and still exercises the wiring. `yarn astro check` may require env; fall back to `yarn tsc --noEmit` to prove compilation. vitest and the node contract script need no env.
- **`make check` is the real gate.** Run it before the whole-branch review; the per-task tests do not exercise the workflow wiring or the studio format check.
- **Style per file:** studio files are Prettier (no semicolons, single quotes); everything under `src/` and `scripts/` is the root style (semicolons, double quotes, spaced parens). Run `yarn format` (root) and `cd studio && yarn format` before committing if unsure.
