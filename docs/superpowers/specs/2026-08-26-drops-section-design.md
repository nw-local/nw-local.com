# Drops section: design

Date: 2026-08-26
Status: approved, ready for implementation planning

## What a drop is

A drop is a limited release batch: a dated release event that bundles the
products from one or more harvests, sells while stock lasts, and then sells
out. It is the craft equivalent of a sneaker drop, not a marketing wrapper
around a strain launch and not a recurring event.

A drop spans several strains. Each product in a drop already references
exactly one strain, so the drop stores products only and the strain list is
derived from `products[]->strain`. One list to maintain, and the two can
never disagree.

## Relationship to the ops platform

`nw-local-ops` PR #145 shipped `apps/cultivation/`, which is the system of
record for harvests, lots, weights and allocations. Three facts from that
model constrain this design:

1. `Harvest.strain` is a single foreign key and `Lot.harvest` is a foreign
   key, so one lot is one strain. A website drop therefore sits one level
   above a lot: it is a release bundling lots from several harvests.
2. `Lot` carries two portal identifiers, `bamboo_lot_id` and
   `cultivera_inventory_id`. Which one is real depends on the portal the lot
   went to. PR #145 shipped a Critical caused by assuming a lot had only
   one, so the website must not reproduce that assumption with a single
   unqualified "batch number" field.
3. `Lot.Stage` runs `DRYING`, `CURING`, `TRIMMING`, `FINISHED`. There is no
   cure end date anywhere in ops, so a `curedUntil` field on the website
   would be a value no system can confirm or contradict.

**Decision: batch metadata is hand entered in Sanity, with a narrowed field
set.** No build time pull from the ops API and no push from ops into Sanity.
Both were considered and both are deferred: a pull couples every website
build and every Sanity webhook rebuild to ops uptime and needs an auth token
in GitHub Actions, and a push is a cross repository change with its own
overwrite semantics to settle. The accepted cost is that a typo in Sanity
drifts from ops silently.

**The Sanity dataset is `aclMode: public`,** so every published field is
world readable. Weights, plant counts, zone data and internal lot UUIDs are
not publishable through this surface regardless of how they are sourced.

## Content model

New `studio/schemaTypes/drop.ts`, registered in `studio/schemaTypes/index.ts`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | e.g. "Fall Harvest 2026" |
| `slug` | slug | yes | sourced from `name` |
| `description` | string, max 160 | yes | SEO excerpt, same contract as `blogPost.description` |
| `status` | string radio | yes | `upcoming` / `available` / `soldOut`, defaults to `upcoming` |
| `dropDate` | date | yes | release date, drives index ordering |
| `heroImage` | image, hotspot, `alt` required | no | |
| `lotIdentifier` | string | no | the identifier printed on the label |
| `lotPortal` | string radio | no | `bamboo` / `cultivera`, qualifies `lotIdentifier` |
| `harvestedAt` | date | no | maps to ops `Harvest.harvested_on` |
| `products` | array of refs to `product`, min 1, unique | yes | the batch itself |
| `retailers` | array of refs to `retailer` | no | who is stocking it |
| `body` | `blockContent` | no | long form copy about the batch |

Deliberate omissions:

- **No `sortOrder`.** `dropDate` is a real date with real meaning, so a
  manual tiebreaker would be a second ordering source that can contradict
  the first. `product` has `sortOrder` because SKUs have no inherent order.
- **No `curedUntil` and no derived cure length.** Nothing upstream can
  confirm it. Deriving "cured 24 days" from a hand typed date looks
  authoritative while asserting nothing, which is the fail open shape this
  repo has been bitten by repeatedly.
- **No `strains[]`.** Derived from `products[]->strain`.

`rule.required()` on `products` is Studio side only. The Content Lake accepts
API writes that violate it, which is how `blogPost.author` nearly shipped
without a byline in #34. So the data layer enforces it rather than rendering
an empty batch: `getDrops()` throws when a drop's `productIds` is empty, and
`getDrop()` throws when the dereferenced products array is empty after
dangling nulls are filtered out. The two checks are distinct because
`products[]._ref` still lists a reference whose target has been deleted.

Studio `description` hints are copy templates that teach editors house style,
so the examples in them follow the no em dash and US spelling conventions.

## Data layer

The seam is fetch versus derive. `sanity.ts` is already 561 lines and every
section so far has added types, queries and route helpers to it; deriving is
the only part that is pure, and therefore the only part verifiable without a
network call.

### `src/lib/sanity.ts` (fetch)

```ts
export type DropStatus = "upcoming" | "available" | "soldOut";

export interface DropSummary {
  _id: string;
  name: string;
  slug: SanitySlug;
  description: string;
  status: DropStatus;
  dropDate: string;
  heroImage?: SanityImage;
  productIds: string[];         // products[]._ref, dangling ones included
  liveProductCount: number;     // count(products[defined(@->)])
  strainIds: ( string | null )[];  // products[]->strain._ref, null when unset
}

export interface Drop extends DropSummary {
  lotIdentifier?: string;
  lotPortal?: "bamboo" | "cultivera";
  harvestedAt?: string;
  body?: PortableText;
  products: ProductSummary[];
  retailers?: Retailer[];
}

export async function getDrops(): Promise<DropSummary[]>;
export async function getDrop( slug: string ): Promise<Drop | null>;
```

`getDrops()` carries `productIds` and `strainIds` so a single fetch serves
both the index cards and the lookup maps. Two separate queries could disagree
with each other, one cannot. Card components simply do not destructure the id
arrays.

`productIds` and `liveProductCount` are both needed and legitimately disagree.
`productIds` keeps every raw reference, including one whose target no longer
resolves, because that is what lets `getDrops()` fail loudly on a drop whose
products were all deleted after publish. `liveProductCount` counts only what
still dereferences, which is what the detail page renders. Unpublishing one SKU
is a routine editor action and moves the two apart, so **any rendered count uses
`liveProductCount`**: `DropCard` counting refs would have claimed 6 products
against a page showing 5.

`strainIds` admits `null` because a product written through the API can have no
`strain` at all, and `strain._ref` then projects to null in place. The guard in
`buildDropLookup()` exists for that, and the type says so.

`Drop.products` is projected with the identical
`image { asset->, alt, crop, hotspot }` spelling as `getProducts()`. This is
deliberate: the two `product.image` projections that omitted `crop, hotspot`
were the ones that center cropped strain names off the jar labels. Identical is
now enforced structurally rather than by discipline: the braced projection body
lives in one module-level const, `PRODUCT_SUMMARY_PROJECTION`, that both call
sites interpolate, with `RETAILER_PROJECTION` doing the same for retailers.
Only the array source expression differs, which is the part that must
(`*[_type == "product"]` versus `products[defined(@->)]->`).

### `src/lib/drops.ts` (derive)

Pure functions, no client, no network.

```ts
export const DROP_BASE_PATH = "/drops";
export function dropHref( slug: SanitySlug ): string;
export interface DropRef { _id: string; name: string; slug: SanitySlug; status: DropStatus }
export function compareDropStrength( left: DropSummary, right: DropSummary ): number;
export function buildDropLookup( drops: DropSummary[] ): {
  byProductId: Map<string, DropRef>;
  byStrainId: Map<string, DropRef>;
};
```

Status labels live in `ProductBadge.astro`'s existing `LABELS` dictionary
alongside the strain type and category labels, not in a separate constant here.
One dictionary, one place to change a label.

`compareDropStrength` is exported because the collision rule and the index
ordering are the same question asked twice: strongest status first, then the
later `dropDate`.

**Collision rule.** When one product or strain belongs to several drops, the
map keeps the drop with the strongest status (`available`, then `upcoming`,
then `soldOut`), tie broken by the later `dropDate`. A strain in both a live
batch and a sold out old one badges as live, and the answer never depends on
the order Sanity happened to return rows in.

`dropHref()` living in `drops.ts` diverges from `authorHref()` and
`AUTHOR_BASE_PATH`, which live in `sanity.ts`. The fetch/derive seam is
judged the better line and the divergence is accepted knowingly.

## Pages and components

- **`src/pages/drops/index.astro`** mirrors `strains/index.astro`: `Hero`,
  then `FilterBar` with `filterAttribute="data-status"` and one button per
  drop status, then a `.card-grid` of `DropCard`s wrapped in
  `data-filter-item data-status={drop.status}`. Ordering is status group
  (available, upcoming, sold out) then `dropDate` descending, so the page
  opens on what is actually buyable. Empty state matches `products.astro`.
  The button labels are not written out here: `DROP_STATUS_LABELS` in
  `drops.ts` is the one dictionary for the visitor-facing wording of a status,
  and both this filter and `ProductBadge` read from it. Written twice, they
  drifted immediately, the filter reading "Available" under cards badged
  "Available Now". Its declaration order is the button order.
- **`src/pages/drops/[...slug].astro`** takes `getStaticPaths()` from
  `getDrops()` and the detail from `getDrop( slug )`, redirecting to `/drops`
  when missing, as the strain route does. Body: hero image, status badge, a
  small definition list of lot identifier (labeled by portal, so "Bamboo lot
  24-0812") and harvest date, `PortableText` body, products grouped by strain
  as `ProductCard` grids under `SectionHeading`s, then stocking retailers as
  `RetailerCard`s. Structured data is `buildBreadcrumbList` only.

  An earlier draft of this spec also called for `buildProduct` per product.
  That is unimplementable as written: `buildProduct` in `src/lib/jsonld.ts`
  takes a `Strain`, not a product, so there is nothing to call it with here.
  The drop page therefore carries breadcrumb structured data and no per
  product `Product` schema. Recorded rather than quietly dropped, so the
  absence is not later mistaken for a regression. Emitting `Product` schema
  per SKU would need a product shaped builder, which is its own change.
- **`src/components/DropCard.astro`** takes its `Props` from `sanity.ts` per
  the central data types convention. It wraps in `<a class="card">` like
  `StrainCard`, so the card anchor invariant binds: the status badge is a
  `<span>`, strain names inside are plain text, and no retailer links go in.
  That constraint is why retailer links appear only on the detail page.
- **`src/components/ProductBadge.astro`** gains three `LABELS` entries
  (`upcoming`, `available`, `soldOut`) plus `data-type` rules in
  `global.css`. Only `available` gets `--accent`, since accent is reserved
  for emphasis and three glowing badges in one grid spend it on nothing.
  Reusing the existing badge avoids a `DropBadge` that would differ only in
  its dictionary.

**Build cost.** Astro runs frontmatter once per generated page, so calling
`getDrops()` in a `[...slug].astro` frontmatter means one identical fetch per
page. Both `drops/[...slug].astro` and `strains/[...slug].astro` fetch in
`getStaticPaths()` and hand each page its slice through `props`, which runs
once per route file. This is preferred over module level memoization because
there is no cache to go stale in the dev server.

## Integration surfaces

- **Nav.** `{ href: "/drops", label: "Drops" }` added to `NAV_LINKS` after
  Products. The existing `startsWith` active state logic already handles
  `/drops/<slug>`. Nav layout work is explicitly out of scope.
- **Homepage.** A featured drop section showing the newest `available` drop,
  falling back to the newest `upcoming`, rendering nothing at all when
  neither exists. No empty shell. The section heading follows the status, so
  an upcoming drop is not announced as "Current Drop" above a card badged
  "Upcoming".
- **Strain pages.** When `byStrainId` has an entry, an "In this drop" link
  above the products section, with the `DropRef` arriving through
  `getStaticPaths()` props.
- **Product cards.** `ProductCard` gains an optional `drop?: DropRef` prop
  rendering a badge linking to the drop. `products.astro` and the strain page
  pass it, but they resolve it differently and must. `products.astro` reads
  `byProductId`, which is a per-SKU answer. The strain page's `byStrainId`
  entry only means "at least one product of this strain is in drop X", so it
  is right for the strain-level line and wrong for the cards: a drop holding
  the eighth and not the pre-roll would badge the pre-roll. The strain route
  therefore carries the winning drop's `productIds` through `getStaticPaths()`
  alongside the `DropRef` and tests membership per card. `getDrops()` stays in
  `getStaticPaths()`, which Astro runs once per route file, rather than in the
  frontmatter, which runs once per generated page. The drop detail page
  deliberately passes nothing, since every card there belongs to the drop
  already on screen. `ProductCard` is a plain `<div>` and
  already contains an anchor to the strain, so a second link is safe.

## Failure modes

- A drop published with zero live products throws in `getDrops()` and fails
  the deploy. That is intended under the no silent failures rule, and it does
  mean a bad publish turns the Actions run red rather than degrading quietly.
- A product referenced by a drop and then deleted in Sanity leaves a dangling
  `_ref`. GROQ dereferences it to `null` **in place**, keeping the array
  length, which was measured against this dataset rather than assumed:
  `count([{"_ref":"missing"}][]->)` returns 1 and the value is `[null]`. So the
  projection filters with `[defined(@->)]` before the arrow, and the dangling
  entry never reaches the page. Filtering after the arrow, `[]->[defined(@)]`,
  looks equivalent and does nothing: it still returns 1. That is the same
  fail-open shape as the GROQ `match` and Portable Text `children` traps.
  `productIds` deliberately keeps the raw references including dangling ones,
  which is what makes the two guards different signals: a drop whose every
  product was deleted still fails loudly in `getDrops()`.
- `status` is editor set, so a sold out batch reads "Available Now" until
  someone changes it. This is the accepted tradeoff, chosen over date derived
  status because there is no scheduled rebuild: `nightly.yml` audits and does
  not deploy, so anything computed from the build date freezes until the next
  Sanity publish.

## Ordering constraint

Code merges first, content second. A Sanity publish rebuilds against `main`,
so drop documents created before this PR merges would fetch into a site with
no `/drops` route. This is the inverse of a slug rename, which publishes
first.

## Verification

No test framework is configured, so the checks are:

- `yarn astro check` for types.
- `make build` and read the page count delta. Baseline on this branch before
  any change is **86 pages**. With zero drop documents the expected count is
  87: one index page and no detail pages.
- Assertions against `dist/` using `grep -o pattern file | wc -l`, never
  `grep -c`, because Astro minifies each page onto a single line and `grep -c`
  counts lines.
- `make check-content-style` for the both units and US spelling rules on any
  new copy.
- The audit workflow link checker for new internal links.
- A committed script under `scripts/` wired into `ci.yml` asserting the
  `buildDropLookup` collision rule: available beats sold out regardless of
  row order. This is the only piece with real logic, and the rule is exactly
  the kind that passes a smoke test by accident, so it needs a check that
  outlives the PR.

## Out of scope

- Nav layout and mobile wrapping beyond adding the link.
- Any change in `nw-local-ops`, including a lot or drop read endpoint.
- Linking Sanity `product` documents to ops `Sku` records. The two catalogs
  remain unlinked and nothing makes them agree.
- A separate sold out archive page. Status grouping on one index covers it
  until drop volume says otherwise.
- A `/new-drop` skill. If one is added later it must gather products itself,
  since Studio validation does not protect API writes.
