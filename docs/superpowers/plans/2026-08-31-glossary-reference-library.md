# Glossary Reference Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a progressively enhanced cannabis glossary with instant search and filters, optional editorial imagery, long-form reference entries, and Electrical Conductivity as the first complete guide.

**Architecture:** Astro continues to render the complete glossary statically from Sanity. Shared category definitions and runtime content validation establish one fail-fast contract across Studio and frontend; a dependency-free TypeScript module supplies client-side search without adding a UI framework. Portable Text heading preparation supplies both collision-safe article anchors and the entry table of contents.

**Tech Stack:** Astro 6, strict TypeScript, Sanity Studio and Portable Text, Sanity MCP, Node 22 built-in TypeScript execution, HTML/CSS, minimal browser JavaScript

**Spec:** `docs/superpowers/specs/2026-08-31-glossary-reference-library-design.md`

## Global Constraints

- Keep `shortDefinition` required, self-contained, and at most 200 characters; it remains the source for hover cards, directory entries, ledes, and metadata.
- Keep detailed content in Sanity Portable Text; do not introduce Markdown or another renderer.
- Store exactly one required primary category from Plant Biology, Cultivation, Environment, Nutrition, Chemistry, Post-Harvest, or Business & Regulation.
- Use one optional hotspot-enabled image for both the entry hero and featured-guide crop; require inline alt text whenever the image exists.
- Search canonical term, aliases, short definition, and category only; never search the full article body.
- Render the complete alphabetical directory without JavaScript; enhancement may filter existing markup but must not own or fetch the content.
- Do not add pagination, a client UI framework, or a search service.
- Use US spelling and no em dashes in visitor-facing copy; every visitor-visible temperature must show Fahrenheit first and Celsius second.
- Use descriptive identifiers; no one-character variables, TypeScript `as` assertions, `eslint-disable` comments, duplicated reusable strings, env fallbacks, or silent failures.
- Never place an anchor inside an anchor-backed `.card`.
- Project image projections must include `asset->, alt, crop, hotspot` when constrained cropping is used.
- Run formatter before every implementation commit and run the full local check target before pushing.
- Do not start a development or preview server; interaction verification uses the user's already-running server.

---

## File Map

### New files

- `shared/glossary-categories.ts` — canonical category values, labels, and type shared across root and Studio.
- `src/lib/glossary.ts` — runtime glossary content contract, featured-entry validation, label lookup, and reading-time calculation.
- `src/lib/glossary-search.ts` — pure normalization, filtering, and URL-state functions.
- `src/lib/portableTextHeadings.ts` — one heading preparation pass that returns collision-safe rendered blocks and table-of-contents records.
- `src/components/GlossaryFeaturedCard.astro` — image-backed featured-guide card with no nested anchors.
- `src/components/GlossarySearch.astro` — semantic controls and the thin progressive-enhancement controller.
- `scripts/check-glossary.ts` — dependency-free tests for categories, validation, search, URL state, and reading time.
- `scripts/check-portable-text-headings.ts` — dependency-free tests for heading extraction and collision suffixes.
- `scripts/check-glossary-build.py` — built-HTML contract check for index and concise/detailed entry variants.

### Modified files

- `studio/schemaTypes/glossaryTerm.ts` — new image, alias, category, related-term, featured, and review-date fields plus validation.
- `src/lib/sanity.ts` — expanded glossary interfaces and projections; validate query results at the Sanity boundary.
- `src/lib/jsonld.ts` — `DefinedTerm` structured-data type and builder.
- `src/components/PortableText.astro` — render heading-prepared Portable Text.
- `src/components/PortableTextHeading.astro` — consume the prepared collision-safe ID rather than recomputing it independently.
- `src/pages/glossary/index.astro` — featured row, controls, filterable directory, empty state, and result metadata.
- `src/pages/glossary/[...slug].astro` — compact optional-image hero, contents navigation, article metadata, related terms, and defined-term JSON-LD.
- `src/styles/global.css` — shared glossary directory, search, featured-card, entry-layout, responsive, and print styles.
- `Makefile` — focused glossary checks and one aggregate CI-equivalent `check` target.
- `.github/workflows/ci.yml` — run dependency-free glossary checks.
- `.github/workflows/audit.yml` — validate the built glossary contract.
- `README.md` — document the new local aggregate check target if it is added to the developer command surface.
- `docs/testing.md` — document glossary build validation and manual interaction checks.
- `AGENTS.md` — add a concise invariant explaining that Studio validation alone does not enforce the featured glossary contract and that category backfill must precede frontend enforcement.

---

### Task 1: Establish the shared glossary taxonomy and Studio fields

**Files:**
- Create: `shared/glossary-categories.ts`
- Modify: `studio/schemaTypes/glossaryTerm.ts`
- Test: Studio type check and schema extraction

**Interfaces:**
- Produces: `GLOSSARY_CATEGORIES`, `GlossaryCategory`, `glossaryCategoryLabel( category: GlossaryCategory ): string`, and `isGlossaryCategory( value: unknown ): value is GlossaryCategory`.
- Consumed by: Tasks 2, 3, 5, and 6.

- [ ] **Step 1: Create the shared category contract**

Write `shared/glossary-categories.ts` with a const-generic helper so literal values are preserved without a prohibited `as const` assertion:

```ts
interface GlossaryCategoryOption {
  value: string;
  title: string;
}

function defineGlossaryCategories<const CategoryOptions extends readonly GlossaryCategoryOption[]>(
  categories: CategoryOptions,
): CategoryOptions {
  return categories;
}

export const GLOSSARY_CATEGORIES = defineGlossaryCategories( [
  { value: "plant-biology", title: "Plant Biology" },
  { value: "cultivation", title: "Cultivation" },
  { value: "environment", title: "Environment" },
  { value: "nutrition", title: "Nutrition" },
  { value: "chemistry", title: "Chemistry" },
  { value: "post-harvest", title: "Post-Harvest" },
  { value: "business-regulation", title: "Business & Regulation" },
] );

export type GlossaryCategory = typeof GLOSSARY_CATEGORIES[number]["value"];

export function isGlossaryCategory( value: unknown ): value is GlossaryCategory {
  return typeof value === "string"
    && GLOSSARY_CATEGORIES.some( category => category.value === value );
}

export function glossaryCategoryLabel( value: GlossaryCategory ): string {
  const category = GLOSSARY_CATEGORIES.find( candidate => candidate.value === value );
  if( !category ) throw new Error( `Unknown glossary category: ${value}` );
  return category.title;
}
```

- [ ] **Step 2: Run both TypeScript projects to prove the shared file is valid before it is imported**

Run:

```bash
SANITY_PROJECT_ID=test-project SANITY_DATASET=test SANITY_API_TOKEN=test-token yarn astro check
cd studio && yarn typecheck
```

Expected: both commands pass; the root may retain its five existing Astro hints but reports zero errors.

- [ ] **Step 3: Extend the Studio schema**

Import `GLOSSARY_CATEGORIES` from `../../shared/glossary-categories`. Add:

```ts
defineField({
  name: 'image',
  title: 'Editorial Image',
  type: 'image',
  options: { hotspot: true },
  fields: [
    defineField({
      name: 'alt',
      title: 'Alternative Text',
      type: 'string',
      validation: (rule) => rule.custom((alt, context) => {
        const parent = context.parent
        if (typeof parent !== 'object' || parent === null || !('asset' in parent)) return true
        return typeof alt === 'string' && alt.trim().length > 0
          ? true
          : 'Alternative text is required when an image is attached.'
      }),
    }),
  ],
}),
defineField({
  name: 'aliases',
  title: 'Aliases',
  type: 'array',
  of: [{ type: 'string' }],
  validation: (rule) => rule.unique(),
}),
defineField({
  name: 'category',
  title: 'Primary Category',
  type: 'string',
  options: { list: GLOSSARY_CATEGORIES },
  validation: (rule) => rule.required(),
}),
defineField({
  name: 'relatedTerms',
  title: 'Related Terms',
  type: 'array',
  of: [{ type: 'reference', to: [{ type: 'glossaryTerm' }] }],
  validation: (rule) => rule.unique(),
}),
defineField({
  name: 'featured',
  title: 'Feature as an In-Depth Guide',
  type: 'boolean',
  initialValue: false,
}),
defineField({
  name: 'lastReviewedAt',
  title: 'Last Reviewed',
  type: 'date',
}),
```

Add document-level validation that returns one combined operator-facing error when `featured` is true and `body`, `image.asset`, `image.alt`, or `lastReviewedAt` is missing. Reject self-references in `relatedTerms` by comparing each `_ref` with `context.document?._id` and its published ID after removing a leading `drafts.`.

- [ ] **Step 4: Verify Studio formatting, lint, and types**

Run:

```bash
cd studio && yarn format && yarn lint && yarn typecheck && yarn format:check
```

Expected: all four commands exit zero.

- [ ] **Step 5: Commit the taxonomy and schema**

```bash
git add shared/glossary-categories.ts studio/schemaTypes/glossaryTerm.ts
git commit -m "feat: expand the glossary content model"
```

---

### Task 2: Enforce the glossary contract at the Sanity boundary

**Files:**
- Create: `src/lib/glossary.ts`
- Create: `scripts/check-glossary.ts`
- Modify: `src/lib/sanity.ts`
- Modify: `Makefile`

**Interfaces:**
- Consumes: `GlossaryCategory`, `isGlossaryCategory`, and `glossaryCategoryLabel` from Task 1.
- Produces: expanded `GlossaryTermSummary` and `GlossaryTerm`; `validateGlossarySummaries( terms: readonly GlossaryTermSummary[] ): void`; `validateGlossaryTerm( term: GlossaryTerm ): void`; `glossaryReadingMinutes( body: PortableText | undefined ): number | undefined`.
- Consumed by: Tasks 3, 5, and 6.

- [ ] **Step 1: Write failing validator and reading-time checks**

Start `scripts/check-glossary.ts` with fixture builders that include `_id`, `term`, `slug`, `shortDefinition`, `aliases`, `category`, `featured`, `image`, and `hasBody`. Assert:

```ts
expectThrows(
  "unknown category names the document",
  () => validateGlossarySummaries( [ makeTerm( { _id: "glossary-bad", category: "unknown" } ) ] ),
  "glossary-bad",
);

expectThrows(
  "featured entries report every missing field",
  () => validateGlossarySummaries( [ makeTerm( {
    _id: "glossary-featured",
    featured: true,
    image: undefined,
    hasBody: false,
    lastReviewedAt: undefined,
  } ) ] ),
  "body, image, image.alt, lastReviewedAt",
);

expectEqual( "200 words is one minute", glossaryReadingMinutes( bodyWithWords( 200 ) ), 1 );
expectEqual( "201 words rounds up", glossaryReadingMinutes( bodyWithWords( 201 ) ), 2 );
expectEqual( "missing body has no reading time", glossaryReadingMinutes( undefined ), undefined );
```

Use descriptive helper parameters and collect failures before exiting nonzero, matching `scripts/check-drop-lookup.ts`.

- [ ] **Step 2: Run the checks to verify they fail**

Run: `node scripts/check-glossary.ts`

Expected: FAIL because `src/lib/glossary.ts` and its exports do not exist.

- [ ] **Step 3: Implement the runtime contract**

In `src/lib/glossary.ts`, validate every category. For featured entries, collect missing requirements in a string array and throw once:

```ts
export function validateGlossarySummaries(
  terms: readonly GlossaryTermSummary[],
): void {
  for( const term of terms ) {
    if( !isGlossaryCategory( term.category ) ) {
      throw new Error(
        `Glossary term ${term._id} has unknown category ${JSON.stringify( term.category )}.`,
      );
    }

    if( !term.featured ) continue;

    const missingFields: string[] = [];
    if( !term.hasBody ) missingFields.push( "body" );
    if( !term.image?.asset ) missingFields.push( "image" );
    if( !term.image?.alt?.trim() ) missingFields.push( "image.alt" );
    if( !term.lastReviewedAt ) missingFields.push( "lastReviewedAt" );

    if( missingFields.length > 0 ) {
      throw new Error(
        `Featured glossary term ${term._id} is missing: ${missingFields.join( ", " )}.`,
      );
    }
  }
}
```

Do not duplicate Portable Text span walking. Extend `src/lib/portableText.ts` with a reusable plain-text block walker if reading time cannot reuse `childrenToText` directly.

- [ ] **Step 4: Expand central types and projections**

Add `aliases`, `category`, `featured`, `image`, `lastReviewedAt`, and `hasBody` to `GlossaryTermSummary`. Add the full `body` and dereferenced `relatedTerms` only to `GlossaryTerm`. Use a shared `GLOSSARY_SUMMARY_PROJECTION` string in both list and detail queries:

```groq
{
  _id, term, slug, shortDefinition, aliases, category, featured, lastReviewedAt,
  image { asset->, alt, crop, hotspot },
  "hasBody": defined(body[0])
}
```

The detail projection additionally includes the full article and related terms:

```groq
body[] ${PORTABLE_TEXT_PROJECTION},
relatedTerms[]->{ _id, term, slug, shortDefinition, category }
```

This prevents every long article body from being serialized into the glossary index merely to decide whether a featured card is valid.

Reject null unresolved related references after the fetch. Call `validateGlossarySummaries` inside `getGlossaryTerms()` and `validateGlossaryTerm` inside `getGlossaryTerm()` before returning data.

- [ ] **Step 5: Run the focused checks and type checker**

Run:

```bash
node scripts/check-glossary.ts
SANITY_PROJECT_ID=test-project SANITY_DATASET=test SANITY_API_TOKEN=test-token yarn astro check
```

Expected: glossary checks pass; Astro reports zero errors.

- [ ] **Step 6: Add the focused Make target and commit**

Add `check-glossary` to `.PHONY` and:

```make
check-glossary: ## Verify glossary content contracts and search mechanics
	@node scripts/check-glossary.ts
```

Run `make check-glossary`, then:

```bash
git add src/lib/glossary.ts src/lib/portableText.ts src/lib/sanity.ts scripts/check-glossary.ts Makefile
git commit -m "feat: enforce glossary content contracts"
```

---

### Task 3: Prepare collision-safe Portable Text headings and contents data

**Files:**
- Create: `src/lib/portableTextHeadings.ts`
- Create: `scripts/check-portable-text-headings.ts`
- Modify: `src/components/PortableText.astro`
- Modify: `src/components/PortableTextHeading.astro`
- Modify: `Makefile`

**Interfaces:**
- Produces: `preparePortableTextHeadings( value: PortableText ): { value: PortableText; headings: PortableTextHeadingRecord[] }`; `PortableTextHeadingRecord` has `id: string`, `level: 2 | 3`, and `text: string`.
- Consumed by: Task 6 and every existing Portable Text renderer.

- [ ] **Step 1: Write failing heading-preparation checks**

Assert these exact cases in `scripts/check-portable-text-headings.ts`:

```ts
expectIds( "ordinary headings", [ heading( "h2", "What EC measures" ) ], [ "what-ec-measures" ] );
expectIds(
  "duplicates receive stable suffixes",
  [ heading( "h2", "Sources" ), heading( "h3", "Sources" ), heading( "h2", "Sources" ) ],
  [ "sources", "sources-2", "sources-3" ],
);
expectIds(
  "punctuation-equivalent headings collide",
  [ heading( "h2", "Feed EC" ), heading( "h2", "Feed: EC" ) ],
  [ "feed-ec", "feed-ec-2" ],
);
expectThrows( "symbol-only heading fails loudly", () => preparePortableTextHeadings( [ heading( "h2", "§" ) ] ) );
```

- [ ] **Step 2: Run the check to verify it fails**

Run: `node scripts/check-portable-text-headings.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement one preparation pass**

Walk the Portable Text array in source order. For each `h2` or `h3`, derive the base with existing `headingId( blockText( block ) )`, increment a `Map<string, number>`, append `-2`, `-3`, and so on, and clone the block with a `_headingId` field. Return the cloned value and heading records. Preserve non-heading blocks by identity.

Do not keep the current independent ID calculation in `PortableTextHeading.astro`. It must read and validate `node._headingId`; a missing prepared ID is a wiring error and throws with the block key.

In `PortableText.astro`, accept `prepared?: boolean`. When false or omitted, call `preparePortableTextHeadings( value )`. When true, call `validatePreparedPortableTextHeadings( value )`, which throws if any `h2` or `h3` lacks `_headingId`, and render `value` unchanged. This applies collision protection to blog, strain, terpene, and glossary bodies through one mechanic without independently preparing the glossary body twice.

- [ ] **Step 4: Run red-green verification and existing anchor checks**

Run:

```bash
node scripts/check-portable-text-headings.ts
SANITY_PROJECT_ID=test-project SANITY_DATASET=test SANITY_API_TOKEN=test-token yarn astro check
```

Expected: both pass.

- [ ] **Step 5: Add a Make target, format, and commit**

Add `check-portable-text-headings` to `.PHONY` and run it from the eventual aggregate target. Then:

```bash
make format
git add src/lib/portableTextHeadings.ts src/components/PortableText.astro src/components/PortableTextHeading.astro scripts/check-portable-text-headings.ts Makefile
git commit -m "feat: prepare glossary table of contents headings"
```

---

### Task 4: Deploy the schema and publish valid glossary content

**Files:**
- No repository files; this task changes the deployed Studio schema and Sanity documents.

**Interfaces:**
- Consumes: the schema from Task 1 and frontend contract from Task 2.
- Produces: every published glossary term has a valid primary category; EC satisfies the complete featured-entry contract.
- Consumed by: production builds in Tasks 5 through 8.

- [ ] **Step 1: Deploy the Studio schema**

Run: `make deploy-studio`

Expected: the `nw-local` workspace deploy completes successfully. Do not proceed if deployment fails.

- [ ] **Step 2: Audit all published glossary terms before mutation**

Using the Sanity MCP, load the deployed `glossaryTerm` schema and query the published perspective:

```groq
*[_type == "glossaryTerm"] | order(lower(term) asc) {
  _id, _rev, term, slug, shortDefinition, category, aliases,
  featured, lastReviewedAt,
  image { asset, alt, crop, hotspot },
  body
}
```

Use this reviewed `_id` to category mapping for the current 59 documents. Before patching, fail if the query returns an ID absent from the mapping or if the mapping contains an ID absent from the query; this makes concurrent content additions visible instead of silently leaving them uncategorized.

```ts
const CATEGORY_BY_GLOSSARY_ID = {
  "glossary-allele": "plant-biology",
  "glossary-anemometer": "environment",
  "ec7d053b-b805-4ce2-9dfd-d6e5a379373b": "chemistry",
  "glossary-bag-appeal": "post-harvest",
  "f9f2eac6-4402-4202-8e2c-787438c8f7e3": "environment",
  "glossary-boundary-layer": "environment",
  "glossary-c3-photosynthesis": "plant-biology",
  "glossary-cannabinoid": "chemistry",
  "glossary-carboxylation": "plant-biology",
  "f9d52f3d-3b7a-4813-836f-70489a9b8d49": "plant-biology",
  "glossary-coco-coir": "cultivation",
  "glossary-cola": "plant-biology",
  "glossary-co2-compensation-point": "plant-biology",
  "glossary-crop-steering": "cultivation",
  "1818ddae-2afe-45f3-9024-5d6799bb850e": "plant-biology",
  "glossary-daily-light-integral": "environment",
  "41d6daa8-9ebd-4ffc-b920-3567d2bb2289": "environment",
  "glossary-dif": "environment",
  "glossary-dose-response-curve": "plant-biology",
  "glossary-drain-to-waste": "cultivation",
  "glossary-dryback": "cultivation",
  "glossary-ec": "nutrition",
  "glossary-flavonoid": "chemistry",
  "glossary-genotype": "plant-biology",
  "glossary-guttation": "plant-biology",
  "glossary-inflorescence": "plant-biology",
  "glossary-leaf-wetness": "environment",
  "glossary-lockout": "nutrition",
  "glossary-magnus-equation": "environment",
  "glossary-mass-flow": "plant-biology",
  "glossary-mbw-complex": "plant-biology",
  "glossary-myb-transcription-factor": "plant-biology",
  "glossary-net-photosynthesis": "plant-biology",
  "glossary-parts-per-million": "environment",
  "glossary-phenohunting": "cultivation",
  "glossary-phenylpropanoid-pathway": "chemistry",
  "glossary-phloem": "plant-biology",
  "glossary-photoperiod": "environment",
  "glossary-photorespiration": "plant-biology",
  "glossary-photosynthetic-acclimation": "plant-biology",
  "glossary-powdery-mildew": "environment",
  "glossary-ppfd": "environment",
  "glossary-relative-humidity": "environment",
  "glossary-rockwool": "cultivation",
  "glossary-rubisco": "plant-biology",
  "glossary-saturation-vapor-pressure": "environment",
  "4ca62c57-4439-4b84-ad92-8d65c2eb4aa3": "plant-biology",
  "glossary-stomata": "plant-biology",
  "glossary-stomatal-conductance": "plant-biology",
  "glossary-taper": "cultivation",
  "glossary-terpene": "chemistry",
  "glossary-transcription-factor": "plant-biology",
  "glossary-translocation": "plant-biology",
  "glossary-transpiration": "plant-biology",
  "fea381a8-7c22-4279-a23e-80b6051164ce": "plant-biology",
  "glossary-vacuole": "plant-biology",
  "f2b122db-ea91-4d19-859c-dde99deb8b3a": "environment",
  "glossary-water-use-efficiency": "plant-biology",
  "glossary-xylem": "plant-biology",
} satisfies Record<string, GlossaryCategory>;
```

- [ ] **Step 3: Patch category backfill with optimistic revision guards**

Patch each document using its observed `_rev`, creating drafts. Limit each MCP patch call to 25 documents. Query the drafts perspective afterward and assert:

```groq
count(*[_type == "glossaryTerm" && !defined(category)]) == 0
```

Publish the patched glossary document IDs only after the assertion returns zero.

- [ ] **Step 4: Generate and upload the EC editorial image**

Invoke the `imagegen` skill and create one wide photorealistic editorial image: a clean commercial fertigation reservoir with a professional EC probe in nutrient solution, subtle cannabis cultivation context, dark industrial green palette, no text, no logos, no people, composed to support both a 16:9 crop and a compact 4:3 crop. Inspect the generated image before upload.

Upload it through the Sanity asset workflow with a descriptive label and US-English description. Record only the returned asset ID, never secret credentials.

- [ ] **Step 5: Author the EC exemplar in Portable Text**

Research primary or authoritative sources and write original prose under these headings:

1. `What EC measures`
2. `What EC does not measure`
3. `Feed EC, volume, and nutrient dose`
4. `Root-zone EC and dryback`
5. `Temperature compensation and meter care`
6. `Common interpretation mistakes`
7. `Related terms`
8. `References`

The article must explain the distinction that prompted this feature: unchanged feed EC does not imply unchanged calcium delivery when total irrigation volume changes. Keep the short definition within 200 characters and do not copy source language. Use inline URL annotations for sources and a manually authored References section. Any temperatures must show Fahrenheit first with Celsius in parentheses.

Set:

- category: `nutrition`
- aliases: `EC`, `conductivity`, and `solution conductivity`
- featured: `true`
- lastReviewedAt: `2026-08-31`
- the uploaded image with a purposeful hotspot and visitor-facing alt text
- related-term references selected from real existing documents, including pH and dryback when those terms exist

- [ ] **Step 6: Validate the draft before publication**

Query the draft by ID and verify all required fields, body headings, link mark definitions, related references, image alt, crop, and hotspot. Publish, immediately run `make build && make check-content-style`, and restore the prior Sanity revision if the blocking style check fails. Never replace this with a log-only warning or an untracked prose scan.

- [ ] **Step 7: Publish and verify the published perspective**

Publish the EC draft and any remaining category drafts. Query the published perspective and assert:

```groq
{
  "missingCategories": count(*[_type == "glossaryTerm" && !defined(category)]),
  "invalidFeatured": count(*[_type == "glossaryTerm" && featured == true && (
    !defined(body[0]) || !defined(image.asset) || !defined(image.alt) || !defined(lastReviewedAt)
  )]),
  "ec": *[_type == "glossaryTerm" && slug.current == "ec"][0] {
    _id, term, category, aliases, featured, lastReviewedAt,
    image { asset, alt, crop, hotspot },
    "headingCount": count(body[style in ["h2", "h3"]]),
    "relatedCount": count(relatedTerms)
  }
}
```

Expected: both counts are zero; EC has an image with framing data, eight headings, and at least two related terms. This task has no git commit because Sanity content is the deliverable.

---

### Task 5: Implement pure glossary search and the searchable index

**Files:**
- Create: `src/lib/glossary-search.ts`
- Create: `src/components/GlossaryFeaturedCard.astro`
- Create: `src/components/GlossarySearch.astro`
- Modify: `scripts/check-glossary.ts`
- Modify: `src/pages/glossary/index.astro`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: `GlossaryTermSummary`, category helpers, and validated `getGlossaryTerms()` results.
- Produces: `normalizeGlossarySearchText( value: string ): string`; `filterGlossaryTerms( terms: readonly GlossarySearchRecord[], filters: GlossaryFilters ): string[]`; `parseGlossaryFilters( params: URLSearchParams ): GlossaryFilters`; `serializeGlossaryFilters( filters: GlossaryFilters ): URLSearchParams`.
- Consumed by: browser controller in `GlossarySearch.astro` and checks in `scripts/check-glossary.ts`.

- [ ] **Step 1: Add failing pure search checks**

Extend `scripts/check-glossary.ts` to cover:

```ts
expectIds( "canonical term", filter( { query: "electrical conductivity" } ), [ "ec" ] );
expectIds( "alias", filter( { query: "EC" } ), [ "ec" ] );
expectIds( "definition", filter( { query: "dissolved fertilizer" } ), [ "ec" ] );
expectIds( "category label", filter( { query: "nutrition" } ), [ "ec" ] );
expectIds( "accent and punctuation normalization", filter( { query: "vapor-pressure" } ), [ "vpd" ] );
expectIds( "combined filters", filter( {
  query: "conductivity",
  letter: "e",
  category: "nutrition",
} ), [ "ec" ] );
expectIds( "zero results", filter( { query: "not-present" } ), [] );
```

Also assert parse/serialize round trips, unknown categories and multi-character letters are rejected, and query serialization omits empty values.

- [ ] **Step 2: Run the focused check to verify it fails**

Run: `make check-glossary`

Expected: FAIL because `src/lib/glossary-search.ts` does not exist.

- [ ] **Step 3: Implement normalization and filtering**

Use module constants for `q`, `letter`, and `category` parameter names. Normalize with NFKD, combining-mark removal, lowercase conversion, punctuation-to-space conversion, whitespace collapse, and trim. Return matching `_id` values in the already validated alphabetical source order.

Do not import the Sanity client or any env-reading module into this pure file. Use `import type` for term shapes.

- [ ] **Step 4: Implement semantic server-rendered index markup**

`GlossarySearch.astro` renders:

- a visible `<label>` and `type="search"` input;
- A–Z native buttons with `aria-pressed`;
- native category buttons generated from `GLOSSARY_CATEGORIES`;
- result count with `aria-live="polite"`;
- clear-all button;
- a hidden empty-state container; and
- a small inline module controller.

Every directory entry carries normalized data attributes for ID, initial letter, category, and search text. The complete `<dl>` remains present in source HTML.

The controller imports only `src/lib/glossary-search.ts`, keeps one `GlossaryFilters` state object, and shares one `render()` path between input, click, initial URL parsing, and `popstate`. Typing uses `history.replaceState`; letter/category/clear actions use `history.pushState`. Filtered elements use the `hidden` attribute.

- [ ] **Step 5: Implement the featured guide row**

`GlossaryFeaturedCard.astro` receives one `GlossaryTermSummary`, validates its featured contract has already been met, and emits one outer `<a class="card glossary-featured-card">`. Inside it, use only non-anchor descendants: responsive image, category label, term heading, and short definition.

Render featured entries above the directory. Hide the entire featured section whenever any filter is active.

- [ ] **Step 6: Style desktop, mobile, no-JavaScript, and print states**

Keep accent green on interactive emphasis, not large surfaces. Add a two- or three-column featured row depending on width, a readable three-column desktop directory row (term, definition, category), stacked mobile rows, horizontally scrollable letter controls, visible focus states, and a restrained empty state.

Add `.glossary-search-controls` and `.glossary-featured-guides` to the print-interface suppression list while leaving the full directory printable.

- [ ] **Step 7: Run focused and static checks**

Run:

```bash
make check-glossary
make format
yarn lint
SANITY_PROJECT_ID=test-project SANITY_DATASET=test SANITY_API_TOKEN=test-token yarn astro check
```

Expected: all exit zero.

- [ ] **Step 8: Commit the searchable index**

```bash
git add src/lib/glossary-search.ts src/components/GlossaryFeaturedCard.astro src/components/GlossarySearch.astro scripts/check-glossary.ts src/pages/glossary/index.astro src/styles/global.css
git commit -m "feat: add searchable glossary directory"
```

---

### Task 6: Build the long-form glossary entry layout and structured data

**Files:**
- Modify: `src/lib/jsonld.ts`
- Modify: `src/pages/glossary/[...slug].astro`
- Modify: `src/styles/global.css`
- Test: `scripts/check-glossary.ts`

**Interfaces:**
- Consumes: `preparePortableTextHeadings`, `glossaryReadingMinutes`, `glossaryCategoryLabel`, expanded `GlossaryTerm`, and image helpers.
- Produces: `DefinedTermSchema`; `buildDefinedTerm( term: GlossaryTerm, siteUrl: string ): DefinedTermSchema`.

- [ ] **Step 1: Add failing DefinedTerm and reading-metadata checks**

Extend `scripts/check-glossary.ts` with a complete EC fixture and assert:

```ts
expectEqual( "defined term type", schema[ "@type" ], "DefinedTerm" );
expectEqual( "canonical name", schema.name, "Electrical conductivity (EC)" );
expectEqual( "canonical url", schema.url, "https://nw-local.com/glossary/ec/" );
expectEqual( "description", schema.description, ec.shortDefinition );
expectEqual( "aliases", schema.alternateName, [ "EC", "conductivity" ] );
```

Run: `make check-glossary`

Expected: FAIL because `buildDefinedTerm` is not implemented.

- [ ] **Step 2: Implement defined-term structured data**

Add:

```ts
export interface DefinedTermSchema extends SchemaBase {
  "@type": "DefinedTerm";
  name: string;
  url: string;
  description: string;
  alternateName?: string[];
  inDefinedTermSet: string;
}
```

Add it to `StructuredData`. `buildDefinedTerm` uses the normalized site URL, canonical glossary route, short definition, optional aliases, and `${baseUrl}/glossary/` as `inDefinedTermSet`.

- [ ] **Step 3: Prepare the detail page body once**

In the page frontmatter:

```ts
const preparedBody = term.body
  ? preparePortableTextHeadings( term.body )
  : undefined;
const readingMinutes = glossaryReadingMinutes( term.body );
const categoryLabel = glossaryCategoryLabel( term.category );
```

Pass `preparedBody.value` to `<PortableText value={preparedBody.value} prepared />`. Render the contents only when `preparedBody.headings.length > 0`; link every record to its prepared ID. The component validates the prepared contract but does not generate a second set of IDs.

- [ ] **Step 4: Implement the compact optional-image hero**

Render breadcrumb and category, title, lede, reviewed date, and reading time. When `term.image?.asset` exists, generate responsive WebP sources using hotspot-aware `urlFor( term.image ).width().height()` calls and explicit intrinsic dimensions. When it does not exist, apply the text-only modifier and render no image wrapper.

Keep expression braces tight against heading tags to avoid Astro whitespace nodes.

- [ ] **Step 5: Implement contents, related terms, and existing backlinks**

Use a two-column `.glossary-entry-layout`: sticky contents aside and reading column. On narrow screens, the contents becomes an inline block. After the article, render related terms as plain list links, then the existing **Mentioned in** section. Concise entries omit article metadata and empty contents while retaining related terms and backlinks.

- [ ] **Step 6: Add the DefinedTerm object to page structured data**

Append `buildDefinedTerm( term, siteUrl )` beside the existing breadcrumb object. Keep `shortDefinition` as the HTML meta description.

- [ ] **Step 7: Run focused checks, formatting, and types**

Run:

```bash
make check-glossary
make check-portable-text-headings
make format
yarn lint
SANITY_PROJECT_ID=test-project SANITY_DATASET=test SANITY_API_TOKEN=test-token yarn astro check
```

Expected: all commands pass.

- [ ] **Step 8: Commit the detailed entry page**

```bash
git add src/lib/jsonld.ts src/pages/glossary/'[...slug].astro' src/styles/global.css scripts/check-glossary.ts
git commit -m "feat: add long-form glossary entries"
```

---

### Task 7: Add built-output contracts and CI-equivalent local verification

**Files:**
- Create: `scripts/check-glossary-build.py`
- Modify: `Makefile`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/audit.yml`
- Modify: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: built `dist/glossary/index.html`, `dist/glossary/ec/index.html`, and at least one concise term page.
- Produces: `make check-glossary-build` and aggregate `make check` targets.

- [ ] **Step 1: Write a failing built-output checker**

Follow the defensive structure of `scripts/check-heading-anchors.py`: reject missing `dist`, reject absent target pages, accumulate all failures, print file-specific messages, and exit nonzero once.

Assert:

- the index contains the labeled search input, A–Z controls, category controls, live result count, featured EC card, and complete directory entry count;
- the EC page contains image alt text, reviewed date, reading time, table-of-contents links whose targets exist exactly once, related terms, **Mentioned in**, `DefinedTerm`, and `BreadcrumbList` JSON-LD;
- one known concise entry has no empty image wrapper, no reading-time label, and no contents navigation;
- every featured-card image has a nonempty alt attribute.

Count occurrences with Python regex or an HTML parser already available to the script. Do not use `grep -c`, because Astro minifies each page onto one line.

- [ ] **Step 2: Run the checker before a build to verify it fails safely**

Run: `./scripts/check-glossary-build.py /private/tmp/no-glossary-dist`

Expected: exit 2 with a direct “no such directory” message.

- [ ] **Step 3: Add Make targets**

Add:

```make
check-glossary-build: ## Verify the built glossary index and entry contracts
	@./scripts/check-glossary-build.py dist

check: lint check-glossary check-portable-text-headings build check-analytics check-robots check-content-style check-anchors check-glossary-build check-navigation ## Run CI-equivalent repository checks
	@cd studio && yarn lint && yarn typecheck && yarn format:check
	@yarn astro check
```

Keep `build` before every `dist` consumer. Do not make `check` start a server.

- [ ] **Step 4: Wire code and built-output checks into CI**

In `ci.yml`, add the two dependency-free Node checks to the existing code-check job. In `audit.yml`, add `check-glossary-build.py dist` to a job that already downloads the build artifact, or create a focused `validate-glossary` job using the established checkout-then-download ordering.

Because Sanity publishes bypass PR CI and can violate the category or featured contracts, add `./scripts/check-glossary-build.py dist` to `deploy.yml` after the content-style check. A malformed content publish must fail closed and leave the prior deployment live.

- [ ] **Step 5: Build with real Sanity content and run the checker**

Ensure the worktree has its local `.env` through the repository's file-on-disk handoff without printing it. Run:

```bash
make build
make check-glossary-build
make check-anchors
make check-content-style
```

Expected: all pass; read the Astro page count and confirm no glossary route disappeared.

- [ ] **Step 6: Format, verify workflow syntax by inspection, and commit**

Run `make format`, then:

```bash
git add scripts/check-glossary-build.py Makefile .github/workflows/ci.yml .github/workflows/audit.yml .github/workflows/deploy.yml
git commit -m "test: verify glossary reference pages"
```

---

### Task 8: Document the contract, run final verification, and open the PR

**Files:**
- Modify: `README.md`
- Modify: `docs/testing.md`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: every prior task and the published Sanity content.
- Produces: contributor guidance, final verification evidence, pushed feature branch, and reviewable PR.

- [ ] **Step 1: Update documentation**

In `docs/testing.md`, document:

- `make check-glossary` and `make check-glossary-build`;
- why the built contract runs in both PR audit and content-triggered deploy;
- the manual interaction checklist for instant search, combined filters, URL reload/back-forward, keyboard operation, responsive layout, zero results, text-only entries, and hotspot crops.

Add a short `AGENTS.md` invariant: Studio required rules do not enforce API writes or old documents, so the frontend validates every category and featured-entry requirement at build time; backfill published glossary documents before merging a newly required field.

Add `make check` to the README command table and audit the opening thesis, layout list, commands, component names, architectural claims, and total README length against current reality. Keep detailed glossary behavior in `docs/`, not the README.

- [ ] **Step 2: Run formatter before the documentation commit**

Run:

```bash
make format
cd studio && yarn format
```

Expected: formatters exit zero.

- [ ] **Step 3: Commit documentation**

```bash
git add README.md docs/testing.md AGENTS.md
git commit -m "docs: document glossary content contracts"
```

- [ ] **Step 4: Run fresh full verification**

Run:

```bash
make check
git diff --check origin/main...HEAD
git status --short
```

Expected: `make check` exits zero, diff check has no output, and status is clean.

- [ ] **Step 5: Verify interaction in the user's existing server**

Ask the user to refresh their already-running local server and verify the documented manual checklist. Do not start a second server. If any behavior fails, return to the owning task, add or strengthen an automated check where possible, and repeat `make check`.

- [ ] **Step 6: Review the complete diff**

Invoke `superpowers:requesting-code-review`. Resolve every confirmed issue and rerun `make check`. Confirm the diff includes no `.env`, generated `dist`, `.superpowers`, secret-bearing files, or unrelated user changes.

- [ ] **Step 7: Push and open the pull request**

```bash
git push -u origin feature/glossary-reference-library
gh pr create --title "feat: turn the glossary into a reference library" --body-file /private/tmp/glossary-reference-pr.md
```

The PR body must summarize the searchable directory, long-form entry model, EC exemplar, Sanity rollout, and verification evidence. Do not add Codex attribution.

- [ ] **Step 8: Keep the branch merge-ready**

Follow `superpowers:finishing-a-development-branch`; do not merge without explicit user approval. Once the PR merges, confirm `git diff origin/main <branch> --stat` is empty, remove the worktree even if squash merge makes ancestry checks warn, and fast-forward the main checkout with `git merge --ff-only origin/main`.
