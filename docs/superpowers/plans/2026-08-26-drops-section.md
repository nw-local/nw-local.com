# Drops Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Drops section to nw-local.com: a Sanity `drop` document type for limited release batches, an index and detail route under `/drops`, and drop awareness on the nav, homepage, strain pages and product cards.

**Architecture:** A drop is a dated release bundling products from one or more harvests. It stores `products[]` only; the strain list is derived from `products[]->strain`. Fetching lives in `src/lib/sanity.ts` and deriving lives in a new pure module `src/lib/drops.ts`, which is the only piece with real logic and therefore the only piece verifiable without a network call. Cross-surface "is this in a drop?" questions are answered by two lookup maps built once per route file from a single `getDrops()` fetch.

**Tech Stack:** Astro 6 (SSG, strict TypeScript), Sanity CMS, yarn, GitHub Actions. No test framework: verification is `yarn astro check`, `make build` page counts, `grep -o` assertions against `dist/`, and one committed Node script in CI.

**Spec:** `docs/superpowers/specs/2026-08-26-drops-section-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **Root repo code style:** spaces inside parens, `function name( argument )` and `if( condition )`. Double quotes, semicolons. ESLint enforces this; `make format` rewrites tight-paren code automatically.
- **`studio/` is a different project with a different style:** no semicolons, single quotes, `bracketSpacing: true` (so `options: { hotspot: true }`), `printWidth: 100`, and **tight** parens (`(rule) => rule.required()`). The root ESLint config ignores `studio/**`, so `make format` never touches it. Verify with `cd studio && yarn format:check`.
- **No TypeScript `as` assertions.** Use type guards, narrowing, or `satisfies`.
- **Descriptive variable names.** No single-character identifiers anywhere, including callback parameters.
- **No em dashes in any visitor-facing copy**, including Studio `description` hints, which are copy templates editors imitate. En dashes in numeric ranges are correct and stay.
- **US spelling everywhere a reader can see it**, including image `alt` text. `make check-content-style` fails the build on a list of British spellings.
- **Nothing inside a `.card` may be an anchor** when the card itself is an `<a class="card">`. `DropCard` and `StrainCard` are anchors; `ProductCard` and `RetailerCard` are plain `<div>`s and may contain links.
- **Every image projection must select `crop, hotspot`** alongside `asset->` and `alt`, or the editor's hotspot is silently discarded and `urlFor()` falls back to a center crop.
- **Astro preserves template whitespace, unlike JSX.** Hug expression braces tightly against surrounding tags: `<h1>{expr}</h1>`, never spread across lines.
- **Count occurrences with `grep -o pattern file | wc -l`, never `grep -c`.** Astro minifies each page onto a single line, so `grep -c` returns 1 regardless of how many matches the page holds.
- **`src/lib/drops.ts` must import from `src/lib/sanity.ts` using `import type` only.** A value import would pull in the Sanity client and its module-level env var assertions, and the CI check runs the module under bare `node` with no `.env` loaded. Verified: Node erases `import type` entirely.
- **Baseline before any change on this branch: `make build` reports 86 pages, `yarn astro check` reports 0 errors.**

---

### Task 1: The `drop` document type

**Files:**
- Create: `studio/schemaTypes/drop.ts`
- Modify: `studio/schemaTypes/index.ts`
- Modify: `docs/content-model.md`
- Modify: `CLAUDE.md` (Sanity Content Model table)

**Interfaces:**
- Consumes: nothing.
- Produces: a Sanity document type named `drop` with fields `name`, `slug`, `description`, `status` (`upcoming` | `available` | `soldOut`), `dropDate`, `heroImage`, `lotIdentifier`, `lotPortal` (`bamboo` | `cultivera`), `harvestedAt`, `products` (references to `product`), `retailers` (references to `retailer`), `body`. Task 3 queries exactly these field names.

- [ ] **Step 1: Create the schema file**

Create `studio/schemaTypes/drop.ts`. Note the Studio style: no semicolons, single quotes, tight parens.

```ts
import { defineField, defineType } from 'sanity'

export const dropType = defineType({
  name: 'drop',
  title: 'Drop',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      description: 'The release name, for example "Fall Harvest 2026".',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: { source: 'name', maxLength: 96 },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'string',
      description: 'SEO excerpt. Max 160 characters.',
      validation: (rule) => rule.required().max(160),
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      description:
        'Set this by hand. Sold Out is the one fact no automatic check can observe, so the site is only as current as this field.',
      options: {
        list: [
          { title: 'Upcoming', value: 'upcoming' },
          { title: 'Available', value: 'available' },
          { title: 'Sold Out', value: 'soldOut' },
        ],
        layout: 'radio',
      },
      initialValue: 'upcoming',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'dropDate',
      title: 'Drop Date',
      type: 'date',
      description: 'Release date. Newest drops sort to the top of the index.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'heroImage',
      title: 'Hero Image',
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
    }),
    defineField({
      name: 'lotIdentifier',
      title: 'Lot Identifier',
      type: 'string',
      description: 'The identifier printed on the label, for example "24-0812".',
    }),
    defineField({
      name: 'lotPortal',
      title: 'Lot Portal',
      type: 'string',
      description:
        'Which portal the lot identifier came from. A lot can carry a Bamboo id and a Cultivera id, so an unqualified number is ambiguous.',
      options: {
        list: [
          { title: 'Bamboo', value: 'bamboo' },
          { title: 'Cultivera', value: 'cultivera' },
        ],
        layout: 'radio',
      },
    }),
    defineField({
      name: 'harvestedAt',
      title: 'Harvested At',
      type: 'date',
    }),
    defineField({
      name: 'products',
      title: 'Products',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'product' }] }],
      description:
        'The SKUs in this batch. Strains are derived from these, so there is no separate strain list to keep in sync.',
      validation: (rule) => rule.required().min(1).unique(),
    }),
    defineField({
      name: 'retailers',
      title: 'Retailers',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'retailer' }] }],
      description: 'Shops stocking this drop.',
      validation: (rule) => rule.unique(),
    }),
    defineField({
      name: 'body',
      title: 'Body',
      type: 'blockContent',
    }),
  ],
  preview: {
    select: { title: 'name', subtitle: 'status', media: 'heroImage' },
  },
})
```

- [ ] **Step 2: Register the type**

In `studio/schemaTypes/index.ts`, add the import in alphabetical position (after `blogPost`, before `glossaryTerm`) and the entry in the `schemaTypes` array in the same position:

```ts
import { dropType } from './drop'
```

```ts
  blogPostType,
  dropType,
  glossaryTermType,
```

- [ ] **Step 3: Verify the Studio checks pass**

Run: `cd studio && yarn typecheck && yarn lint && yarn format:check`
Expected: all three pass. If `format:check` fails, run `yarn format` in `studio/` and re-run. Do **not** run `make format` for this: the root ESLint config ignores `studio/**` and will not touch the file.

- [ ] **Step 4: Document the type**

Add a row to the Sanity Content Model table in `CLAUDE.md`, after the `product` row:

```markdown
| `drop` | Limited release batches: a dated release bundling products from one or more harvests, with an editor-set status |
```

Add the matching entry to `docs/content-model.md`, following whatever structure that file already uses for `product`. Read the file first and match its shape rather than inventing a new one.

- [ ] **Step 5: Commit**

```bash
git add studio/schemaTypes/drop.ts studio/schemaTypes/index.ts CLAUDE.md docs/content-model.md
git commit -m "feat(studio): add the drop document type"
```

---

### Task 2: `src/lib/drops.ts` and its CI check

This is the only task with a real test cycle, because it is the only code that is pure. Write the check first, watch it fail, then implement.

**Execution order:** this task runs AFTER Task 3, which defines the `DropStatus`, `DropSummary` and `SanitySlug` types it imports. The plan numbers it 2 because the pure module is the conceptual heart of the change; the dependency runs the other way.

**Files:**
- Create: `src/lib/drops.ts`
- Create: `scripts/check-drop-lookup.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `DropStatus`, `DropSummary`, `SanitySlug` types from `src/lib/sanity.ts`, all defined by Task 3, which runs first.
- Produces:
  - `DROP_BASE_PATH: string`
  - `dropHref( slug: SanitySlug ): string`
  - `interface DropRef { _id: string; name: string; slug: SanitySlug; status: DropStatus }`
  - `interface DropLookup { byProductId: Map<string, DropRef>; byStrainId: Map<string, DropRef> }`
  - `compareDropStrength( left: DropSummary, right: DropSummary ): number`
  - `buildDropLookup( drops: DropSummary[] ): DropLookup`

Tasks 4 through 7 use every one of these names.

- [ ] **Step 1: Write the failing check**

Create `scripts/check-drop-lookup.ts`. This is the test. It runs under bare `node`, which strips types and erases `import type`, so it must import `drops.ts` with an explicit `.ts` extension.

```ts
#!/usr/bin/env node
/**
 * Verify the buildDropLookup collision rule.
 *
 * When one product or strain belongs to several drops, the lookup keeps the
 * drop with the strongest status, tie broken by the later dropDate. A Map
 * silently keeps whichever entry was written last, so without this check the
 * answer would depend on the order Sanity happened to return rows in, and a
 * strain in both a live batch and a sold out old one could badge as sold out.
 *
 * Both orderings of the same two drops are asserted deliberately. A naive
 * last-write-wins implementation passes one of them by luck.
 *
 * This runs under bare node with no .env loaded, which is why src/lib/drops.ts
 * must import from src/lib/sanity.ts with `import type` only: a value import
 * would pull in the Sanity client and throw on the missing env vars.
 */

import { buildDropLookup, type DropRef } from "../src/lib/drops.ts";
import type { DropSummary } from "../src/lib/sanity.ts";

function makeDrop(
  name: string,
  status: DropSummary["status"],
  dropDate: string,
): DropSummary {
  return {
    _id: `drop-${name}`,
    name,
    // SanitySlug is { current: string } and nothing else. Adding a _type here
    // is an excess property error, not harmless extra data.
    slug: { current: name },
    description: `${name} description`,
    status,
    dropDate,
    productIds: [ "product-1" ],
    strainIds: [ "strain-1" ],
  };
}

const failures: string[] = [];

function expectWinner( label: string, actual: DropRef | undefined, expectedName: string ) {
  if( actual?.name !== expectedName ) {
    failures.push( `${label}: expected "${expectedName}", got "${actual?.name ?? "nothing"}"` );
  }
}

const soldOutDrop = makeDrop( "old-sold-out", "soldOut", "2026-01-01" );
const availableDrop = makeDrop( "new-available", "available", "2026-08-01" );

for( const [ label, drops ] of [
  [ "sold out listed first", [ soldOutDrop, availableDrop ] ],
  [ "available listed first", [ availableDrop, soldOutDrop ] ],
] satisfies [ string, DropSummary[] ][] ) {
  const lookup = buildDropLookup( drops );
  expectWinner( `${label}, byProductId`, lookup.byProductId.get( "product-1" ), "new-available" );
  expectWinner( `${label}, byStrainId`, lookup.byStrainId.get( "strain-1" ), "new-available" );
}

const olderUpcoming = makeDrop( "older-upcoming", "upcoming", "2026-02-01" );
const newerUpcoming = makeDrop( "newer-upcoming", "upcoming", "2026-09-01" );
const sameStatusLookup = buildDropLookup( [ newerUpcoming, olderUpcoming ] );
expectWinner(
  "same status ties break on the later dropDate",
  sameStatusLookup.byProductId.get( "product-1" ),
  "newer-upcoming",
);

const emptyLookup = buildDropLookup( [] );
if( emptyLookup.byProductId.size !== 0 || emptyLookup.byStrainId.size !== 0 ) {
  failures.push( "an empty drop list must produce empty maps" );
}

if( failures.length > 0 ) {
  console.error( "buildDropLookup collision rule violated:" );
  for( const failure of failures ) console.error( `  - ${failure}` );
  process.exit( 1 );
}

console.log( "buildDropLookup collision rule holds" );
```

- [ ] **Step 2: Run the check to verify it fails**

Run: `node scripts/check-drop-lookup.ts`
Expected: FAIL with a module resolution error, because `src/lib/drops.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `src/lib/drops.ts`:

```ts
import type { DropStatus, DropSummary, SanitySlug } from "./sanity";

export const DROP_BASE_PATH = "/drops";

export interface DropRef {
  _id: string;
  name: string;
  slug: SanitySlug;
  status: DropStatus;
}

export interface DropLookup {
  byProductId: Map<string, DropRef>;
  byStrainId: Map<string, DropRef>;
}

// Higher wins. A drop a visitor can buy from outranks one they cannot, which is
// why this is a rank rather than the declaration order of DropStatus.
const STATUS_RANK: Record<DropStatus, number> = {
  available: 3,
  upcoming: 2,
  soldOut: 1,
};

export function dropHref( slug: SanitySlug ): string {
  return `${DROP_BASE_PATH}/${slug.current}`;
}

/**
 * Sorts the strongest drop first: status rank, then the later dropDate.
 *
 * Used for two things deliberately, because they are the same question asked
 * twice: which drop wins a lookup collision, and what order the index renders
 * in. dropDate is an ISO date string, so localeCompare orders it correctly
 * without parsing.
 */
export function compareDropStrength( left: DropSummary, right: DropSummary ): number {
  const rankDelta = STATUS_RANK[right.status] - STATUS_RANK[left.status];
  if( rankDelta !== 0 ) return rankDelta;
  return right.dropDate.localeCompare( left.dropDate );
}

function toDropRef( drop: DropSummary ): DropRef {
  return { _id: drop._id, name: drop.name, slug: drop.slug, status: drop.status };
}

export function buildDropLookup( drops: DropSummary[] ): DropLookup {
  const strongestByProductId = new Map<string, DropSummary>();
  const strongestByStrainId = new Map<string, DropSummary>();

  function claim( index: Map<string, DropSummary>, key: string, candidate: DropSummary ) {
    // Falsy keys come from a dangling reference whose target was deleted in
    // Sanity. Indexing them would collide every such product under one entry.
    if( !key ) return;
    const incumbent = index.get( key );
    if( !incumbent || compareDropStrength( candidate, incumbent ) < 0 ) index.set( key, candidate );
  }

  for( const drop of drops ) {
    for( const productId of drop.productIds ) claim( strongestByProductId, productId, drop );
    for( const strainId of drop.strainIds ) claim( strongestByStrainId, strainId, drop );
  }

  return {
    byProductId: new Map(
      [ ...strongestByProductId ].map( ( [ key, drop ] ) => [ key, toDropRef( drop ) ] ),
    ),
    byStrainId: new Map(
      [ ...strongestByStrainId ].map( ( [ key, drop ] ) => [ key, toDropRef( drop ) ] ),
    ),
  };
}
```

- [ ] **Step 4: Run the check to verify it passes**

Run: `node scripts/check-drop-lookup.ts`
Expected: `buildDropLookup collision rule holds`, exit code 0.

If it fails with `Missing SANITY_PROJECT_ID env var`, the import on line 1 of `drops.ts` is a value import rather than `import type`. Fix it there; do not load `.env` in the script.

- [ ] **Step 5: Wire the check into CI**

In `.github/workflows/ci.yml`, add a job alongside the existing `typecheck` job. Match the existing jobs' checkout and setup-node steps exactly by copying them from the `typecheck` job.

```yaml
  drop-lookup:
    name: Drop lookup rule
    runs-on: ubuntu-latest
    steps:
      # Copy the checkout and setup-node steps from the typecheck job verbatim.
      # No yarn install: the script imports one dependency-free module and runs
      # under node's built-in type stripping.
      - name: Check the buildDropLookup collision rule
        run: node scripts/check-drop-lookup.ts
```

- [ ] **Step 6: Verify lint and types**

Run: `make format && yarn lint && yarn astro check`
Expected: lint clean, `astro check` reports 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/drops.ts scripts/check-drop-lookup.ts .github/workflows/ci.yml
git commit -m "feat: derive drop lookups, and check the collision rule in CI"
```

---

### Task 3: Drop queries in `src/lib/sanity.ts`

**Files:**
- Modify: `src/lib/sanity.ts` (add a `// --- Drops ---` section after the Products section, which ends at the `getProductsByStrain` function)

**Interfaces:**
- Consumes: `SanitySlug`, `SanityImage`, `PortableText`, `ProductSummary`, `Retailer`, `PORTABLE_TEXT_PROJECTION` (all already in the file).
- Produces: `DropStatus`, `DropPortal`, `DropSummary`, `Drop`, `getDrops()`, `getDrop( slug )`. Tasks 2 and 4 through 7 consume these.

- [ ] **Step 1: Add the types and queries**

Insert after `getProductsByStrain` and before the `// --- Authors ---` comment:

```ts
// --- Drops ---

export type DropStatus = "upcoming" | "available" | "soldOut";
export type DropPortal = "bamboo" | "cultivera";

export interface DropSummary {
  _id: string;
  name: string;
  slug: SanitySlug;
  description: string;
  status: DropStatus;
  dropDate: string;
  heroImage?: SanityImage;
  // Carried on the summary so one fetch serves both the index cards and the
  // lookup maps in drops.ts. Two separate queries could disagree; one cannot.
  productIds: string[];
  strainIds: string[];
}

export interface Drop extends DropSummary {
  lotIdentifier?: string;
  lotPortal?: DropPortal;
  harvestedAt?: string;
  body?: PortableText;
  products: ProductSummary[];
  retailers?: Retailer[];
}

const DROP_SUMMARY_PROJECTION = `{
  _id, name, slug, description, status, dropDate,
  heroImage { asset->, alt, crop, hotspot },
  "productIds": coalesce(products[]._ref, []),
  "strainIds": coalesce(products[]->strain._ref, [])
}`;

// A drop with no products is a batch with nothing in it. Studio's
// rule.required() stops a human clicking Publish and does nothing about API
// writes, which is how blogPost.author nearly shipped without a byline in #34.
// Failing the deploy is the intended outcome: the alternative is a page that
// renders an empty batch and looks fine.
function assertDropHasProducts( name: string, id: string, count: number ) {
  if( count > 0 ) return;
  throw new Error(
    `Drop "${name}" (${id}) has no products. Add at least one product to it in Sanity, or unpublish the drop.`,
  );
}

export async function getDrops() {
  const drops = await sanityClient.fetch<DropSummary[]>(
    `*[_type == "drop"] | order(dropDate desc) ${DROP_SUMMARY_PROJECTION}`,
  );
  for( const drop of drops ) {
    assertDropHasProducts( drop.name, drop._id, drop.productIds.length );
  }
  return drops;
}

export async function getDrop( slug: string ) {
  const drop = await sanityClient.fetch<Drop | null>(
    `*[_type == "drop" && slug.current == $slug][0] {
      _id, name, slug, description, status, dropDate,
      heroImage { asset->, alt, crop, hotspot },
      lotIdentifier, lotPortal, harvestedAt,
      "productIds": coalesce(products[]._ref, []),
      "strainIds": coalesce(products[]->strain._ref, []),
      body[] ${PORTABLE_TEXT_PROJECTION},
      "products": products[]-> {
        _id, name, slug, category, weight, available,
        image { asset->, alt, crop, hotspot },
        "strain": strain->{ _id, name, slug, strainType, heroImage { asset->, alt, crop, hotspot } }
      },
      "retailers": retailers[]-> {
        _id, name, slug, address, city, state, zip,
        lat, lng, website, phone, email,
        logo { asset->, alt },
        featured,
        productsAvailable[]->{ _id, name, slug, category }
      }
    }`,
    { slug },
  );

  if( !drop ) return null;

  // getDrops() checks the raw refs; this checks what survived dereferencing.
  // The two differ: products[]._ref still lists a reference whose target has
  // been deleted, and that entry arrives here as null.
  assertDropHasProducts( drop.name, drop._id, drop.products.length );
  return drop;
}
```

- [ ] **Step 2: Verify the projection asked for the crop**

Run: `grep -o 'image { asset->, alt, crop, hotspot }' src/lib/sanity.ts | wc -l`
Expected: a count two higher than before this task (one in `DROP_SUMMARY_PROJECTION` is `heroImage`, so count `heroImage {` separately if the numbers look off). The point of the check is that no drop image projection is spelled `image { asset->, alt }`.

Run: `grep -n 'asset->' src/lib/sanity.ts | grep -v 'crop, hotspot' | grep -v 'logo {'`
Expected: no output other than pre-existing lines you did not add. `logo { asset->, alt }` is intentionally excluded, since retailer logos are rendered unconstrained.

- [ ] **Step 3: Verify types and the pure check still pass**

Run: `yarn astro check && node scripts/check-drop-lookup.ts`
Expected: 0 errors, and the collision rule holds.

- [ ] **Step 4: Verify the build is unchanged**

Run: `make build 2>&1 | tail -3`
Expected: still 86 pages. Nothing renders drops yet, so the count must not move. A different number here means something else changed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sanity.ts
git commit -m "feat: fetch drops, and fail the build on a drop with no products"
```

---

### Task 4: `DropCard` and the status badges

**Files:**
- Create: `src/components/DropCard.astro`
- Modify: `src/components/ProductBadge.astro`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: `DropSummary` from `src/lib/sanity.ts`, `dropHref` from `src/lib/drops.ts`, `formatPostDate` from `src/lib/date.ts`, `urlFor` from `src/lib/image.ts`.
- Produces: `DropCard.astro`, taking `DropSummary` as its `Props`. Tasks 5 and 7 render it.

- [ ] **Step 1: Add the status labels to ProductBadge**

In `src/components/ProductBadge.astro`, add three entries to the `LABELS` map, after `other`:

```ts
  upcoming: "Upcoming",
  available: "Available Now",
  soldOut: "Sold Out",
```

Reusing this component rather than creating a `DropBadge` is deliberate: the two would differ only in their dictionary.

- [ ] **Step 2: Create the card**

Create `src/components/DropCard.astro`. This is an `<a class="card">`, so the card anchor invariant binds: no anchors inside it. The status badge is a `<span>` via `ProductBadge`, and strain names are plain text.

```astro
---
import { urlFor } from "../lib/image";
import ProductBadge from "./ProductBadge.astro";
import { dropHref } from "../lib/drops";
import { formatPostDate } from "../lib/date";
import type { DropSummary } from "../lib/sanity";

type Props = DropSummary;

const { name, slug, description, status, dropDate, heroImage, productIds } = Astro.props;

const productCount = productIds.length;
---

<a href={dropHref( slug )} class="card">
  <div class="card-image">
    {heroImage?.asset && (
      <img
        src={urlFor( heroImage ).width( 600 ).height( 375 ).format( "webp" ).url()}
        alt={heroImage.alt ?? name}
        width="600"
        height="375"
        loading="lazy"
      />
    )}
  </div>
  <div class="card-body">
    <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;">
      <ProductBadge type={status} />
      <span class="product-badge">{productCount === 1 ? "1 product" : `${productCount} products`}</span>
    </div>
    <h3 class="card-title">{name}</h3>
    <p>{description}</p>
    <p class="drop-card-date"><time datetime={dropDate}>{formatPostDate( dropDate )}</time></p>
  </div>
</a>
```

`formatPostDate` renders "August 4, 2026", which is what a release date wants. It is reused rather than reimplemented, and it pins formatting to UTC deliberately: dates are formatted at build time, so without that pin the CI runner's timezone would decide whether a drop reads as the 4th or the 3rd.

- [ ] **Step 3: Style the status badges**

In `src/styles/global.css`, find the existing `.product-badge[data-type=...]` rules and add three alongside them, matching their shape. Only `available` gets `--accent`; the other two use the muted badge treatment already defined for neutral badges, because accent is reserved for emphasis and three glowing badges in one grid spend it on nothing.

Add a `.drop-card-date` rule using `--text-secondary`. Do not leave it unstyled and assume it inherits: article prose inside `.portable-text` renders at `#888888`, not white, and an element that sets no color of its own lands at exactly the brightness of the text around it. Set the value explicitly.

**The print block must stay last in `global.css`.** A media query contributes no specificity, so every rule in it ties with its screen counterpart and wins only on source order. If you added rules after it, move them above it.

- [ ] **Step 4: Verify**

Run: `make format && yarn lint && yarn astro check`
Expected: lint clean, 0 type errors.

Run: `tail -40 src/styles/global.css | grep -c "@media print"`
Expected: 1. If 0, the print block is no longer at the end of the file.

- [ ] **Step 5: Commit**

```bash
git add src/components/DropCard.astro src/components/ProductBadge.astro src/styles/global.css src/lib/date.ts
git commit -m "feat: add the drop card and status badges"
```

---

### Task 5: The `/drops` index page

**Files:**
- Create: `src/pages/drops/index.astro`

**Interfaces:**
- Consumes: `getDrops` from `src/lib/sanity.ts`, `compareDropStrength` from `src/lib/drops.ts`, `DropCard`, `Hero`, `FilterBar`, `Layout`.
- Produces: the route `/drops`.

- [ ] **Step 1: Create the page**

```astro
---
import Layout from "../../layouts/Layout.astro";
import Hero from "../../components/Hero.astro";
import DropCard from "../../components/DropCard.astro";
import FilterBar from "../../components/FilterBar.astro";
import { getDrops } from "../../lib/sanity";
import { compareDropStrength } from "../../lib/drops";

// compareDropStrength orders by status rank then dropDate desc, which is the
// same question the lookup maps ask. Available drops lead, so the page opens on
// what a visitor can actually buy.
const drops = ( await getDrops() ?? [] ).sort( compareDropStrength );

const STATUS_FILTERS = [
  { value: "available", label: "Available" },
  { value: "upcoming", label: "Upcoming" },
  { value: "soldOut", label: "Sold Out" },
];
---

<Layout title="Drops" description="Limited release batches from Northwest Local Cannabis. See what is available now, what is coming, and what has sold out.">
  <Hero title="Drops" subtitle="Limited release batches, while they last." />

  <FilterBar filters={STATUS_FILTERS} filterAttribute="data-status" />

  <div class="card-grid">
    {drops.map( drop => (
      <div data-filter-item data-status={drop.status}>
        <DropCard {...drop} />
      </div>
    ) )}
  </div>

  {drops.length === 0 && (
    <p style="text-align:center;margin-top:2rem;">No drops yet. Check back soon.</p>
  )}
</Layout>
```

Note `filterAttribute="data-status"`: `FilterBar` takes this prop precisely so it is not hardcoded to categories, and the wrapper `div` must carry the matching `data-status` attribute for the client script to read.

- [ ] **Step 2: Verify the page count moved by exactly one**

Run: `make build 2>&1 | tail -3`
Expected: **87 pages**, up from the 86 baseline. There are no drop documents in Sanity yet, so the index is the only new page. A count other than 87 means the route matched more than intended.

- [ ] **Step 3: Verify the empty state actually rendered**

Run: `grep -o "No drops yet" dist/drops/index.html | wc -l`
Expected: 1.

Use `grep -o … | wc -l`, not `grep -c`: Astro minifies each page onto one line, so `grep -c` returns 1 whether the string appears once or forty times.

- [ ] **Step 4: Verify types and lint**

Run: `make format && yarn lint && yarn astro check`
Expected: lint clean, 0 type errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/drops/index.astro
git commit -m "feat: add the drops index page"
```

---

### Task 6: The `/drops/<slug>` detail page

**Files:**
- Create: `src/pages/drops/[...slug].astro`

**Interfaces:**
- Consumes: `getDrops`, `getDrop`, `ProductSummary` from `src/lib/sanity.ts`; `buildBreadcrumbList`, `normalizeSiteUrl`, `requireSiteUrl`, `StructuredData` from `src/lib/jsonld.ts`; `DROP_BASE_PATH` from `src/lib/drops.ts`; `PortableText`, `ProductCard`, `RetailerCard`, `SectionHeading`, `ProductBadge`, `Hero`, `Layout` components; `urlFor` from `src/lib/image.ts`.
- Produces: the route `/drops/<slug>`.

- [ ] **Step 1: Read the model page first**

Read `src/pages/strains/[...slug].astro` end to end before writing this. It is the closest analogue: same `getStaticPaths` shape, same redirect-on-missing guard, same structured data assembly, same `ogImage` construction. Match its structure rather than inventing a new one.

- [ ] **Step 2: Create the page**

```astro
---
import Layout from "../../layouts/Layout.astro";
import Hero from "../../components/Hero.astro";
import PortableText from "../../components/PortableText.astro";
import ProductBadge from "../../components/ProductBadge.astro";
import ProductCard from "../../components/ProductCard.astro";
import RetailerCard from "../../components/RetailerCard.astro";
import SectionHeading from "../../components/SectionHeading.astro";
import { getDrops, getDrop } from "../../lib/sanity";
import type { ProductSummary } from "../../lib/sanity";
import { DROP_BASE_PATH } from "../../lib/drops";
import { urlFor } from "../../lib/image";
import { formatPostDate } from "../../lib/date";
// buildProduct is imported by the strain page and deliberately not here: a drop
// is not itself a product, and its individual products already render as cards.
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

const { slug } = Astro.params;
const drop = await getDrop( slug! );
if( !drop ) return Astro.redirect( DROP_BASE_PATH );

const PORTAL_LABELS: Record<string, string> = {
  bamboo: "Bamboo",
  cultivera: "Cultivera",
};

// A lot carries a Bamboo id and a Cultivera id, so an unqualified number is
// ambiguous. Render the identifier only when we can say which portal it is from.
const lotLabel = drop.lotIdentifier && drop.lotPortal
  ? `${PORTAL_LABELS[drop.lotPortal] ?? drop.lotPortal} lot ${drop.lotIdentifier}`
  : null;

// Products are grouped by strain because a drop bundles lots and one lot is one
// strain. A product whose strain reference is missing is shown in its own group
// rather than dropped, so a content problem is visible instead of silent.
interface StrainGroup {
  key: string;
  heading: string;
  products: ProductSummary[];
}

const groupsByKey = new Map<string, StrainGroup>();
for( const product of drop.products ) {
  const key = product.strain?._id ?? "unassigned";
  const heading = product.strain?.name ?? "More in this drop";
  const existing = groupsByKey.get( key );
  if( existing ) {
    existing.products.push( product );
  } else {
    groupsByKey.set( key, { key, heading, products: [ product ] } );
  }
}
const strainGroups = [ ...groupsByKey.values() ];

const ogImage = drop.heroImage?.asset
  ? urlFor( drop.heroImage ).width( 1200 ).height( 630 ).format( "jpg" ).url()
  : undefined;

// buildBreadcrumbList takes one argument. The crumb shape, the Home entry and
// the trailing slashes all match the strain page's call deliberately: these are
// the same breadcrumb trail rendered on a sibling route.
const baseUrl = normalizeSiteUrl( requireSiteUrl( Astro.site ) );
const structuredData: StructuredData[] = [
  buildBreadcrumbList( [
    { name: "Home", url: `${baseUrl}/` },
    { name: "Drops", url: `${baseUrl}${DROP_BASE_PATH}/` },
    { name: drop.name, url: `${baseUrl}${DROP_BASE_PATH}/${drop.slug.current}/` },
  ] ),
];
---

<Layout title={drop.name} description={drop.description} ogImage={ogImage} structuredData={structuredData}>
  <Hero title={drop.name} subtitle={drop.description} />

  <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
    <ProductBadge type={drop.status} />
    <span class="product-badge"><time datetime={drop.dropDate}>{formatPostDate( drop.dropDate )}</time></span>
  </div>

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

  {strainGroups.map( group => (
    <section>
      <SectionHeading title={group.heading} />
      <div class="card-grid">
        {group.products.map( product => (
          <ProductCard {...product} />
        ) )}
      </div>
    </section>
  ) )}

  {drop.retailers && drop.retailers.length > 0 && (
    <section>
      <SectionHeading title="Where to find it" />
      <div class="card-grid">
        {drop.retailers.map( retailer => (
          <RetailerCard {...retailer} />
        ) )}
      </div>
    </section>
  )}
</Layout>
```

Two signatures above were verified against the real files during the plan's preflight scan and are correct as written: `Layout.astro` takes `ogImage` (not `image`), and `buildBreadcrumbList` takes exactly one argument. Do not "fix" either back.

One signature is still yours to verify before running anything: `RetailerCard.astro` — confirm it takes a spread `Retailer` as its props, and adjust the retailer block to match if it does not.

- [ ] **Step 3: Add the meta list styling**

Add a `.drop-meta` rule to `src/styles/global.css`, above the print block. Set colors explicitly using `--text-secondary` for `dd` and `--text-emphasis` for `dt`; do not rely on inheritance.

- [ ] **Step 4: Verify**

Run: `make format && yarn lint && yarn astro check`
Expected: lint clean, 0 type errors.

Run: `make build 2>&1 | tail -3`
Expected: **still 87 pages**. With zero drop documents in Sanity, `getStaticPaths` returns an empty array and this route generates no pages. That is the correct result, and it is also the limit of what can be verified before content exists.

- [ ] **Step 5: Commit**

```bash
git add "src/pages/drops/[...slug].astro" src/styles/global.css
git commit -m "feat: add the drop detail page"
```

---

### Task 7: Nav, homepage, strain pages and product cards

**Files:**
- Modify: `src/components/Nav.astro`
- Modify: `src/pages/index.astro`
- Modify: `src/pages/strains/[...slug].astro`
- Modify: `src/pages/products.astro`
- Modify: `src/components/ProductCard.astro`

**Interfaces:**
- Consumes: `getDrops` from `src/lib/sanity.ts`; `buildDropLookup`, `dropHref`, `compareDropStrength`, `DropRef` from `src/lib/drops.ts`; `DropCard`.
- Produces: nothing new.

- [ ] **Step 1: Add the nav link**

In `src/components/Nav.astro`, add to `NAV_LINKS` after the Products entry:

```ts
  { href: "/drops", label: "Drops" },
```

The existing `startsWith` active-state logic already covers `/drops/<slug>`. Nav layout and mobile wrapping are explicitly out of scope for this plan.

- [ ] **Step 2: Add the optional drop badge to ProductCard**

In `src/components/ProductCard.astro`, extend the props and render the badge. `ProductCard` is a plain `<div>` and already contains an anchor to the strain, so a second link is safe here. It would **not** be safe in `StrainCard` or `DropCard`.

Change the props block to:

```astro
---
import { urlFor } from "../lib/image";
import ProductBadge from "./ProductBadge.astro";
import { dropHref } from "../lib/drops";
import type { DropRef } from "../lib/drops";
import type { ProductSummary, ProductWithDescription } from "../lib/sanity";

type Props = ( ProductSummary | ProductWithDescription ) & { drop?: DropRef };

const { name, category, weight, available, image, drop } = Astro.props;
const strain = "strain" in Astro.props ? Astro.props.strain : undefined;
const displayImage = image ?? strain?.heroImage;
---
```

Add the link to the card body, after the existing strain paragraph:

```astro
    {drop && (
      <p><a href={dropHref( drop.slug )}>{drop.name}</a></p>
    )}
```

- [ ] **Step 3: Pass the lookup from the products index**

In `src/pages/products.astro`, build the lookup and pass each product its drop:

```ts
import { getProducts, getDrops } from "../lib/sanity";
import { buildDropLookup } from "../lib/drops";

const products = await getProducts() ?? [];
const dropLookup = buildDropLookup( await getDrops() ?? [] );
```

and in the map:

```astro
        <ProductCard {...product} drop={dropLookup.byProductId.get( product._id )} />
```

- [ ] **Step 4: Surface the drop on strain pages**

In `src/pages/strains/[...slug].astro`, fetch drops **inside `getStaticPaths`** and hand each page its own `DropRef` through props. Astro runs page frontmatter once per generated page, so calling `getDrops()` in the frontmatter would mean one identical network fetch per strain; `getStaticPaths` runs exactly once per route file.

```ts
export async function getStaticPaths() {
  const strains = await getStrains() ?? [];
  const dropLookup = buildDropLookup( await getDrops() ?? [] );
  return strains.map( ( strain: { _id: string; slug: { current: string } }) => ({
    params: { slug: strain.slug.current },
    props: { drop: dropLookup.byStrainId.get( strain._id ) },
  }) );
}
```

Read the existing `getStaticPaths` in that file first: the inline type annotation on the map callback is `{ slug: { current: string } }` today and must gain `_id` as shown, or the lookup call will not type-check.

Then in the frontmatter, below the existing `Astro.params` destructuring:

```ts
const { drop } = Astro.props;
```

and render the link above the products section:

```astro
  {drop && (
    <p>In this drop: <a href={dropHref( drop.slug )}>{drop.name}</a></p>
  )}
```

Also pass the drop through to the product cards on that page, using the same lookup value, since every product on a strain page shares the strain's drop:

```astro
          <ProductCard {...product} drop={drop} />
```

Add the imports: `getDrops` from `../../lib/sanity` and `buildDropLookup`, `dropHref` from `../../lib/drops`.

- [ ] **Step 5: Add the homepage featured drop**

In `src/pages/index.astro`, add the fetch to the frontmatter:

```ts
import DropCard from "../components/DropCard.astro";
import { getSiteSettings, getStrains, getPage, getBlogPosts, getDrops } from "../lib/sanity";
import { compareDropStrength } from "../lib/drops";

// The newest available drop, falling back to the newest upcoming one.
// compareDropStrength already ranks available above upcoming above sold out, so
// the first entry after sorting is the answer, and a sold out first entry means
// there is nothing live to feature.
const sortedDrops = ( await getDrops() ?? [] ).sort( compareDropStrength );
const featuredDrop = sortedDrops[0]?.status === "soldOut" ? undefined : sortedDrops[0];
```

and the section between the `HeroBackdrop` block and the Featured Strains section:

```astro
  {featuredDrop && (
    <section class="fade-in" style="margin-top:3rem;">
      <SectionHeading title="Current Drop" />
      <div class="card-grid">
        <DropCard {...featuredDrop} />
      </div>
    </section>
  )}
```

The whole section is inside the guard, so with no live drop the homepage renders nothing here rather than an empty shell.

- [ ] **Step 6: Verify**

Run: `make format && yarn lint && yarn astro check`
Expected: lint clean, 0 type errors.

Run: `make build 2>&1 | tail -3`
Expected: still 87 pages.

Run: `grep -o 'href="/drops"' dist/index.html | wc -l`
Expected: at least 1, from the nav link.

Run: `grep -o 'Current Drop' dist/index.html | wc -l`
Expected: 0, because no drop documents exist yet and the section guards itself.

- [ ] **Step 7: Verify the card anchor invariant did not break**

Run: `grep -o '<a [^>]*class="card"' dist/strains/index.html | wc -l`
Expected: a non-zero count equal to the number of strain cards on the page. If this is 0, a nested anchor broke the outer card link. Nothing else in this repo catches that: not lint, not `astro check`, not the build, not the link checker.

- [ ] **Step 8: Run the content style check**

Run: `make check-content-style`
Expected: pass. This covers the new copy strings added in Tasks 5, 6 and 7 for British spellings and missing temperature units.

- [ ] **Step 9: Commit**

```bash
git add src/components/Nav.astro src/components/ProductCard.astro src/pages/index.astro src/pages/products.astro "src/pages/strains/[...slug].astro"
git commit -m "feat: surface drops on the nav, homepage, strain pages and product cards"
```

---

### Task 8: Full verification and the pull request

**Files:** none modified.

- [ ] **Step 1: Run every CI-equivalent check locally**

Run each and confirm it passes before opening the PR. Locally-green must mean CI-green, and lint, format-check and type-check fail independently of one another.

```bash
yarn astro check
yarn lint
node scripts/check-drop-lookup.ts
make check-content-style
cd studio && yarn lint && yarn typecheck && yarn format:check && cd ..
make build
```

- [ ] **Step 2: Confirm the final page count**

Run: `make build 2>&1 | tail -3`
Expected: **87 pages**, one more than the 86 baseline. The single new page is `/drops`.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin worktree-feat-drops-section
```

Then, as a separate command (a compound command containing "main" trips the push-to-main guard):

```bash
gh pr create --title "feat: add the Drops section" --body "..."
```

The body should state: what a drop is, that strains are derived from products rather than stored, that status is editor-set and why (there is no scheduled rebuild, so a date-derived status would freeze), the two fields dropped after reconciling with `nw-local-ops` #145 and why, and the ordering constraint below. Do not add Claude attribution.

- [ ] **Step 4: State the content ordering constraint in the PR**

The PR body must say: **create drop documents in Sanity only after this merges.** A Sanity publish rebuilds against `main`, so a drop published before the merge fetches into a site with no `/drops` route.

- [ ] **Step 5: Verify the populated state after the first drop is published**

This is the one thing that cannot be verified before merge, and it must not be skipped. Once the first real drop exists in Sanity:

- The page count rises by one per drop.
- `/drops` lists the drop with the right status badge.
- `/drops/<slug>` renders its products grouped by strain.
- The strain page for a strain in the drop shows the "In this drop" link.
- The product cards for its SKUs show the drop badge.
- The homepage shows the Current Drop section when the drop's status is `available` or `upcoming`.

## Deferred, and deliberately not in this plan

These are recorded so they are not mistaken for oversights. Each is a separate piece of work.

- **Batch metadata drifts from ops silently.** `nw-local-ops` is the system of record for lots, and the website's copy is hand typed. The natural fix is a push from ops into Sanity on stage advance, which is a PR in that repo.
- **Sanity `product` and ops `Sku` are unlinked catalogs.** `Allocation` commits a lot to a SKU upstream and the website knows nothing about it.
- **Nav layout at eight links plus two icons.** Out of scope by decision.
- **A `/new-drop` skill.** If added, it must gather products itself, since Studio validation does not constrain API writes.
