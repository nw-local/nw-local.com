# Drop page redesign: lineage, certificates, availability, gallery

## Problem

The public Drop page (`/drops/<slug>/`) promises "each strain's lineage, package options, current availability, and verified certificate of analysis" and delivers almost none of it: strain groups are bare headings over product cards, there is no lineage, no availability beyond the drop-level badge, and no way to reach the four public certificate pages the buyer sheet already links. The page also looks nothing like the buyer sheet, which is the document buyers already know.

The website's `strain` document has no lineage field and the `drop` document has no certificate field, so both facts are missing at the content-model level, not just in the template.

## Decisions (made with the operator, 2026-09-02)

- Same structure as the buyer sheet, in the site's dark skin: cover, four-color index ribbon, one chapter per strain (layout "A": color-ruled header, lineage, facts column, photo beside copy, package cards).
- Potency shown on the page is the release certificate's calculated total THC (THCA × 0.877 + Δ9-THC), never the marketplace batch figure. The buyer sheet moves to the same basis in a later edition (Ops-side work).
- Availability is per-strain state only (Available / Sold out), derived from product `available` flags. No quantities on the public site.
- Lineage is a fact about the cultivar: a new `strain.lineage` field, shown on the strain page and in each chapter, backfilled from Ops for the September strains.
- Certificates are explicit references: `drop.coas`, one per strain, set from the launch snapshot's release COA ids. No lookup by strain name.
- Drop photography beyond the cover lives in a `drop.gallery` image array rendered as a grid between the body and the chapters, opening in the existing lightbox. Inline body images remain possible but are not used for September.
- The September body keeps its first paragraph and drops the second (wholesale availability caveat).

## Content model

`studio/schemaTypes/strain.ts`

- `lineage` — string, optional. Description: "Parent cross as printed on the buyer sheet, for example Grape Gas #10 × OGKB Blueberry Headband."

`studio/schemaTypes/drop.ts`

- `coas` — array of `reference` to `coa`, optional, `rule.unique()`. Description: "Release certificates for the lots in this drop, one per strain. Set by Northwest Local OPS from the launch snapshot."
- `gallery` — array of `image` with `alt` (required on each item), `options: { hotspot: true }`, same shape as `strain.gallery`. Description: "Release photography shown below the introduction."

No change to `coa`. Studio `required()` rules remain Studio-only; the build validates.

## Data layer (`src/lib/sanity.ts`, `src/lib/drops.ts`)

- `PRODUCT_SUMMARY_PROJECTION` strain sub-projection and the strain page projection gain `lineage`. `ProductStrainRef` and `StrainSummary` gain `lineage?: string`.
- `getDrop()` projects, in addition to today's fields:
  - `"coas": coas[defined(@->)]-> { sourceId, labResultId, status, publishedAt, totalThc { value, unit }, defined(strain) => { "strain": strain { name, url } } }`
  - `gallery[] { asset->, alt, crop, hotspot }`
- A strict validator `assertDropCoa(value: unknown): asserts value is DropCoa` in `src/lib/drops.ts` reuses the patterns of `src/lib/coa.ts` (exact keys, UUID `sourceId`, `status` in pass/fail, RFC3339 `publishedAt`, canonical-decimal `totalThc.value` with a non-empty unit, https `strain.url` when present). `getDrop()` runs it on every row and throws on failure so the build fails loudly.
- `groupDropStrains( drop, siteUrl )` in `src/lib/drops.ts` is pure and returns `{ chapters, unmatchedCoas }`:
  - chapters in product order, grouped by `strain._id` as today ("unassigned" last);
  - each chapter carries `strain` (name, slug, lineage, hero image, type), `products`, `available` (true when any product is available), `coa` (the COA whose `strain.url` equals `${siteUrl}/strains/${slug}/`, or undefined), and `index` (1-based) and `color` (from the fixed four-color palette by position; a fifth strain wraps);
  - `unmatchedCoas` lists every validated COA matched by no chapter.
- A static Astro endpoint `src/pages/drops/[...slug]/coas.json.ts` (same `getStaticPaths` as the page, same `getDrop()` + validator) emits `dist/drops/<slug>/coas.json` = the sorted list of referenced COA `sourceId`s. It exists so the built-page checker needs no Sanity access, and it is derived from the identical validated data the page rendered, so the two cannot disagree by construction. The endpoint is not linked from any page and carries no other fields.

## Page (`src/pages/drops/[...slug].astro` and components)

1. Cover: `DropCover.astro` — hero image 16:9 via `urlFor` with hotspot, bottom scrim, kicker "NW LOCAL · Licensed Washington flower", the drop name in the site heading lockup, then "Dropped/Dropping <date> · <status>" using the existing `DATE_LABELS` and `ProductBadge`.
2. Index ribbon: `DropIndexRibbon.astro` — one cell per chapter: color top rule, strain name, "<thc>% Total THC" when a COA is present; each cell is an in-page link to `#strain-<slug>`; 4-up, 2×2 under 720px.
3. Body: `PortableText` as today.
4. Gallery: `DropGallery.astro` — grid of `gallery` images (600-wide webp thumbnails, `loading="lazy"`), each opening the existing `ImageLightbox`; mixed orientation handled by `object-fit: cover` on a fixed aspect tile.
5. Chapters: `DropStrainChapter.astro` per chapter: `id="strain-<slug>"`; "0N / 0M" index; color rule; strain name as a link to the strain page; lineage in italic; facts column with "<thc>% Total THC" (omitted when no COA), the certificate link `<a data-drop-coa={sourceId} href={/coas/<sourceId>/}>Release COA · Pass|Fail</a>`, and the state badge; then strain hero (4:3, cover) beside the strain description; then the package cards (`ProductCard`, unchanged). No anchor sits inside a `.card`.
6. Unmatched certificates: when `unmatchedCoas` is non-empty, a trailing "Certificates of analysis" section lists each with the same `data-drop-coa` link, so a mismatch is visible.
7. Retailers section unchanged.
8. `DropCard.astro` (index page) adopts the cover treatment at card scale.

Styling: `.drop-*` rules in `src/styles/global.css` using existing tokens; the four label colors are custom properties set on each chapter root by the component. Print stylesheet untouched.

## Guards

- Vitest: `src/lib/drops.test.ts` for `assertDropCoa` (each rejection watched failing) and `groupDropStrains` (matching, state derivation, unmatched list, ordering, palette wrap); `src/components/DropStrainChapter.test.ts` renders the real component through the Astro Container API and asserts the COA link, lineage, THC, state badge, and that no anchor is nested in a `.card`.
- `scripts/check-drop-build.py` (+ `scripts/test-check-drop-build.py`, fixtures under `scripts/fixtures/`): for every `dist/drops/<slug>/index.html`, the set of `data-drop-coa` values equals the ids in `dist/drops/<slug>/coas.json`; every linked `/coas/<id>/index.html` exists; every chapter section carries a lineage element; every `<img src>` is on `cdn.sanity.io`. Counts use `grep -o | wc -l` semantics (an HTML parser, never `grep -c`). Malformed fixtures: a page missing one COA link; a manifest naming an id the page lacks; a chapter without lineage.
- Wiring: `check-drop-build` and `test-check-drop-build` join `make check`, `ci.yml`, and the content-sensitive checks in `deploy.yml` (a Sanity publish reaches deploy without CI).

## Data steps after the route deploys

1. `make deploy-studio`.
2. Backfill `strain.lineage` for Glitter Bomb, Grape Chimera, Sour Berry Boogie, Super Boof from the Ops launch snapshot.
3. Patch the September drop: `coas` = `coa.4fe31f2b-523b-43a6-be05-d7a9fa0507d3`, `coa.702f2e11-a8b1-4033-90e7-8fa8ff84bee4`, `coa.b1d339f9-1f6d-45df-96d0-141031de1dbd`, `coa.94cb0b41-cd62-44ef-914e-136bc28d3a37`; body reduced to paragraph one; `gallery` = six assets uploaded through the site's image upload path (hash-deduplicated), in this order with this alt text:
   1. IMG_0950 — "The full September lineup: Glitter Bomb, Sour Berry Boogie, Super Boof and Grape Chimera jars in eighth, quarter and ounce sizes, stacked three rows deep"
   2. IMG_0475 — "Frosty, purple-tinged flower with orange pistils filling an open ounce jar"
   3. IMG_0959 — "Glitter Bomb and Super Boof eighths with holographic Northwest Local lids in front of the rest of the lineup"
   4. IMG_0477 — "A Glitter Bomb jar held up to green and orange neon, the Northwest Local label lit from behind"
   5. IMG_0480 — "An open Super Boof jar beside its black lid, the holographic Northwest Local logo catching the light"
   6. IMG_0484 — "A Grape Chimera eighth held in a gloved hand against white"
4. Verify the live page: four COA links resolve, lineage on all four chapters, THC equals each COA page's total, six gallery images, no prices.

All writes run from files through the controlled-script pattern; nothing is typed by hand.

## Out of scope

Ops-side work, brainstormed separately: draft lifecycle and preview, `WebsiteDropPublication` and strain/product publishers, COA-sourced potency in snapshots and editions, September edition 3, the Grape Chimera marketplace THC discrepancy.
