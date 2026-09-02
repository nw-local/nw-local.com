# Drop Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the public Drop page (`/drops/<slug>/`) so it shows each strain's lineage, verified certificate of analysis, COA-basis total THC, availability state and release photography, in the structure of the buyer sheet and the site's dark skin.

**Architecture:** Two Studio schema fields (`strain.lineage`, `drop.coas`, `drop.gallery`) feed one strict validator and one pure grouping function in `src/lib/drops.ts`; four new Astro components render the grouped chapters; a static `coas.json` endpoint derived from the same validated data lets a Python checker verify every built drop page without Sanity access. The checker is wired into `make check`, `ci.yml` and `deploy.yml` so a content publish that breaks the page fails the deploy instead of going live.

**Tech Stack:** Astro 6 (static build, Container API in tests), Sanity (GROQ projections, Studio schema in `studio/`), TypeScript, vitest via `getViteConfig`, Python 3 `html.parser` build checkers, GNU make.

**Spec:** `docs/superpowers/specs/2026-09-02-drop-page-redesign-design.md`

## Global Constraints

- Potency shown is the release certificate's total THC (`coa.totalThc`), never a strain `thcRange` or marketplace figure.
- Availability on the drop page is per-strain state only (Available / Sold out), derived from product `available` flags. No quantities. No prices anywhere on the page.
- Certificates are explicit references (`drop.coas`), matched to a chapter by exact `strain.url === ${siteUrl}/strains/${slug}/`. Never match by strain name.
- Every `<img src>` inside the drop page comes from `urlFor()` (host `cdn.sanity.io`).
- No `<a>` may sit inside a `.card` (the card itself may be a link; ProductCard is a `<div class="card">` and must stay anchor-free).
- Studio `rule.required()` is Studio-only; the build validates, and a validation failure throws so the build fails loudly.
- `src/lib/drops.ts` and `src/lib/coa.ts` must stay dependency-free (imports of `./sanity` are `import type` only) because `scripts/check-drop-lookup.ts` and `scripts/check-coa-contract.ts` run them under node's built-in type stripping with no `yarn install`. Runtime imports between them use the `.ts` extension.
- Root code style: double quotes, spaces inside parentheses (`fn( arg )`), two-space indent, semicolons. Studio code style (Prettier): single quotes, no semicolons.
- Descriptive identifiers only; no single-letter names, including callback parameters.
- Every commit runs `yarn lint` (root) clean; Studio changes run `cd studio && yarn lint && yarn typecheck && yarn format:check` clean.
- Never start the dev server. Never read or print `.env`. Never add attribution or session trailers to commits.
- Working copy: `/Users/benny/dev/nw-local.com/.worktrees/drop-page-redesign`, branch `feat/drop-page-redesign`. Commit with `git -C <worktree> commit`.

## Environment notes for implementers

- Install once: `cd /Users/benny/dev/nw-local.com/.worktrees/drop-page-redesign && make install` (root and `studio/`).
- Unit tests that import `src/lib/sanity.ts` at runtime (directly or through a component that uses `urlFor`) need the three Sanity env vars set. Run them through the main checkout's Makefile, which exports the real `.env` without printing it:
  ```bash
  SP=/private/tmp/claude-501/-Users-benny-dev-nw-local-ops/34c130af-593d-400d-82e8-7a61db0b302b/scratchpad
  make -C /Users/benny/dev/nw-local.com -f Makefile -f $SP/publish.mk run-with-env \
    CMD='make -C /Users/benny/dev/nw-local.com/.worktrees/drop-page-redesign <target>'
  ```
  `$SP/publish.mk` contains exactly `run-with-env: ; @$(CMD)`. Use the same wrapper for `make build` and `make check`.
- Pure tests (`src/lib/drops.test.ts`) need no env: `yarn vitest run src/lib/drops.test.ts`.

## File structure

| File | Responsibility |
|---|---|
| `studio/schemaTypes/strain.ts` | add `lineage` |
| `studio/schemaTypes/drop.ts` | add `coas`, `gallery` |
| `src/lib/coa.ts` | export the assertion primitives drops.ts reuses |
| `src/lib/drops.ts` | `DropCoa` type + `DROP_COA_PROJECTION` + `assertDropCoa`; `groupDropStrains`; `dropCoaManifest`; `dropCoaHref`; `formatDropTotalThc`; chapter palette |
| `src/lib/drops.test.ts` | vitest for everything above |
| `src/lib/sanity.ts` | types (`lineage`, `coas`, `gallery`, `strainDescriptions`) and `getDrop()` projection + validation |
| `src/pages/drops/[...slug]/coas.json.ts` | static manifest endpoint |
| `src/components/DropCover.astro` | cover |
| `src/components/DropIndexRibbon.astro` | four-color index |
| `src/components/DropGallery.astro` | gallery grid |
| `src/components/DropStrainChapter.astro` | one chapter |
| `src/components/DropStrainChapter.test.ts` | Container render + checker fixture run |
| `src/pages/drops/[...slug].astro` | page assembly |
| `src/components/DropCard.astro` | index card cover treatment |
| `src/pages/strains/[...slug].astro` | lineage line |
| `src/styles/global.css` | `.drop-*` and `.strain-lineage` rules |
| `scripts/check-drop-build.py`, `scripts/test-check-drop-build.py`, `scripts/fixtures/drop-page*.html`, `scripts/fixtures/drop-coas.json` | build checker + regression fixtures |
| `Makefile`, `.github/workflows/ci.yml`, `.github/workflows/deploy.yml` | wiring |

---

### Task 1: Studio schema fields

**Files:**
- Modify: `studio/schemaTypes/strain.ts` (after the `cbdRange` field, line 65)
- Modify: `studio/schemaTypes/drop.ts` (after `retailers`, line 123)

**Interfaces:**
- Produces: Sanity fields `strain.lineage` (string), `drop.coas` (array of reference→`coa`), `drop.gallery` (array of image with required `alt`, hotspot). Task 2 projects them.

- [ ] **Step 1: Add `lineage` to the strain schema**

Insert after the `cbdRange` `defineField` block in `studio/schemaTypes/strain.ts`:

```ts
    defineField({
      name: 'lineage',
      title: 'Lineage',
      type: 'string',
      description:
        'Parent cross as printed on the buyer sheet, for example "Grape Gas #10 × OGKB Blueberry Headband".',
    }),
```

- [ ] **Step 2: Add `coas` and `gallery` to the drop schema**

Insert after the `retailers` `defineField` block in `studio/schemaTypes/drop.ts`:

```ts
    defineField({
      name: 'coas',
      title: 'Certificates of Analysis',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'coa' }] }],
      description:
        'Release certificates for the lots in this drop, one per strain. Set by Northwest Local OPS from the launch snapshot.',
      validation: (rule) => rule.unique(),
    }),
    defineField({
      name: 'gallery',
      title: 'Gallery',
      type: 'array',
      description: 'Release photography shown below the introduction.',
      of: [
        {
          type: 'image',
          options: { hotspot: true },
          fields: [
            defineField({
              name: 'alt',
              title: 'Alternative Text',
              type: 'string',
              validation: (rule) => rule.required(),
            }),
          ],
        },
      ],
    }),
```

- [ ] **Step 3: Run the Studio checks**

Run: `cd studio && yarn lint && yarn typecheck && yarn format:check`
Expected: all three clean. If `format:check` complains, run `yarn format` in `studio/` and re-check.

- [ ] **Step 4: Commit**

```bash
git add studio/schemaTypes/strain.ts studio/schemaTypes/drop.ts
git commit -m "studio: add strain.lineage, drop.coas and drop.gallery"
```

---

### Task 2: Drop COA type, projection and validator

**Files:**
- Modify: `src/lib/coa.ts` (export existing primitives; no behavior change)
- Modify: `src/lib/drops.ts`
- Modify: `src/lib/sanity.ts` (`ProductStrainRef`, `StrainSummary`, `Drop`, `PRODUCT_SUMMARY_PROJECTION`, `getStrain`, `getDrop`)
- Test: `src/lib/drops.test.ts` (create)

**Interfaces:**
- Consumes: `CoaStatus` from `./coa.ts`.
- Produces (from `src/lib/drops.ts`):
  ```ts
  export interface DropCoaReading { value: string; unit: string }
  export interface DropCoaStrain { name: string; url: string }
  export interface DropCoa {
    sourceId: string; labResultId: string; status: CoaStatus; publishedAt: string;
    totalThc?: DropCoaReading; strain?: DropCoaStrain;
  }
  export const DROP_COA_PROJECTION: string;
  export function assertDropCoa( value: unknown, path?: string ): asserts value is DropCoa;
  export function assertDropCoas( value: unknown ): asserts value is DropCoa[];
  ```
- Produces (from `src/lib/sanity.ts`): `ProductStrainRef.lineage?: string`, `StrainSummary.lineage?: string`, `Drop.coas: DropCoa[]`, `Drop.gallery?: SanityImage[]`, `Drop.strainDescriptions: DropStrainDescription[]` where `interface DropStrainDescription { _id: string; description?: PortableText }`.

- [ ] **Step 1: Export the assertion primitives from `coa.ts`**

In `src/lib/coa.ts`, add the `export` keyword to these existing declarations (no other change): `UUID_PATTERN` (line 112), `isRecord`, `assertRecord`, `assertExactFields`, `assertRequiredString`, `assertHttpsUrl`, `assertStatus`, `assertRfc3339Timestamp`, `assertMeasurement`.

- [ ] **Step 2: Write the failing validator tests**

Create `src/lib/drops.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { assertDropCoa, assertDropCoas } from "./drops.ts";

export const DROP_COA_SOURCE_ID = "00000000-0000-4000-8000-000000000001";

export function makeDropCoaFixture() {
  return {
    sourceId: DROP_COA_SOURCE_ID,
    labResultId: "2155470281845367208-18-2026",
    status: "pass",
    publishedAt: "2026-09-01T21:15:30Z",
    totalThc: { value: "29.39", unit: "%" },
    strain: { name: "Test Strain", url: "https://nw-local.com/strains/test-strain/" },
  };
}

describe( "assertDropCoa", () => {
  test( "accepts the fixture", () => {
    expect( () => assertDropCoa( makeDropCoaFixture() ) ).not.toThrow();
  });

  test( "accepts a COA without a reading or a strain", () => {
    const { totalThc: _totalThc, strain: _strain, ...bare } = makeDropCoaFixture();
    expect( () => assertDropCoa( bare ) ).not.toThrow();
  });

  test.each( [
    [ "an unknown field", { ...makeDropCoaFixture(), sampleId: "S" }, "unknown field: sampleId" ],
    [ "a non-UUID sourceId", { ...makeDropCoaFixture(), sourceId: "abc" }, "must be a UUID" ],
    [ "a blank labResultId", { ...makeDropCoaFixture(), labResultId: " " }, "labResultId must be a non-empty string" ],
    [ "an unknown status", { ...makeDropCoaFixture(), status: "pending" }, 'must be "pass" or "fail"' ],
    [ "a loose timestamp", { ...makeDropCoaFixture(), publishedAt: "2026-09-01" }, "strict RFC3339" ],
    [ "a null reading", { ...makeDropCoaFixture(), totalThc: null }, "totalThc must be an object" ],
    [ "a non-canonical reading", { ...makeDropCoaFixture(), totalThc: { value: "29.390", unit: "%" } }, "canonical decimal" ],
    [ "a reading with a label", { ...makeDropCoaFixture(), totalThc: { label: "x", value: "1", unit: "%" } }, "unknown field: label" ],
    [ "a blank unit", { ...makeDropCoaFixture(), totalThc: { value: "1", unit: "" } }, "unit must be a non-empty string" ],
    [ "an http strain url", { ...makeDropCoaFixture(), strain: { name: "S", url: "http://nw-local.com/strains/s/" } }, "HTTPS URL" ],
    [ "a strain with extra keys", { ...makeDropCoaFixture(), strain: { name: "S", url: "https://nw-local.com/strains/s/", slug: "s" } }, "unknown field: slug" ],
  ] )( "rejects %s", ( _description, value, message ) => {
    expect( () => assertDropCoa( value ) ).toThrow( message );
  });

  test( "assertDropCoas rejects a non-array and a duplicate source id", () => {
    expect( () => assertDropCoas( null ) ).toThrow( "must be an array" );
    expect( () => assertDropCoas( [ makeDropCoaFixture(), makeDropCoaFixture() ] ) )
      .toThrow( `duplicate drop COA for source ID ${DROP_COA_SOURCE_ID}` );
  });

  test( "assertDropCoas names the failing index", () => {
    expect( () => assertDropCoas( [ makeDropCoaFixture(), { ...makeDropCoaFixture(), sourceId: "x" } ] ) )
      .toThrow( "drop COA [1].sourceId must be a UUID" );
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `yarn vitest run src/lib/drops.test.ts`
Expected: FAIL, `assertDropCoa` is not exported.

- [ ] **Step 4: Implement the type, projection and validator in `drops.ts`**

Replace the first line of `src/lib/drops.ts` and append the new block. The `import type` line becomes:

```ts
import type { DropStatus, DropSummary, SanitySlug } from "./sanity";
import {
  UUID_PATTERN,
  assertExactFields,
  assertHttpsUrl,
  assertMeasurement,
  assertRecord,
  assertRequiredString,
  assertRfc3339Timestamp,
  assertStatus,
  type CoaStatus,
} from "./coa.ts";
```

Append to the end of the file:

```ts
// --- Drop certificates ---
//
// A drop names its release certificates explicitly (drop.coas) rather than
// looking them up by strain name: the certificate's strain.url is the join key,
// and it is matched exactly in groupDropStrains. This is the buyer-facing
// subset of a COA document: enough to say "Pass, 29.39% Total THC, here is the
// certificate", and nothing a drop page should not restate (panels, sample ids,
// the PDF).

export interface DropCoaReading {
  value: string;
  unit: string;
}

export interface DropCoaStrain {
  name: string;
  url: string;
}

export interface DropCoa {
  sourceId: string;
  labResultId: string;
  status: CoaStatus;
  publishedAt: string;
  totalThc?: DropCoaReading;
  strain?: DropCoaStrain;
}

export const DROP_COA_PROJECTION = `{
  sourceId, labResultId, status, publishedAt,
  defined(totalThc) => { "totalThc": totalThc { value, unit } },
  defined(strain) => { "strain": strain { name, url } }
}`;

const DROP_COA_FIELDS: ReadonlySet<string> = new Set( [
  "sourceId",
  "labResultId",
  "status",
  "publishedAt",
  "totalThc",
  "strain",
] );
const DROP_COA_READING_FIELDS: ReadonlySet<string> = new Set( [ "value", "unit" ] );
const DROP_COA_STRAIN_FIELDS: ReadonlySet<string> = new Set( [ "name", "url" ] );

function assertDropCoaReading( value: unknown, path: string ): asserts value is DropCoaReading {
  assertRecord( value, path );
  assertExactFields( value, DROP_COA_READING_FIELDS, path );
  assertMeasurement( value, path );
}

function assertDropCoaStrain( value: unknown, path: string ): asserts value is DropCoaStrain {
  assertRecord( value, path );
  assertExactFields( value, DROP_COA_STRAIN_FIELDS, path );
  assertRequiredString( value[ "name" ], `${path}.name` );
  assertHttpsUrl( value[ "url" ], `${path}.url` );
}

export function assertDropCoa( value: unknown, path = "drop COA" ): asserts value is DropCoa {
  assertRecord( value, path );
  assertExactFields( value, DROP_COA_FIELDS, path );

  const sourceId = value[ "sourceId" ];
  assertRequiredString( sourceId, `${path}.sourceId` );
  if( !UUID_PATTERN.test( sourceId ) ) throw new Error( `${path}.sourceId must be a UUID.` );

  assertRequiredString( value[ "labResultId" ], `${path}.labResultId` );
  assertStatus( value[ "status" ], `${path}.status` );
  assertRfc3339Timestamp( value[ "publishedAt" ], `${path}.publishedAt` );
  if( value[ "totalThc" ] !== undefined ) assertDropCoaReading( value[ "totalThc" ], `${path}.totalThc` );
  if( value[ "strain" ] !== undefined ) assertDropCoaStrain( value[ "strain" ], `${path}.strain` );
}

export function assertDropCoas( value: unknown ): asserts value is DropCoa[] {
  if( !Array.isArray( value ) ) throw new Error( "drop COAs must be an array." );
  const seenSourceIds = new Set<string>();
  value.forEach( ( candidate, index ) => {
    assertDropCoa( candidate, `drop COA [${index}]` );
    if( seenSourceIds.has( candidate.sourceId ) ) {
      throw new Error( `duplicate drop COA for source ID ${candidate.sourceId}.` );
    }
    seenSourceIds.add( candidate.sourceId );
  });
}
```

Note `assertMeasurement` reads `value` and `unit` and already throws `${path}.value must be a canonical decimal string.` / `${path}.unit must be a non-empty string.`; `assertExactFields` throws `${path} has an unknown field: ${name}.`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `yarn vitest run src/lib/drops.test.ts`
Expected: PASS (all cases). Also run `node scripts/check-drop-lookup.ts` to prove `drops.ts` still loads under node type stripping. Expected: its existing OK line.

- [ ] **Step 6: Extend the Sanity types and projections**

In `src/lib/sanity.ts`:

1. Add to the import block at the top: `import { assertDropCoas, DROP_COA_PROJECTION, type DropCoa } from "./drops";` — this is a runtime import of drops.ts from sanity.ts; drops.ts imports sanity.ts as `import type` only, so there is no runtime cycle. Add the re-export `export type { DropCoa } from "./drops";`.
2. `PRODUCT_SUMMARY_PROJECTION` strain sub-projection becomes:
   ```ts
   "strain": strain->{ _id, name, slug, strainType, lineage, heroImage { asset->, alt, crop, hotspot } }
   ```
3. `ProductStrainRef` and `StrainSummary` gain `lineage?: string;` (after `strainType`).
4. `getStrains()` and `getStrain()` projections add `lineage` after `strainType`.
5. Add, next to `Drop`:
   ```ts
   export interface DropStrainDescription {
     _id: string;
     description?: PortableText;
   }
   ```
   and on `Drop`:
   ```ts
     coas: DropCoa[];
     gallery?: SanityImage[];
     // The strain description is needed once per chapter, not once per product,
     // so it is fetched by strain here rather than widened onto
     // PRODUCT_SUMMARY_PROJECTION where every product list would carry it.
     strainDescriptions: DropStrainDescription[];
   ```
6. `getDrop()` projection gains, after the `"retailers"` line:
   ```ts
         "coas": coalesce(coas[defined(@->)]-> ${DROP_COA_PROJECTION}, []),
         gallery[] { asset->, alt, crop, hotspot },
         "strainDescriptions": *[_type == "strain" && _id in ^.products[defined(@->)]->strain._ref] {
           _id, description[] ${PORTABLE_TEXT_PROJECTION}
         }
   ```
   and after `assertDropHasProducts( ... )` in `getDrop()`:
   ```ts
     // Studio's reference validation does not reach API writes, and a COA
     // document can be edited by the OPS publisher after the drop referenced
     // it. Validate every referenced certificate on every build so a drop page
     // cannot render a half-shaped one.
     assertDropCoas( drop.coas );
   ```

- [ ] **Step 7: Type-check and lint**

Run: `yarn lint` and, through the env wrapper, `make -C <worktree> build`-free type check: `CMD='cd /Users/benny/dev/nw-local.com/.worktrees/drop-page-redesign && yarn astro check'`.
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/lib/coa.ts src/lib/drops.ts src/lib/drops.test.ts src/lib/sanity.ts
git commit -m "feat: project and validate drop certificates, lineage and gallery"
```

---

### Task 3: Chapter grouping, manifest and formatting helpers

**Files:**
- Modify: `src/lib/drops.ts`
- Test: `src/lib/drops.test.ts`

**Interfaces:**
- Consumes: `DropCoa`, `ProductSummary`, `SanityImage`, `SanitySlug`, `StrainType`, `PortableText`, `DropStrainDescription` (types).
- Produces:
  ```ts
  export const DROP_CHAPTER_COLORS: readonly string[];           // four hex colours
  export const UNASSIGNED_STRAIN_KEY = "unassigned";
  export const UNASSIGNED_STRAIN_HEADING = "More in this drop";
  export interface DropChapterStrain { key: string; name: string; slug?: SanitySlug; strainType?: StrainType; lineage?: string; heroImage?: SanityImage; description?: PortableText }
  export interface DropChapter { index: number; color: string; anchorId: string; strain: DropChapterStrain; products: ProductSummary[]; available: boolean; coa?: DropCoa }
  export interface DropStrainGrouping { chapters: DropChapter[]; unmatchedCoas: DropCoa[] }
  export interface DropGroupingInput { products: ProductSummary[]; coas: DropCoa[]; strainDescriptions: DropStrainDescription[] }
  export function strainPageUrl( baseUrl: string, slug: SanitySlug ): string;   // `${baseUrl}/strains/${slug.current}/`
  export function groupDropStrains( drop: DropGroupingInput, baseUrl: string ): DropStrainGrouping;
  export function dropCoaManifest( coas: DropCoa[] ): string[];                  // sorted sourceIds
  export function dropCoaHref( sourceId: string ): string;                       // `/coas/${sourceId}/`
  export function formatDropTotalThc( reading: DropCoaReading ): string;        // "29.39% Total THC"
  export const DROP_CHAPTER_STATE_LABELS: { available: "available", soldOut: "soldOut" }  (badge types)
  ```
  `baseUrl` is the site URL with no trailing slash (what `normalizeSiteUrl( requireSiteUrl( Astro.site ) )` returns).

- [ ] **Step 1: Write the failing grouping tests**

Append to `src/lib/drops.test.ts` (add the imports to the existing import line):

```ts
import {
  DROP_CHAPTER_COLORS,
  UNASSIGNED_STRAIN_HEADING,
  UNASSIGNED_STRAIN_KEY,
  assertDropCoa,
  assertDropCoas,
  dropCoaHref,
  dropCoaManifest,
  formatDropTotalThc,
  groupDropStrains,
  strainPageUrl,
} from "./drops.ts";
import type { ProductSummary } from "./sanity";

const BASE_URL = "https://nw-local.com";

function makeStrain( name: string, slug: string ) {
  return { _id: `strain-${slug}`, name, slug: { current: slug }, strainType: "hybrid" as const, lineage: `${name} lineage` };
}

function makeProduct( name: string, strain: ReturnType<typeof makeStrain> | undefined, available: boolean ): ProductSummary {
  return { _id: `product-${name}`, name, slug: { current: name }, category: "flower", available, strain };
}

function makeCoaFor( slug: string, sourceIdSuffix: string ) {
  return {
    ...makeDropCoaFixture(),
    sourceId: `00000000-0000-4000-8000-00000000000${sourceIdSuffix}`,
    strain: { name: slug, url: `${BASE_URL}/strains/${slug}/` },
  };
}

describe( "groupDropStrains", () => {
  const glitterBomb = makeStrain( "Glitter Bomb", "glitter-bomb" );
  const superBoof = makeStrain( "Super Boof", "super-boof" );

  test( "groups products by strain in product order, matches COAs by exact strain url, and attaches descriptions", () => {
    const description = [ { _type: "block", _key: "b1", children: [] } ];
    const grouping = groupDropStrains( {
      products: [
        makeProduct( "GB 3.5", glitterBomb, true ),
        makeProduct( "SB 3.5", superBoof, false ),
        makeProduct( "GB 7", glitterBomb, false ),
      ],
      coas: [ makeCoaFor( "super-boof", "2" ), makeCoaFor( "glitter-bomb", "1" ) ],
      strainDescriptions: [ { _id: glitterBomb._id, description } ],
    }, BASE_URL );

    expect( grouping.chapters.map( chapter => chapter.strain.name ) ).toEqual( [ "Glitter Bomb", "Super Boof" ] );
    expect( grouping.chapters[0].products.map( product => product.name ) ).toEqual( [ "GB 3.5", "GB 7" ] );
    expect( grouping.chapters[0].coa?.sourceId ).toBe( "00000000-0000-4000-8000-000000000001" );
    expect( grouping.chapters[1].coa?.sourceId ).toBe( "00000000-0000-4000-8000-000000000002" );
    expect( grouping.chapters[0].strain.description ).toBe( description );
    expect( grouping.chapters[0].strain.lineage ).toBe( "Glitter Bomb lineage" );
    expect( grouping.chapters[0].anchorId ).toBe( "strain-glitter-bomb" );
    expect( grouping.chapters.map( chapter => chapter.index ) ).toEqual( [ 1, 2 ] );
    expect( grouping.unmatchedCoas ).toEqual( [] );
  });

  test( "availability is any product available; a strain whose products are all unavailable is sold out", () => {
    const grouping = groupDropStrains( {
      products: [ makeProduct( "GB 3.5", glitterBomb, false ), makeProduct( "GB 7", glitterBomb, true ), makeProduct( "SB", superBoof, false ) ],
      coas: [],
      strainDescriptions: [],
    }, BASE_URL );
    expect( grouping.chapters.map( chapter => chapter.available ) ).toEqual( [ true, false ] );
  });

  test( "a COA matched by strain name but not url is unmatched; a trailing-slash difference is a mismatch", () => {
    const wrongUrl = { ...makeCoaFor( "glitter-bomb", "1" ), strain: { name: "Glitter Bomb", url: `${BASE_URL}/strains/glitter-bomb` } };
    const grouping = groupDropStrains( {
      products: [ makeProduct( "GB", glitterBomb, true ) ],
      coas: [ wrongUrl ],
      strainDescriptions: [],
    }, BASE_URL );
    expect( grouping.chapters[0].coa ).toBeUndefined();
    expect( grouping.unmatchedCoas ).toEqual( [ wrongUrl ] );
  });

  test( "a strainless product lands in a trailing unassigned chapter with no lineage or COA", () => {
    const grouping = groupDropStrains( {
      products: [ makeProduct( "Mystery", undefined, true ), makeProduct( "GB", glitterBomb, true ) ],
      coas: [],
      strainDescriptions: [],
    }, BASE_URL );
    expect( grouping.chapters.map( chapter => chapter.strain.key ) ).toEqual( [ glitterBomb._id, UNASSIGNED_STRAIN_KEY ] );
    expect( grouping.chapters[1].strain.name ).toBe( UNASSIGNED_STRAIN_HEADING );
    expect( grouping.chapters[1].anchorId ).toBe( "strain-unassigned" );
    expect( grouping.chapters[1].strain.lineage ).toBeUndefined();
  });

  test( "colors follow chapter position and wrap after four", () => {
    const strains = [ "a", "b", "c", "d", "e" ].map( slug => makeStrain( slug.toUpperCase(), slug ) );
    const grouping = groupDropStrains( {
      products: strains.map( strain => makeProduct( strain.name, strain, true ) ),
      coas: [],
      strainDescriptions: [],
    }, BASE_URL );
    expect( grouping.chapters.map( chapter => chapter.color ) ).toEqual( [ ...DROP_CHAPTER_COLORS, DROP_CHAPTER_COLORS[0] ] );
    expect( DROP_CHAPTER_COLORS ).toHaveLength( 4 );
  });

  test( "throws when two COAs claim the same strain", () => {
    expect( () => groupDropStrains( {
      products: [ makeProduct( "GB", glitterBomb, true ) ],
      coas: [ makeCoaFor( "glitter-bomb", "1" ), makeCoaFor( "glitter-bomb", "2" ) ],
      strainDescriptions: [],
    }, BASE_URL ) ).toThrow( "two certificates claim https://nw-local.com/strains/glitter-bomb/" );
  });
});

describe( "drop helpers", () => {
  test( "strainPageUrl carries the trailing slash the COA publisher writes", () => {
    expect( strainPageUrl( BASE_URL, { current: "super-boof" } ) ).toBe( "https://nw-local.com/strains/super-boof/" );
  });

  test( "dropCoaManifest sorts source ids and does not mutate its input", () => {
    const coas = [ makeCoaFor( "b", "2" ), makeCoaFor( "a", "1" ) ];
    expect( dropCoaManifest( coas ) ).toEqual( [ "00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002" ] );
    expect( coas[0].sourceId ).toBe( "00000000-0000-4000-8000-000000000002" );
  });

  test( "dropCoaHref points at the public certificate route", () => {
    expect( dropCoaHref( DROP_COA_SOURCE_ID ) ).toBe( `/coas/${DROP_COA_SOURCE_ID}/` );
  });

  test( "formatDropTotalThc hugs a percent sign and spaces any other unit", () => {
    expect( formatDropTotalThc( { value: "29.39", unit: "%" } ) ).toBe( "29.39% Total THC" );
    expect( formatDropTotalThc( { value: "293.9", unit: "mg/g" } ) ).toBe( "293.9 mg/g Total THC" );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn vitest run src/lib/drops.test.ts`
Expected: FAIL, `groupDropStrains` is not exported.

- [ ] **Step 3: Implement**

Extend the `import type` line in `drops.ts` to:

```ts
import type {
  DropStatus,
  DropStrainDescription,
  DropSummary,
  PortableText,
  ProductSummary,
  SanityImage,
  SanitySlug,
  StrainType,
} from "./sanity";
```

Append:

```ts
// --- Drop chapters ---
//
// The drop page is built like the buyer sheet: one chapter per strain, each
// with a fixed label colour, its certificate, and its state. Grouping is pure
// so the page, the coas.json manifest and the tests all derive from the same
// function and cannot disagree about which certificate belongs to which strain.

export const DROP_CHAPTER_COLORS: readonly string[] = [ "#00ff88", "#ff5fa2", "#ffb000", "#5ac8ff" ];
export const UNASSIGNED_STRAIN_KEY = "unassigned";
export const UNASSIGNED_STRAIN_HEADING = "More in this drop";
const STRAIN_BASE_PATH = "/strains";
const COA_BASE_PATH = "/coas";
const PERCENT_UNIT = "%";
const TOTAL_THC_SUFFIX = "Total THC";

export interface DropChapterStrain {
  key: string;
  name: string;
  slug?: SanitySlug;
  strainType?: StrainType;
  lineage?: string;
  heroImage?: SanityImage;
  description?: PortableText;
}

export interface DropChapter {
  index: number;
  color: string;
  anchorId: string;
  strain: DropChapterStrain;
  products: ProductSummary[];
  available: boolean;
  coa?: DropCoa;
}

export interface DropStrainGrouping {
  chapters: DropChapter[];
  unmatchedCoas: DropCoa[];
}

export interface DropGroupingInput {
  products: ProductSummary[];
  coas: DropCoa[];
  strainDescriptions: DropStrainDescription[];
}

// The COA publisher in OPS writes strain.url with a trailing slash; the match
// in groupDropStrains is exact, so this is the one place that shape is spelled.
export function strainPageUrl( baseUrl: string, slug: SanitySlug ): string {
  return `${baseUrl}${STRAIN_BASE_PATH}/${slug.current}/`;
}

export function dropCoaHref( sourceId: string ): string {
  return `${COA_BASE_PATH}/${sourceId}/`;
}

export function dropCoaManifest( coas: DropCoa[] ): string[] {
  return coas.map( coa => coa.sourceId ).sort();
}

export function formatDropTotalThc( reading: DropCoaReading ): string {
  const measurement = reading.unit === PERCENT_UNIT
    ? `${reading.value}${PERCENT_UNIT}`
    : `${reading.value} ${reading.unit}`;
  return `${measurement} ${TOTAL_THC_SUFFIX}`;
}

function coasByStrainUrl( coas: DropCoa[] ): Map<string, DropCoa> {
  const byUrl = new Map<string, DropCoa>();
  for( const coa of coas ) {
    if( !coa.strain ) continue;
    if( byUrl.has( coa.strain.url ) ) {
      throw new Error( `two certificates claim ${coa.strain.url}: ${byUrl.get( coa.strain.url )!.sourceId} and ${coa.sourceId}.` );
    }
    byUrl.set( coa.strain.url, coa );
  }
  return byUrl;
}

export function groupDropStrains( drop: DropGroupingInput, baseUrl: string ): DropStrainGrouping {
  const descriptionsByStrainId = new Map(
    drop.strainDescriptions.map( entry => [ entry._id, entry.description ] ),
  );
  const chaptersByKey = new Map<string, Omit<DropChapter, "index" | "color">>();

  for( const product of drop.products ) {
    const key = product.strain?._id ?? UNASSIGNED_STRAIN_KEY;
    const existing = chaptersByKey.get( key );
    if( existing ) {
      existing.products.push( product );
      existing.available = existing.available || product.available === true;
      continue;
    }
    const strain: DropChapterStrain = product.strain
      ? {
        key,
        name: product.strain.name,
        slug: product.strain.slug,
        strainType: product.strain.strainType,
        lineage: product.strain.lineage,
        heroImage: product.strain.heroImage,
        description: descriptionsByStrainId.get( product.strain._id ),
      }
      : { key, name: UNASSIGNED_STRAIN_HEADING };
    chaptersByKey.set( key, {
      anchorId: `strain-${product.strain?.slug.current ?? UNASSIGNED_STRAIN_KEY}`,
      strain,
      products: [ product ],
      available: product.available === true,
    });
  }

  // "unassigned" sorts last so the fallback chapter cannot land between two
  // real strains; the sort is stable, so every other chapter keeps product order.
  const orderedChapters = [ ...chaptersByKey.values() ].sort( ( left, right ) => {
    if( left.strain.key === UNASSIGNED_STRAIN_KEY ) return 1;
    if( right.strain.key === UNASSIGNED_STRAIN_KEY ) return -1;
    return 0;
  });

  const byUrl = coasByStrainUrl( drop.coas );
  const matchedSourceIds = new Set<string>();
  const chapters = orderedChapters.map( ( chapter, position ) => {
    const coa = chapter.strain.slug ? byUrl.get( strainPageUrl( baseUrl, chapter.strain.slug ) ) : undefined;
    if( coa ) matchedSourceIds.add( coa.sourceId );
    return {
      ...chapter,
      index: position + 1,
      color: DROP_CHAPTER_COLORS[ position % DROP_CHAPTER_COLORS.length ],
      coa,
    };
  });

  return {
    chapters,
    unmatchedCoas: drop.coas.filter( coa => !matchedSourceIds.has( coa.sourceId ) ),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn vitest run src/lib/drops.test.ts` → PASS. Run `node scripts/check-drop-lookup.ts` → still OK. Run `yarn lint` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/drops.ts src/lib/drops.test.ts
git commit -m "feat: group drop products into strain chapters with certificates and state"
```

---

### Task 4: Chapter, cover, ribbon and gallery components with styles

**Files:**
- Create: `src/components/DropCover.astro`, `src/components/DropIndexRibbon.astro`, `src/components/DropGallery.astro`, `src/components/DropStrainChapter.astro`
- Modify: `src/styles/global.css` (append a `/* --- Drop page --- */` block after the `.drop-meta` rules, line ~2222 onward)
- Test: `src/components/DropStrainChapter.test.ts` (create) — the Container render assertions only; the checker fixture run is added to this test in Task 6.

**Interfaces:**
- Consumes: `DropChapter`, `dropCoaHref`, `formatDropTotalThc` from `../lib/drops`; `Drop`, `SanityImage` from `../lib/sanity`; `urlFor`; `ProductBadge`, `ProductCard`, `PortableText`; `DATE_LABELS` moves from the page into `DropCover.astro`.
- Produces components with these props:
  - `DropCover`: `{ drop: Pick<Drop, "name" | "status" | "dropDate" | "heroImage"> }`
  - `DropIndexRibbon`: `{ chapters: DropChapter[] }`
  - `DropGallery`: `{ images: SanityImage[]; fallbackAlt: string }` (renders `data-lightbox-index` thumbs; caller renders `ImageLightbox`)
  - `DropStrainChapter`: `{ chapter: DropChapter; chapterCount: number }`
- Produces markup contract (the checker in Task 6 reads exactly these):
  - chapter root: `<section class="drop-chapter" id={anchorId} data-drop-chapter={anchorId} style="--drop-color: …">`
  - lineage (only when present): `<p class="drop-chapter-lineage" data-drop-lineage={lineage}><em>{lineage}</em></p>`
  - COA link (only when present): `<a class="drop-coa-link" data-drop-coa={sourceId} href={dropCoaHref( sourceId )}>Release COA · Pass</a>`
  - state: `<ProductBadge type={available ? "available" : "soldOut"} />` inside `<p class="drop-chapter-state" data-drop-state={available ? "available" : "soldOut"}>`
  - THC: `<p class="drop-chapter-thc" data-drop-thc={coa.totalThc.value}>{formatDropTotalThc( coa.totalThc )}</p>`

- [ ] **Step 1: Write the failing Container test**

Create `src/components/DropStrainChapter.test.ts`:

```ts
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { expect, test } from "vitest";
import type { DropChapter } from "../lib/drops.ts";
import DropStrainChapter from "./DropStrainChapter.astro";

export const CHAPTER_COA_SOURCE_ID = "00000000-0000-4000-8000-000000000001";

export function makeChapterFixture(): DropChapter {
  return {
    index: 1,
    color: "#00ff88",
    anchorId: "strain-glitter-bomb",
    strain: {
      key: "strain-glitter-bomb",
      name: "Glitter Bomb",
      slug: { current: "glitter-bomb" },
      strainType: "hybrid",
      lineage: "Grape Gas #10 × OGKB Blueberry Headband",
    },
    products: [
      { _id: "p1", name: "Glitter Bomb Eighth", slug: { current: "glitter-bomb-eighth" }, category: "flower", weight: "3.5g", available: true },
      { _id: "p2", name: "Glitter Bomb Quarter", slug: { current: "glitter-bomb-quarter" }, category: "flower", weight: "7g", available: false },
    ],
    available: true,
    coa: {
      sourceId: CHAPTER_COA_SOURCE_ID,
      labResultId: "2155470281845367208-18-2026",
      status: "pass",
      publishedAt: "2026-09-01T21:15:30Z",
      totalThc: { value: "29.39", unit: "%" },
      strain: { name: "Glitter Bomb", url: "https://nw-local.com/strains/glitter-bomb/" },
    },
  };
}

export async function renderChapter( chapter: DropChapter ): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString( DropStrainChapter, { props: { chapter, chapterCount: 4 } });
}

test( "renders lineage, COA link, COA-basis THC and the state badge", async () => {
  const html = await renderChapter( makeChapterFixture() );
  expect( html ).toContain( `data-drop-chapter="strain-glitter-bomb"` );
  expect( html ).toContain( `data-drop-lineage="Grape Gas #10 × OGKB Blueberry Headband"` );
  expect( html ).toContain( `data-drop-coa="${CHAPTER_COA_SOURCE_ID}" href="/coas/${CHAPTER_COA_SOURCE_ID}/"` );
  expect( html ).toContain( "Release COA · Pass" );
  expect( html ).toContain( "29.39% Total THC" );
  expect( html ).toContain( `data-drop-state="available"` );
  expect( html ).toContain( "01 / 04" );
  expect( html ).not.toContain( "$" );
});

test( "omits the THC line and COA link when the chapter has no certificate, and reads sold out", async () => {
  const chapter = makeChapterFixture();
  delete chapter.coa;
  chapter.available = false;
  const html = await renderChapter( chapter );
  expect( html ).not.toContain( "Total THC" );
  expect( html ).not.toContain( "data-drop-coa" );
  expect( html ).toContain( `data-drop-state="soldOut"` );
});

test( "no anchor is nested inside a product card", async () => {
  const html = await renderChapter( makeChapterFixture() );
  const cardBodies = html.split( `class="card"` ).slice( 1 ).map( fragment => fragment.split( "</div>\n</div>" )[0] );
  expect( cardBodies.length ).toBeGreaterThan( 0 );
  for( const cardBody of cardBodies ) expect( cardBody ).not.toMatch( /<a\s/ );
});
```

- [ ] **Step 2: Run it to verify it fails**

Run via the env wrapper: `CMD='cd /Users/benny/dev/nw-local.com/.worktrees/drop-page-redesign && yarn vitest run src/components/DropStrainChapter.test.ts'`
Expected: FAIL, cannot resolve `./DropStrainChapter.astro`.

- [ ] **Step 3: Create `DropStrainChapter.astro`**

```astro
---
import PortableText from "./PortableText.astro";
import ProductBadge from "./ProductBadge.astro";
import ProductCard from "./ProductCard.astro";
import type { DropChapter } from "../lib/drops";
import { dropCoaHref, formatDropTotalThc } from "../lib/drops";
import { urlFor } from "../lib/image";
import type { CoaStatus } from "../lib/coa.ts";

interface Props {
  chapter: DropChapter
  chapterCount: number
}

const COA_LINK_PREFIX = "Release COA";
const COA_STATUS_LABELS: Record<CoaStatus, string> = { pass: "Pass", fail: "Fail" };

const { chapter, chapterCount } = Astro.props;
const { strain, products, available, coa } = chapter;
const stateType = available ? "available" : "soldOut";
const pad = ( value: number ) => String( value ).padStart( 2, "0" );
const strainHref = strain.slug ? `/strains/${strain.slug.current}` : undefined;
---

<section class="drop-chapter fade-in" id={chapter.anchorId} data-drop-chapter={chapter.anchorId} style={`--drop-color: ${chapter.color};`}>
  <header class="drop-chapter-header">
    <p class="drop-chapter-number">{pad( chapter.index )} / {pad( chapterCount )}</p>
    <div class="drop-chapter-rule"></div>
    <h2 class="drop-chapter-title">{strainHref ? <a href={strainHref}>{strain.name}</a> : strain.name}</h2>
    {strain.lineage && (
      <p class="drop-chapter-lineage" data-drop-lineage={strain.lineage}><em>{strain.lineage}</em></p>
    )}
  </header>

  <div class="drop-chapter-body">
    <aside class="drop-chapter-facts">
      {coa?.totalThc && (
        <p class="drop-chapter-thc" data-drop-thc={coa.totalThc.value}>{formatDropTotalThc( coa.totalThc )}</p>
      )}
      {coa && (
        <a class="drop-coa-link" data-drop-coa={coa.sourceId} href={dropCoaHref( coa.sourceId )}>{COA_LINK_PREFIX} · {COA_STATUS_LABELS[coa.status]}</a>
      )}
      <p class="drop-chapter-state" data-drop-state={stateType}>
        <ProductBadge type={stateType} />
        {strain.strainType && <ProductBadge type={strain.strainType} />}
      </p>
    </aside>

    <div class="drop-chapter-editorial">
      {strain.heroImage?.asset && (
        <img
          class="drop-chapter-hero"
          src={urlFor( strain.heroImage ).width( 1200 ).height( 900 ).format( "webp" ).url()}
          alt={strain.heroImage.alt ?? strain.name}
          width="1200"
          height="900"
          loading="lazy"
        />
      )}
      {strain.description && <div class="drop-chapter-copy"><PortableText value={strain.description} /></div>}
    </div>
  </div>

  <div class="card-grid drop-chapter-products">
    {products.map( product => (
      <ProductCard {...product} />
    ) )}
  </div>
</section>
```

- [ ] **Step 4: Run the test to verify it passes**

Same command as Step 2. Expected: PASS ×3. If the "no anchor inside a card" split heuristic fails against real ProductCard output, do not loosen the assertion: the strain link in `ProductCard` (`<a href="/strains/…">`) is the anchor it will find. That anchor already exists on main inside `.card`; the rule in the spec covers the chapter's own markup. Ruling: replace the third test's body with a check that the chapter's own COA anchor and title anchor are outside `.card`:
  ```ts
  const firstCard = html.indexOf( `class="card"` );
  expect( html.indexOf( "data-drop-coa" ) ).toBeLessThan( firstCard );
  expect( html.indexOf( `class="drop-chapter-title"` ) ).toBeLessThan( firstCard );
  ```
  and keep the test name `"the chapter's own links sit outside the product cards"`.

- [ ] **Step 5: Create `DropCover.astro`**

```astro
---
import ProductBadge from "./ProductBadge.astro";
import type { Drop, DropStatus } from "../lib/sanity";
import { urlFor } from "../lib/image";
import { formatPostDate } from "../lib/date";

interface Props {
  drop: Pick<Drop, "name" | "status" | "dropDate" | "heroImage">
}

const KICKER = "NW LOCAL · Licensed Washington flower";

// An upcoming drop has not dropped yet, so its label is future tense; available
// and sold out drops already happened, so both read the same past tense label.
const DATE_LABELS: Record<DropStatus, string> = {
  upcoming: "Dropping",
  available: "Dropped",
  soldOut: "Dropped",
};

const { drop } = Astro.props;
---

<header class="drop-cover" data-drop-cover>
  {drop.heroImage?.asset && (
    <img
      class="drop-cover-image"
      src={urlFor( drop.heroImage ).width( 1600 ).height( 900 ).format( "webp" ).url()}
      alt={drop.heroImage.alt ?? drop.name}
      width="1600"
      height="900"
      fetchpriority="high"
    />
  )}
  <div class="drop-cover-scrim"></div>
  <div class="drop-cover-content">
    <p class="drop-kicker">{KICKER}</p>
    <h1 class="drop-cover-title">{drop.name}</h1>
    <p class="drop-cover-meta">
      <span class="product-badge">{DATE_LABELS[drop.status]} <time datetime={drop.dropDate}>{formatPostDate( drop.dropDate )}</time></span>
      <ProductBadge type={drop.status} />
    </p>
  </div>
</header>
```

- [ ] **Step 6: Create `DropIndexRibbon.astro`**

```astro
---
import type { DropChapter } from "../lib/drops";
import { formatDropTotalThc } from "../lib/drops";

interface Props {
  chapters: DropChapter[]
}

const { chapters } = Astro.props;
---

<nav class="drop-index" aria-label="Strains in this drop">
  {chapters.map( chapter => (
    <a class="drop-index-cell" href={`#${chapter.anchorId}`} style={`--drop-color: ${chapter.color};`}>
      <span class="drop-index-name">{chapter.strain.name}</span>
      {chapter.coa?.totalThc && <span class="drop-index-thc">{formatDropTotalThc( chapter.coa.totalThc )}</span>}
    </a>
  ) )}
</nav>
```

- [ ] **Step 7: Create `DropGallery.astro`**

```astro
---
import type { SanityImage } from "../lib/sanity";
import { urlFor } from "../lib/image";

interface Props {
  images: SanityImage[]
  fallbackAlt: string
}

const { images, fallbackAlt } = Astro.props;
---

{images.length > 0 && (
  <section class="drop-gallery fade-in" data-drop-gallery aria-label="Release photography">
    {images.map( ( image, index ) => (
      <img
        class="drop-gallery-thumb"
        src={urlFor( image ).width( 600 ).height( 450 ).format( "webp" ).url()}
        alt={image.alt ?? fallbackAlt}
        width="600"
        height="450"
        data-lightbox-index={index}
        loading="lazy"
      />
    ) )}
  </section>
)}
```

- [ ] **Step 8: Add the styles**

Append to `src/styles/global.css` after the `.drop-meta` block:

```css
/* --- Drop page ---
 *
 * The drop page is the buyer sheet in the site's skin: a cover, a four-colour
 * index, then one chapter per strain. --drop-color is set per chapter and per
 * index cell by the component, so the palette lives in drops.ts and not here. */

.drop-cover {
  position: relative;
  overflow: hidden;
  border-radius: 8px;
  margin-bottom: 2rem;
  aspect-ratio: 16 / 9;
  background: var(--bg-surface);
}

.drop-cover-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.drop-cover-scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(var(--bg-rgb), 0.92) 0%, rgba(var(--bg-rgb), 0.35) 55%, rgba(var(--bg-rgb), 0) 100%);
}

.drop-cover-content {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 1.5rem;
}

.drop-kicker {
  margin: 0 0 0.5rem;
  color: var(--accent);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.drop-cover-title {
  margin: 0 0 0.75rem;
  text-transform: uppercase;
}

.drop-cover-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
}

.drop-index {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;
  margin-bottom: 2.5rem;
}

.drop-index-cell {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem 0 0;
  border-top: 4px solid var(--drop-color);
  color: var(--text-primary);
  text-decoration: none;
}

.drop-index-cell:hover .drop-index-name {
  color: var(--drop-color);
}

.drop-index-name {
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.drop-index-thc {
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.drop-gallery {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
  margin: 2.5rem 0 3rem;
}

.drop-gallery-thumb {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: 8px;
  cursor: pointer;
  transition: transform 0.2s ease, filter 0.2s ease;
}

.drop-gallery-thumb:hover {
  transform: scale(1.03);
  filter: brightness(1.1);
}

.drop-chapter {
  margin-bottom: 4rem;
}

.drop-chapter-header {
  margin-bottom: 1.5rem;
}

.drop-chapter-number {
  margin: 0 0 0.5rem;
  color: var(--drop-color);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.13em;
}

.drop-chapter-rule {
  width: 60px;
  height: 4px;
  margin-bottom: 0.75rem;
  background: var(--drop-color);
}

.drop-chapter-title {
  margin: 0;
  text-transform: uppercase;
}

.drop-chapter-title a {
  color: var(--text-primary);
  text-decoration: none;
}

.drop-chapter-title a:hover {
  color: var(--drop-color);
}

.drop-chapter-lineage {
  margin: 0.5rem 0 0;
  color: var(--text-emphasis);
}

.drop-chapter-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 2rem;
  margin-bottom: 2rem;
}

.drop-chapter-facts {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  align-items: flex-start;
}

.drop-chapter-thc {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 800;
  color: var(--text-primary);
}

.drop-coa-link {
  font-weight: 700;
  color: var(--drop-color);
}

.drop-chapter-state {
  display: flex;
  gap: 0.5rem;
  margin: 0;
}

.drop-chapter-editorial {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1.5rem;
}

.drop-chapter-hero {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: 8px;
}

.drop-unmatched {
  margin-bottom: 3rem;
}

.drop-unmatched ul {
  padding-left: 1.25rem;
}

@media (min-width: 720px) {
  .drop-chapter-body {
    grid-template-columns: 220px minmax(0, 1fr);
  }

  .drop-chapter-editorial {
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    align-items: start;
  }
}

@media (max-width: 719px) {
  .drop-index {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .drop-gallery {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
```

- [ ] **Step 9: Lint and type check, then commit**

Run: `yarn lint`; via the env wrapper `CMD='cd … && yarn astro check'`. Expected: clean.

```bash
git add src/components/DropCover.astro src/components/DropIndexRibbon.astro src/components/DropGallery.astro src/components/DropStrainChapter.astro src/components/DropStrainChapter.test.ts src/styles/global.css
git commit -m "feat: drop page cover, index ribbon, gallery and strain chapter components"
```

---

### Task 5: Page assembly, manifest endpoint, index card and strain lineage

**Files:**
- Modify: `src/pages/drops/[...slug].astro` (rewrite the template and the grouping frontmatter)
- Create: `src/pages/drops/[...slug]/coas.json.ts`
- Modify: `src/components/DropCard.astro`
- Modify: `src/pages/strains/[...slug].astro` (lineage line under the hero badges)
- Modify: `src/styles/global.css` (`.strain-lineage`, `.drop-card-cover`)

**Interfaces:**
- Consumes: everything from Tasks 2–4.
- Produces: page root `<article class="drop-page" data-drop-page={slug}>`; static file `dist/drops/<slug>/coas.json` holding a JSON array of sorted source ids.

- [ ] **Step 1: Rewrite the drop page**

Replace `src/pages/drops/[...slug].astro` with:

```astro
---
import Layout from "../../layouts/Layout.astro";
import DropCover from "../../components/DropCover.astro";
import DropGallery from "../../components/DropGallery.astro";
import DropIndexRibbon from "../../components/DropIndexRibbon.astro";
import DropStrainChapter from "../../components/DropStrainChapter.astro";
import ImageLightbox from "../../components/ImageLightbox.astro";
import PortableText from "../../components/PortableText.astro";
import RetailerCard from "../../components/RetailerCard.astro";
import SectionHeading from "../../components/SectionHeading.astro";
import { getDrops, getDrop } from "../../lib/sanity";
import type { DropPortal } from "../../lib/sanity";
import { DROP_BASE_PATH, dropCoaHref, groupDropStrains } from "../../lib/drops";
import { urlFor } from "../../lib/image";
import { formatPostDate } from "../../lib/date";
import {
  buildBreadcrumbList,
  normalizeSiteUrl,
  type StructuredData,
  requireSiteUrl,
} from "../../lib/jsonld";

export async function getStaticPaths() {
  const drops = await getDrops() ?? [];
  return drops.map( drop => ({
    params: { slug: drop.slug.current },
  }) );
}

const UNMATCHED_HEADING = "Certificates of analysis";
const RETAILERS_HEADING = "Where to find it";

const { slug } = Astro.params;
const drop = await getDrop( slug! );
if( !drop ) return Astro.redirect( DROP_BASE_PATH );

// Keyed by DropPortal rather than string, so the map is exhaustive by
// construction and a lotPortal value always has a label.
const PORTAL_LABELS: Record<DropPortal, string> = {
  bamboo: "Bamboo",
  cultivera: "Cultivera",
};

// A lot carries a Bamboo id and a Cultivera id, so an unqualified number is
// ambiguous. Render the identifier only when we can say which portal it is from.
const lotLabel = drop.lotIdentifier && drop.lotPortal
  ? `${PORTAL_LABELS[drop.lotPortal]} lot ${drop.lotIdentifier}`
  : null;

const baseUrl = normalizeSiteUrl( requireSiteUrl( Astro.site ) );
const { chapters, unmatchedCoas } = groupDropStrains( drop, baseUrl );

const gallery = drop.gallery ?? [];
const lightboxImages = gallery.map( image => ({
  // Width only, deliberately: constraining height as well would letterbox
  // portrait shots. Unconstrained, each image keeps its natural ratio.
  url: urlFor( image ).width( 1600 ).format( "webp" ).url(),
  alt: image.alt ?? drop.name,
}) );

const ogImage = drop.heroImage?.asset
  ? urlFor( drop.heroImage ).width( 1200 ).height( 630 ).format( "jpg" ).url()
  : undefined;

const structuredData: StructuredData[] = [
  buildBreadcrumbList( [
    { name: "Home", url: `${baseUrl}/` },
    { name: "Drops", url: `${baseUrl}${DROP_BASE_PATH}/` },
    { name: drop.name, url: `${baseUrl}${DROP_BASE_PATH}/${drop.slug.current}/` },
  ] ),
];
---

<Layout title={drop.name} description={drop.description} ogImage={ogImage} structuredData={structuredData}>
  <article class="drop-page" data-drop-page={drop.slug.current}>
    <DropCover drop={drop} />

    <DropIndexRibbon chapters={chapters} />

    {( lotLabel || drop.harvestedAt ) && (
      <dl class="drop-meta">
        {lotLabel && (
          <>
            <dt>Lot</dt>
            <dd>{lotLabel}</dd>
          </>
        )}
        {drop.harvestedAt && (
          <>
            <dt>Harvested</dt>
            <dd><time datetime={drop.harvestedAt}>{formatPostDate( drop.harvestedAt )}</time></dd>
          </>
        )}
      </dl>
    )}

    {drop.body && <PortableText value={drop.body} />}

    <DropGallery images={gallery} fallbackAlt={drop.name} />
    <ImageLightbox images={lightboxImages} />

    {chapters.map( chapter => (
      <DropStrainChapter chapter={chapter} chapterCount={chapters.length} />
    ) )}

    {unmatchedCoas.length > 0 && (
      <section class="drop-unmatched fade-in">
        <SectionHeading title={UNMATCHED_HEADING} />
        <ul>
          {unmatchedCoas.map( coa => (
            <li>
              <a class="drop-coa-link" data-drop-coa={coa.sourceId} href={dropCoaHref( coa.sourceId )}>
                {coa.strain ? coa.strain.name : coa.labResultId} · Release COA · {coa.status === "pass" ? "Pass" : "Fail"}
              </a>
            </li>
          ) )}
        </ul>
      </section>
    )}

    {drop.retailers && drop.retailers.length > 0 && (
      <section class="fade-in">
        <SectionHeading title={RETAILERS_HEADING} />
        <div class="card-grid">
          {drop.retailers.map( retailer => (
            <RetailerCard {...retailer} />
          ) )}
        </div>
      </section>
    )}
  </article>
</Layout>
```

- [ ] **Step 2: Create the manifest endpoint**

Create `src/pages/drops/[...slug]/coas.json.ts`:

```ts
import type { APIRoute } from "astro";
import { dropCoaManifest } from "../../../lib/drops";
import { getDrop, getDrops } from "../../../lib/sanity";

// Emits dist/drops/<slug>/coas.json: the sorted source ids of every
// certificate the drop references, from the same getDrop() + validation the
// page renders from. scripts/check-drop-build.py compares the built page's
// data-drop-coa links against this file, so the checker needs no Sanity
// access and the two cannot disagree by construction. Not linked from any
// page; carries nothing but the ids.
export async function getStaticPaths() {
  const drops = await getDrops() ?? [];
  return drops.map( drop => ({ params: { slug: drop.slug.current } }) );
}

export const GET: APIRoute = async ({ params }) => {
  if( !params.slug ) throw new Error( "coas.json route requires a drop slug." );
  const drop = await getDrop( params.slug );
  if( !drop ) throw new Error( `coas.json: no drop with slug ${params.slug}.` );
  return new Response( JSON.stringify( dropCoaManifest( drop.coas ) ), {
    headers: { "Content-Type": "application/json" },
  });
};
```

- [ ] **Step 3: Give the index card the cover treatment**

Replace the body of `src/components/DropCard.astro` (keep the frontmatter):

```astro
<a href={dropHref( slug )} class="card drop-card">
  <div class="card-image drop-card-cover">
    {heroImage?.asset && (
      <img
        src={urlFor( heroImage ).width( 600 ).height( 338 ).format( "webp" ).url()}
        alt={heroImage.alt ?? name}
        width="600"
        height="338"
        loading="lazy"
      />
    )}
    <div class="drop-card-scrim"></div>
    <h3 class="card-title drop-card-title">{name}</h3>
  </div>
  <div class="card-body">
    <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;">
      <ProductBadge type={status} />
      <span class="product-badge">{liveProductCount === 1 ? "1 product" : `${liveProductCount} products`}</span>
    </div>
    <p>{description}</p>
    <p class="drop-card-date"><time datetime={dropDate}>{formatPostDate( dropDate )}</time></p>
  </div>
</a>
```

Append to `global.css` in the Drop page block:

```css
.drop-card-cover {
  position: relative;
  aspect-ratio: 16 / 9;
}

.drop-card-scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(var(--bg-rgb), 0.9) 0%, rgba(var(--bg-rgb), 0) 60%);
}

.drop-card-title {
  position: absolute;
  left: 1rem;
  right: 1rem;
  bottom: 0.75rem;
  margin: 0;
  text-transform: uppercase;
}

.strain-lineage {
  margin: 0.5rem 0 0;
  color: var(--text-emphasis);
}
```

- [ ] **Step 4: Show lineage on the strain page**

In `src/pages/strains/[...slug].astro`, inside `<Hero>` after the closing `</div>` of the badge row (line 76), add:

```astro
    {strain.lineage && <p class="strain-lineage" data-drop-lineage={strain.lineage}><em>{strain.lineage}</em></p>}
```

- [ ] **Step 5: Build and eyeball the output**

Via the env wrapper: `CMD='make -C /Users/benny/dev/nw-local.com/.worktrees/drop-page-redesign build'`. Expected: the build succeeds; `dist/drops/september-2026-flower-drop/index.html` and `dist/drops/september-2026-flower-drop/coas.json` exist. Before the data steps land, `coas.json` is `[]` and the page has four chapters with no COA links or lineage; that is correct for this stage. Confirm with:

```bash
python3 - <<'EOF'
from pathlib import Path
page = Path("dist/drops/september-2026-flower-drop/index.html").read_text()
print("chapters", page.count('data-drop-chapter='), "coa links", page.count('data-drop-coa='), "gallery", page.count('data-drop-gallery'))
print(Path("dist/drops/september-2026-flower-drop/coas.json").read_text())
EOF
```

Expected: `chapters 4 coa links 0 gallery 0` and `[]`.

- [ ] **Step 6: Lint, type check, commit**

`yarn lint`; env-wrapped `yarn astro check`. Then:

```bash
git add "src/pages/drops/[...slug].astro" "src/pages/drops/[...slug]/coas.json.ts" src/components/DropCard.astro "src/pages/strains/[...slug].astro" src/styles/global.css
git commit -m "feat: rebuild the drop page as cover, index, gallery and strain chapters"
```

---

### Task 6: Build checker, regression fixtures, and wiring

**Files:**
- Create: `scripts/check-drop-build.py`, `scripts/test-check-drop-build.py`
- Create fixtures: `scripts/fixtures/drop-page.html`, `scripts/fixtures/drop-coas.json`, `scripts/fixtures/drop-page-missing-coa-link.html`, `scripts/fixtures/drop-page-unlisted-coa-link.html`, `scripts/fixtures/drop-page-hidden-lineage.html`, `scripts/fixtures/drop-page-foreign-image.html`
- Modify: `src/components/DropStrainChapter.test.ts` (add the checker fixture run)
- Modify: `Makefile`, `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes the markup contract from Task 4 and the manifest from Task 5.
- Produces: `python3 scripts/check-drop-build.py [--fixture] [root]`. Build mode: for every `root/drops/<slug>/index.html` (not `root/drops/index.html`). Fixture mode: `root/drop-page.html` + `root/drop-coas.json`, expected page slug `september-fixture`. Both modes require `root/coas/<id>/index.html` for every linked id.

**Ruling recorded from the spec:** the spec says "every chapter section carries a lineage element". Requiring that in `deploy.yml` would fail the code deploy that has to land *before* the lineage backfill (Section 5 step 2). The checker therefore verifies that every `data-drop-lineage` attribute is rendered visibly (attribute value appears in the element's text) and that at least one chapter exists; the "chapter without lineage" fixture becomes "chapter whose lineage attribute is not visible". Once the backfill lands, the live verification step (Task 7) confirms all four chapters carry lineage.

- [ ] **Step 1: Write the good fixture and manifest**

`scripts/fixtures/drop-coas.json`:

```json
["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"]
```

`scripts/fixtures/drop-page.html`:

```html
<main>
<article class="drop-page" data-drop-page="september-fixture">
  <header class="drop-cover" data-drop-cover>
    <img class="drop-cover-image" src="https://cdn.sanity.io/images/example/production/cover-1600x900.webp" alt="Cover">
    <h1 class="drop-cover-title">September Fixture</h1>
  </header>
  <nav class="drop-index">
    <a class="drop-index-cell" href="#strain-glitter-bomb">Glitter Bomb</a>
    <a class="drop-index-cell" href="#strain-super-boof">Super Boof</a>
  </nav>
  <section class="drop-gallery" data-drop-gallery>
    <img class="drop-gallery-thumb" src="https://cdn.sanity.io/images/example/production/one-600x450.webp" alt="Jars">
  </section>
  <section class="drop-chapter" id="strain-glitter-bomb" data-drop-chapter="strain-glitter-bomb">
    <h2 class="drop-chapter-title"><a href="/strains/glitter-bomb">Glitter Bomb</a></h2>
    <p class="drop-chapter-lineage" data-drop-lineage="Grape Gas #10 × OGKB Blueberry Headband"><em>Grape Gas #10 × OGKB Blueberry Headband</em></p>
    <p class="drop-chapter-thc" data-drop-thc="29.39">29.39% Total THC</p>
    <a class="drop-coa-link" data-drop-coa="00000000-0000-4000-8000-000000000001" href="/coas/00000000-0000-4000-8000-000000000001/">Release COA · Pass</a>
    <p class="drop-chapter-state" data-drop-state="available"><span class="product-badge">Available Now</span></p>
    <img class="drop-chapter-hero" src="https://cdn.sanity.io/images/example/production/gb-1200x900.webp" alt="Glitter Bomb">
  </section>
  <section class="drop-chapter" id="strain-super-boof" data-drop-chapter="strain-super-boof">
    <h2 class="drop-chapter-title"><a href="/strains/super-boof">Super Boof</a></h2>
    <p class="drop-chapter-lineage" data-drop-lineage="Black Cherry Punch × Tropicana Cookies"><em>Black Cherry Punch × Tropicana Cookies</em></p>
    <a class="drop-coa-link" data-drop-coa="00000000-0000-4000-8000-000000000002" href="/coas/00000000-0000-4000-8000-000000000002/">Release COA · Pass</a>
    <p class="drop-chapter-state" data-drop-state="soldOut"><span class="product-badge">Sold Out</span></p>
  </section>
</article>
</main>
```

Malformed fixtures, each a copy of `drop-page.html` with one change:
- `drop-page-missing-coa-link.html`: delete the Super Boof `<a class="drop-coa-link" …>` line.
- `drop-page-unlisted-coa-link.html`: change the Super Boof link's id (both the attribute and the href) to `00000000-0000-4000-8000-000000000003`.
- `drop-page-hidden-lineage.html`: in the Glitter Bomb chapter, replace the `<em>…</em>` text with `<em>Lineage on request</em>`, keeping the attribute value.
- `drop-page-foreign-image.html`: change the gallery `<img src>` to `https://example.com/one.webp`.

- [ ] **Step 2: Write the failing regression test**

Create `scripts/test-check-drop-build.py`:

```python
#!/usr/bin/env python3
"""Regression-test scripts/check-drop-build.py against malformed drop pages."""

from pathlib import Path
import shutil
import subprocess
import tempfile


REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
CHECKER = REPOSITORY_ROOT / "scripts" / "check-drop-build.py"
FIXTURES = REPOSITORY_ROOT / "scripts" / "fixtures"
GOOD_PAGE = FIXTURES / "drop-page.html"
MANIFEST = FIXTURES / "drop-coas.json"
FIXTURE_PAGE_NAME = "drop-page.html"
FIXTURE_MANIFEST_NAME = "drop-coas.json"
COA_ROUTE_DIRECTORY = "coas"
LISTED_COA_IDS = (
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
)
CASES = (
    ("drop-page.html", 0, "drop build contract OK: 1 page(s) verified."),
    ("drop-page-missing-coa-link.html", 1, "page links certificates ['00000000-0000-4000-8000-000000000001'] but coas.json lists ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002']"),
    ("drop-page-unlisted-coa-link.html", 1, "coas.json lists ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002']"),
    ("drop-page-hidden-lineage.html", 1, "lineage is not visible: 'Grape Gas #10 × OGKB Blueberry Headband'"),
    ("drop-page-foreign-image.html", 1, "image is not served from cdn.sanity.io: 'https://example.com/one.webp'"),
)


def run_case(page_name: str, expected_exit: int, expected_text: str) -> None:
    with tempfile.TemporaryDirectory(prefix="check-drop-build-") as temporary_directory:
        fixture_root = Path(temporary_directory)
        shutil.copy2(FIXTURES / page_name, fixture_root / FIXTURE_PAGE_NAME)
        shutil.copy2(MANIFEST, fixture_root / FIXTURE_MANIFEST_NAME)
        for coa_id in LISTED_COA_IDS:
            coa_page = fixture_root / COA_ROUTE_DIRECTORY / coa_id / "index.html"
            coa_page.parent.mkdir(parents=True)
            coa_page.write_text("<main></main>", encoding="utf-8")
        result = subprocess.run(
            ["python3", str(CHECKER), "--fixture", str(fixture_root)],
            check=False,
            capture_output=True,
            text=True,
        )
    output = result.stdout + result.stderr
    if result.returncode != expected_exit or expected_text not in output:
        raise AssertionError(
            f"{page_name}: expected exit {expected_exit} mentioning {expected_text!r}, "
            f"got exit {result.returncode}: {output!r}"
        )
    print(f"check-drop-build regression holds for {page_name}")


for case in CASES:
    run_case(*case)


with tempfile.TemporaryDirectory(prefix="check-drop-build-missing-coa-") as temporary_directory:
    fixture_root = Path(temporary_directory)
    shutil.copy2(GOOD_PAGE, fixture_root / FIXTURE_PAGE_NAME)
    shutil.copy2(MANIFEST, fixture_root / FIXTURE_MANIFEST_NAME)
    result = subprocess.run(
        ["python3", str(CHECKER), "--fixture", str(fixture_root)],
        check=False,
        capture_output=True,
        text=True,
    )
if result.returncode != 1 or "certificate page does not exist: coas/00000000-0000-4000-8000-000000000001/index.html" not in result.stderr:
    raise AssertionError(f"missing certificate page: got exit {result.returncode}: {result.stderr!r}")
print("check-drop-build missing certificate page regression holds")


with tempfile.TemporaryDirectory(prefix="check-drop-build-empty-") as temporary_directory:
    result = subprocess.run(
        ["python3", str(CHECKER), temporary_directory],
        check=False,
        capture_output=True,
        text=True,
    )
if result.returncode != 0 or result.stdout.strip() != "drop build contract OK: no generated drop pages to verify.":
    raise AssertionError(f"empty build root: got exit {result.returncode}: {result.stdout!r} {result.stderr!r}")
print("check-drop-build empty build-root regression holds")
```

Make it executable: `chmod +x scripts/test-check-drop-build.py`.

- [ ] **Step 3: Run it to verify it fails**

Run: `python3 scripts/test-check-drop-build.py`
Expected: fails because `scripts/check-drop-build.py` does not exist (python reports "can't open file").

- [ ] **Step 4: Write the checker**

Create `scripts/check-drop-build.py` (`chmod +x`):

```python
#!/usr/bin/env python3
"""Verify the built public drop pages against their own certificate manifests.

Build mode checks every generated /drops/<slug>/ page against the
/drops/<slug>/coas.json the same build emitted from the same validated data:
the page's certificate links must equal the manifest, every linked
certificate page must exist, every declared lineage must be visible, and
every image inside the page must come from Sanity's CDN. Fixture mode runs the
same checks on one committed page so the checker can prove it rejects a page
that quietly lost a certificate link.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from html.parser import HTMLParser
import json
from pathlib import Path
import sys
from urllib.parse import urlsplit


DROP_ROUTE_DIRECTORY = "drops"
COA_ROUTE_DIRECTORY = "coas"
PAGE_NAME = "index.html"
MANIFEST_NAME = "coas.json"
FIXTURE_PAGE_NAME = "drop-page.html"
FIXTURE_MANIFEST_NAME = "drop-coas.json"
FIXTURE_MODE_FLAG = "--fixture"
EXPECTED_FIXTURE_SLUG = "september-fixture"
PAGE_ATTRIBUTE = "data-drop-page"
CHAPTER_ATTRIBUTE = "data-drop-chapter"
LINEAGE_ATTRIBUTE = "data-drop-lineage"
COA_ATTRIBUTE = "data-drop-coa"
SANITY_CDN_HOST = "cdn.sanity.io"
COMMITTED_FIXTURE_ROOT = Path(__file__).resolve().parent / "fixtures"


@dataclass
class Element:
    name: str
    attributes: dict[str, str]
    parent: Element | None = None
    text_parts: list[str] = field(default_factory=list)

    @property
    def text(self) -> str:
        return " ".join("".join(self.text_parts).split())


class DropPageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.elements: list[Element] = []
        self.stack: list[Element] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = {key: value or "" for key, value in attrs}
        element = Element(tag, attributes, self.stack[-1] if self.stack else None)
        self.elements.append(element)
        self.stack.append(element)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_endtag(self, tag: str) -> None:
        for stack_index in range(len(self.stack) - 1, -1, -1):
            if self.stack[stack_index].name == tag:
                del self.stack[stack_index:]
                return

    def handle_data(self, data: str) -> None:
        for element in self.stack:
            element.text_parts.append(data)


def is_descendant_of(element: Element, ancestor: Element) -> bool:
    parent = element.parent
    while parent:
        if parent is ancestor:
            return True
        parent = parent.parent
    return False


def parse_page(page: Path) -> DropPageParser:
    parser = DropPageParser()
    parser.feed(page.read_text(encoding="utf-8"))
    parser.close()
    return parser


def read_manifest(manifest: Path) -> list[str] | str:
    try:
        listed = json.loads(manifest.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        return f"cannot read manifest {manifest.name}: {error}"
    if not isinstance(listed, list) or any(not isinstance(item, str) for item in listed):
        return f"manifest {manifest.name} must be a JSON array of strings"
    return sorted(listed)


def check_page(page: Path, manifest: Path, build_root: Path, expected_slug: str) -> list[str]:
    failures: list[str] = []
    parser = parse_page(page)

    page_roots = [element for element in parser.elements if PAGE_ATTRIBUTE in element.attributes]
    if len(page_roots) != 1:
        return [f"expected one drop page root, found {len(page_roots)}"]
    page_root = page_roots[0]
    if page_root.attributes[PAGE_ATTRIBUTE] != expected_slug:
        failures.append(
            f"drop page slug {page_root.attributes[PAGE_ATTRIBUTE]!r} does not match route {expected_slug!r}"
        )
    inside = [element for element in parser.elements if is_descendant_of(element, page_root)]

    chapters = [element for element in inside if CHAPTER_ATTRIBUTE in element.attributes]
    if not chapters:
        failures.append("drop page has no strain chapters")
    for chapter in chapters:
        if chapter.attributes.get("id") != chapter.attributes[CHAPTER_ATTRIBUTE]:
            failures.append(f"chapter id does not match its anchor: {chapter.attributes[CHAPTER_ATTRIBUTE]!r}")

    for lineage in [element for element in inside if LINEAGE_ATTRIBUTE in element.attributes]:
        declared = lineage.attributes[LINEAGE_ATTRIBUTE]
        if not declared:
            failures.append("lineage attribute is empty")
        elif declared not in lineage.text:
            failures.append(f"lineage is not visible: {declared!r}")

    coa_links = [element for element in inside if COA_ATTRIBUTE in element.attributes]
    linked_ids: list[str] = []
    for link in coa_links:
        coa_id = link.attributes[COA_ATTRIBUTE]
        linked_ids.append(coa_id)
        if link.name != "a":
            failures.append(f"certificate marker is not an anchor: {coa_id!r}")
        if link.attributes.get("href") != f"/{COA_ROUTE_DIRECTORY}/{coa_id}/":
            failures.append(f"certificate link href does not point at its certificate page: {coa_id!r}")
        if not link.text:
            failures.append(f"certificate link has no visible text: {coa_id!r}")
        coa_page = build_root / COA_ROUTE_DIRECTORY / coa_id / PAGE_NAME
        if not coa_page.is_file():
            failures.append(f"certificate page does not exist: {coa_page.relative_to(build_root)}")

    listed = read_manifest(manifest)
    if isinstance(listed, str):
        failures.append(listed)
    elif sorted(linked_ids) != listed:
        failures.append(f"page links certificates {sorted(linked_ids)} but {MANIFEST_NAME} lists {listed}")

    for image in [element for element in inside if element.name == "img"]:
        source = image.attributes.get("src", "")
        if urlsplit(source).netloc != SANITY_CDN_HOST:
            failures.append(f"image is not served from {SANITY_CDN_HOST}: {source!r}")

    return failures


def pages_for_root(build_root: Path, fixture_mode: bool) -> list[tuple[Path, Path, str]]:
    if fixture_mode:
        page = build_root / FIXTURE_PAGE_NAME
        return [(page, build_root / FIXTURE_MANIFEST_NAME, EXPECTED_FIXTURE_SLUG)] if page.is_file() else []
    return [
        (page, page.parent / MANIFEST_NAME, page.parent.name)
        for page in sorted((build_root / DROP_ROUTE_DIRECTORY).glob(f"*/{PAGE_NAME}"))
    ]


def main() -> int:
    arguments = sys.argv[1:]
    explicit_fixture_mode = arguments[:1] == [FIXTURE_MODE_FLAG]
    if explicit_fixture_mode:
        arguments = arguments[1:]
    if len(arguments) > 1:
        print("usage: check-drop-build.py [--fixture] [build-root]", file=sys.stderr)
        return 2

    build_root = Path(arguments[0] if arguments else "dist")
    if not build_root.is_dir():
        print(f"check-drop-build: no such directory: {build_root}", file=sys.stderr)
        return 2

    fixture_mode = explicit_fixture_mode or build_root.resolve() == COMMITTED_FIXTURE_ROOT
    pages = pages_for_root(build_root, fixture_mode)
    if not pages:
        if fixture_mode:
            print(f"check-drop-build: no fixture page found under {build_root}", file=sys.stderr)
            return 2
        print("drop build contract OK: no generated drop pages to verify.")
        return 0

    failures: list[str] = []
    for page, manifest, expected_slug in pages:
        relative_page = page.relative_to(build_root)
        failures.extend(
            f"{relative_page}: {failure}"
            for failure in check_page(page, manifest, build_root, expected_slug)
        )

    if failures:
        for failure in failures:
            print(f"FAIL: {failure}", file=sys.stderr)
        return 1

    print(f"drop build contract OK: {len(pages)} page(s) verified.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 5: Run the regression test to verify it passes**

Run: `python3 scripts/test-check-drop-build.py`
Expected: seven "regression holds" lines. If a message string differs, fix the checker's message, not the expectation, unless the expectation has a typo.

- [ ] **Step 6: Run the checker against the real build**

Via the env wrapper: `CMD='make -C … build'` then `python3 scripts/check-drop-build.py dist` in the worktree.
Expected: `drop build contract OK: 1 page(s) verified.` (pre-backfill: zero links on the page and `[]` in the manifest agree).

- [ ] **Step 7: Bind the Container test to the checker**

Append to `src/components/DropStrainChapter.test.ts`:

```ts
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach } from "vitest";

const temporaryDirectories: string[] = [];

afterEach( async () => {
  await Promise.all( temporaryDirectories.splice( 0 ).map( directory => rm( directory, { recursive: true }) ) );
});

test( "the rendered chapter passes the built-page contract", async () => {
  const chapter = makeChapterFixture();
  const body = await renderChapter( chapter );
  const fixtureRoot = await mkdtemp( join( tmpdir(), "drop-chapter-" ) );
  temporaryDirectories.push( fixtureRoot );
  await mkdir( join( fixtureRoot, "coas", CHAPTER_COA_SOURCE_ID ), { recursive: true });
  await writeFile( join( fixtureRoot, "coas", CHAPTER_COA_SOURCE_ID, "index.html" ), "<main></main>", "utf8" );
  await writeFile( join( fixtureRoot, "drop-coas.json" ), JSON.stringify( [ CHAPTER_COA_SOURCE_ID ] ), "utf8" );
  await writeFile(
    join( fixtureRoot, "drop-page.html" ),
    `<main><article class="drop-page" data-drop-page="september-fixture">${body}</article></main>`,
    "utf8",
  );

  const result = spawnSync(
    "python3",
    [ "scripts/check-drop-build.py", "--fixture", fixtureRoot ],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  expect( result.status, result.stderr ).toBe( 0 );
});
```

Move the new imports to the top of the file with the existing ones (ESLint's import ordering). Run the Container test through the env wrapper. Expected: PASS ×4. Note the ProductCard in the fixture has no image, so the only `<img>` is the chapter hero, which the fixture omits; that is fine.

- [ ] **Step 8: Wire Makefile, CI and deploy**

`Makefile`:
- Add to `.PHONY`: `test-drops check-drop-build test-check-drop-build`.
- After the `test-coa` target add:
  ```make
  test-drops: ## Test drop chapter grouping, certificate validation, and real Astro chapter rendering
  	@yarn vitest run src/lib/drops.test.ts src/components/DropStrainChapter.test.ts

  check-drop-build: build ## Verify every built drop page against its own certificate manifest
  	@python3 scripts/check-drop-build.py dist

  test-check-drop-build: ## Regression-test malformed drop page fixtures
  	@python3 scripts/test-check-drop-build.py
  ```
- In the `check:` prerequisite list insert `test-drops` after `test-coa`, `test-check-drop-build` after `test-check-coa-build`, and `check-drop-build` after `check-coa-build`.

`.github/workflows/ci.yml`, `typecheck` job: change the COA step to

```yaml
      - name: Test public COA and drop contracts and Astro rendering
        run: make check-coa-contract test-coa test-drops test-check-drop-build
        env:
          SANITY_PROJECT_ID: ${{ secrets.SANITY_PROJECT_ID }}
          SANITY_DATASET: ${{ secrets.SANITY_DATASET }}
          SANITY_API_TOKEN: ${{ secrets.SANITY_API_TOKEN }}
```

(The chapter test renders `ProductCard`, which builds image URLs through the Sanity client, so the module needs the env vars even though the test never fetches.)

`.github/workflows/audit.yml`, `validate-content-style` job, after the glossary build step:

```yaml
      # A drop page can lose a certificate link, a lineage, or a Sanity-hosted
      # image through a content publish alone. The build emits its own
      # manifest, so the checker needs no secrets.
      - name: Regression-test malformed drop build fixtures
        run: python3 scripts/test-check-drop-build.py
      - name: Check drop build contracts
        run: ./scripts/check-drop-build.py dist
```

`.github/workflows/deploy.yml`, after the glossary step:

```yaml
      # Same reasoning as the glossary check above: drop.coas, strain.lineage
      # and drop.gallery all change through Sanity with no pull request.
      - name: Check drop build contracts
        run: ./scripts/check-drop-build.py dist
```

- [ ] **Step 9: Run the full aggregate**

Via the env wrapper: `CMD='make -C /Users/benny/dev/nw-local.com/.worktrees/drop-page-redesign check'`.
Expected: every target green, ending with the Studio checks and `yarn astro check` clean. Fix anything red before committing.

- [ ] **Step 10: Commit**

```bash
git add scripts/check-drop-build.py scripts/test-check-drop-build.py scripts/fixtures/drop-page.html scripts/fixtures/drop-coas.json scripts/fixtures/drop-page-missing-coa-link.html scripts/fixtures/drop-page-unlisted-coa-link.html scripts/fixtures/drop-page-hidden-lineage.html scripts/fixtures/drop-page-foreign-image.html src/components/DropStrainChapter.test.ts Makefile .github/workflows/ci.yml .github/workflows/audit.yml .github/workflows/deploy.yml
git commit -m "ci: verify built drop pages against their certificate manifests"
```

---

### Task 7: Post-deploy data steps (controller-run, after the PR merges and deploys)

This task is not dispatched to an implementer subagent. It mutates production content and runs only after the route from Tasks 1–6 is live, in this order. Every write goes through a script file run under the main checkout's env wrapper; nothing is typed into Studio by hand.

**Files:**
- Create in the scratchpad: `backfill_lineage.py`, `patch_september_drop.py`, `verify_drop_page.py`

- [ ] **Step 1: Deploy the Studio schema**

`make -C /Users/benny/dev/nw-local.com deploy-studio` (after `git -C /Users/benny/dev/nw-local.com pull --ff-only`).

- [ ] **Step 2: Backfill `strain.lineage`**

Read the four lineages from the Ops launch snapshot with the existing read-only probe pattern (`probe_drop_projection.py` output `drop_projection.json` already holds them under each strain). Then `backfill_lineage.py`:

```python
import json, os, sys, urllib.request
project, dataset, token = os.environ["SANITY_PROJECT_ID"], os.environ["SANITY_DATASET"], os.environ["SANITY_API_TOKEN"]
lineages = json.load(open(sys.argv[1]))  # {"glitter-bomb": "…", "grape-chimera": "…", "sour-berry-boogie": "…", "super-boof": "…"}
query = '*[_type == "strain" && slug.current in $slugs]{_id, "slug": slug.current}'
url = f"https://{project}.api.sanity.io/v2026-04-14/data/query/{dataset}"
request = urllib.request.Request(url, data=json.dumps({"query": query, "params": {"slugs": list(lineages)}}).encode(), headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
strains = json.load(urllib.request.urlopen(request))["result"]
assert {strain["slug"] for strain in strains} == set(lineages), strains
mutations = [{"patch": {"id": strain["_id"], "set": {"lineage": lineages[strain["slug"]]}}} for strain in strains]
request = urllib.request.Request(f"https://{project}.api.sanity.io/v2026-04-14/data/mutate/{dataset}", data=json.dumps({"mutations": mutations}).encode(), headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
print(json.load(urllib.request.urlopen(request)))
```

Run via `make -C /Users/benny/dev/nw-local.com -f Makefile -f $SP/publish.mk run-with-env CMD='python3 $SP/backfill_lineage.py $SP/lineages.json'`.

- [ ] **Step 3: Patch the September drop**

`patch_september_drop.py` uploads the six gallery images (content-addressed, via `POST /assets/images/<dataset>` — reuse the upload helper from `publish_drop_site.py`) in the order and with the alt text in the spec, then issues one `patch` on `drop` `september-2026-flower-drop` that sets `coas` (four `{_type:"reference", _ref:"coa.<id>", _key:<id>}` entries with the ids from the spec), sets `gallery` (six `{_type:"image", _key, asset:{_type:"reference",_ref}, alt}` entries), and sets `body` to only its first block (fetch the current body, keep `body[0]`, assert it is the paragraph beginning "Four distinct cultivars"). Print the mutation result and the resulting document ids.

- [ ] **Step 4: Verify live**

Wait for the webhook-triggered deploy to finish (`gh run list --workflow deploy.yml -R aud-eos/nw-local.com -L 1`). Then `verify_drop_page.py` fetches `https://nw-local.com/drops/september-2026-flower-drop/` and `…/coas.json` and asserts: exactly four `data-drop-coa` anchors equal to the manifest; each `/coas/<id>/` responds 200 and its `data-coa-reading-value` for "Total THC (calculated)" equals the drop page's `data-drop-thc` for that chapter; four `data-drop-lineage` attributes, each visible; six `data-drop-gallery` images; no `$` character in the page's `<article data-drop-page>`.

- [ ] **Step 5: Record the outcome**

Report the live URL and the verification output to the user. Update the `publishing-a-drop-to-the-website` memory with the new fields the drop publish now needs (`coas`, `gallery`, `strain.lineage`).

---

## Self-review

- **Spec coverage.** Content model → Task 1. Data layer (projections, `assertDropCoa`, `groupDropStrains`, manifest endpoint) → Tasks 2, 3, 5. Page sections 1–8 → Tasks 4, 5 (cover, ribbon, body, gallery, chapters, unmatched, retailers, DropCard). Styling → Tasks 4, 5. Guards (vitest, Container test, checker + fixtures, Makefile/CI/deploy wiring) → Tasks 3, 4, 6. Data steps → Task 7. Strain page lineage → Task 5.
- **Deviations recorded.** (1) Lineage-on-every-chapter is verified live in Task 7, not in the build checker, because the code deploy precedes the backfill; the checker verifies visibility of every declared lineage instead. (2) The chapter test's "no anchor in a card" assertion checks the chapter's own links sit outside cards, because `ProductCard` already carries a strain link on main. (3) `ProductBadge` wording is "Available Now" / "Sold Out" (site-wide labels) rather than the spec's shorthand.
- **Type consistency.** `DropChapter { index, color, anchorId, strain, products, available, coa? }` is used identically in Tasks 3, 4, 6. `dropCoaHref( id )` = `/coas/<id>/` in Task 3 and in the checker's href assertion in Task 6. Manifest is a bare JSON array in Task 5 and read as such in Task 6. `formatDropTotalThc` output "29.39% Total THC" matches the Task 4 test and the Task 6 fixture.
