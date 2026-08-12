# Wholesale page with dual Cultivera storefronts

Date: 2026-08-12
Status: Approved, ready for implementation plan

## Problem

`/retailers` renders as a bare hero with no body content, while being the most
heavily promoted destination on the site: `Nav.astro` gives it a dedicated
accent-filled CTA treatment (`nav-retailers-cta`) and `Footer.astro` links it in
the site map.

The cause is not a styling or layout bug. **No `retailerPage` document exists in
the Sanity dataset.** A GROQ query for `*[_type == "retailerPage"]` against the
production dataset returns 0 documents.

`src/pages/retailers.astro` guards every section behind optional chaining
(`page?.intro &&`, `page?.contactEmail ||`, `page?.downloadables &&`). With
`getRetailerPage()` returning `null`, all three sections are skipped and the
hardcoded `"For Retailers"` fallback headline is the only thing rendered.

### Evidence

From the built output of a clean `make build` on `main`:

```
dist/retailers/index.html   5394 bytes   (vs 6549 for the far shorter about-us)
<h1>For Retailers</h1>
<h3> elements: 0
```

Zero `<h3>` elements confirms the absence of both the "Wholesale Inquiries" and
"Downloads" sections. The body is an empty `<div>`; the remaining bytes are nav,
footer, and `<head>` chrome.

This is a silent failure of exactly the shape the project standards warn about.
Nothing fails: not lint, not `astro check`, not the build. A `null` return is a
valid `RetailerPage | null`, so the type system is satisfied while the page is
functionally broken.

## Context: two storefronts, two license types

Northwest Local sells through two distinct Cultivera Market storefronts, serving
two different Washington license classes:

| Storefront | Slug | Buyer |
| --- | --- | --- |
| Retail market | `northwest-local-cannabis-llc` | I502 retailers stocking dispensary shelves |
| Wholesale market | `northwest-local-cannabis-llcwholesale_1` | Other producer/processors buying bulk material |

Both are under `https://wa.cultiveramarket.com/bm/market/<slug>/menu`.

### These URLs cannot be verified programmatically

Cultivera Market is a client-rendered SPA. The server returns an identical shell
for every path and resolves the slug in JavaScript afterward. Requests for both
real slugs and a deliberately fabricated control slug all returned byte-identical
responses:

```
200  bytes=7659  sha=af83e35a3506  northwest-local-cannabis-llc
200  bytes=7659  sha=af83e35a3506  northwest-local-cannabis-llcwholesale_1
200  bytes=7659  sha=af83e35a3506  this-slug-definitely-does-not-exist-9987
```

An HTTP status check against these URLs asserts nothing and fails open, the same
trap already documented for GROQ `match` in the project invariants. Do not add a
link-checker for these URLs on the assumption that a 404 would surface a typo. The
slugs are correct because the site operator confirmed them, and that is the only
available source of truth.

## Decisions

### 1. Reframe the page as "Wholesale", keep the `/retailers` route

A producer/processor buying bulk material is not a retailer. Presenting a P/P
storefront under a heading that reads "For Retailers" asks a buyer to self-identify
as something they are not.

The visible label becomes **"Wholesale"** in `Nav.astro`, `Footer.astro`, the
`<Layout title>`, and the Sanity `headline`. **The route stays `/retailers`**, so no
redirect is needed and no inbound link breaks. Renaming the route to `/wholesale`
was considered and rejected as a cosmetic gain that costs a redirect.

### 2. Model marketplaces as a repeatable array, not scalar fields

Add to `studio/schemaTypes/retailerPage.ts`:

```
marketplaces: array of {
  label:    string   // "Retailers", "Producer / Processors"
  audience: string   // one supporting line
  url:      url      // https scheme enforced
}
```

Two named scalar fields (`retailUrl`, `wholesaleUrl`) would hardcode the assumption
that there are exactly two channels, and adding a third would require a schema
change plus a Studio deploy. An array absorbs a third channel as pure content.

**Validation cannot live in the schema alone.** Per the project invariant, Sanity's
`rule.required()` is Studio-side only and does not stop writes via the HTTP API,
the MCP tools, or a script. `getRetailerPage()` in `src/lib/sanity.ts` must
therefore validate that every entry has a non-empty `label` and `url`, and throw
naming the offending array index when one does not.

### 3. Fail the build when the singleton is missing

`getRetailerPage()` returning `null` must throw, with a message naming the document
type and pointing at the Studio. A promoted nav CTA landing on a blank page should
break the build rather than deploy.

This matches existing precedent in the codebase: `GlossaryTerm.astro:25` throws on
an unresolved glossary reference, and `src/lib/links.ts:40` throws on an unparseable
profile URL, both with a comment explaining why silence is the worse outcome.

### 4. Extract the accent-fill CTA mechanic

`.nav-retailers-cta` is the fourth accent-filled, rounded, hover-transitioned
control in `src/styles/global.css`, alongside `.age-gate-button`,
`.filter-button.active`, and `.pagination-button.active`. The page CTA would be a
fifth.

Extract the shared mechanic (accent background, radius, hover transition) into one
class; let each call site keep its own sizing and spacing, which is where they
legitimately differ.

Scope limit: this covers the accent-fill mechanic and the new CTA only. Restyling
the filter and pagination components is adjacent refactoring the goal does not
need.

### 5. Microcopy states the login requirement plainly

Both storefronts are configured **not** publicly viewable. Cultivera's market
settings expose two independent toggles, "Want your Market to be publicly viewable?"
and "Want prices to also be publicly viewable?". Both are off by deliberate choice:
a publicly browsable market page renders company profile fields, and the operator
does not want the facility location that easily reachable.

So a logged-out visitor sees a login wall, not a menu. The CTA copy must say so
before the click rather than after:

> Browse our full menu on Cultivera Market. A licensed buyer account is required to
> view pricing and place orders.

This is a settings-dependent fact, not a property of the platform. If the markets
are ever made public, revisit this copy.

### 6. Ship the storefront links before the catalogs are stocked

The Cultivera catalogs are not built yet. The links ship anyway, live immediately,
at the operator's direction.

The considered alternative was an `available` boolean per marketplace entry,
matching the existing `strain.available` and `product.available` convention, which
would have captured the URLs now and revealed each card when its catalog was ready.
That was declined in favour of shipping.

Known consequence, accepted: a buyer who clicks through in the window before the
catalogs are stocked meets a login wall and then an empty menu. This is a content
timing issue, not a code defect. Do not add an `available` flag later without
asking; the decision was explicit.

## Page structure

```
                 WHOLESALE
      intro copy, who we sell to

  +---------------+  +------------------+
  | Retailers     |  | Producer /       |
  |               |  | Processors       |
  | dispensary    |  | bulk material    |
  | menu          |  | for extraction   |
  | [ SHOP -> ]   |  | [ SHOP -> ]      |
  +---------------+  +------------------+
   A licensed buyer account is required to
   view pricing and place orders

         WHOLESALE INQUIRIES
              email / phone

              DOWNLOADS
```

Cards render from the `marketplaces` array, so N entries lay out in a grid rather
than filling two hardcoded slots. The existing Wholesale Inquiries and Downloads
sections are unchanged and keep their current guards, since both remain genuinely
optional.

## Content to create

A `retailerPage` document must be created and published with: `headline`, `intro`,
both `marketplaces` entries, and wholesale `contactEmail` / `contactPhone`.

Copy must avoid em dashes and aphorisms, per the standing content preference.

## Sequencing

The build will require the document once change 3 lands, so the content must exist
before the code does. This inverts the usual ordering constraint for this repo.

1. Deploy the Studio schema with the new `marketplaces` field. Additive and safe.
2. Create and publish the `retailerPage` document. Safe: the current page renders
   intro and contact if present, so this is an improvement on its own.
3. Merge the Astro PR with the CTA rendering, the validation, and the relabel.

In that order the hard-fail never fires on `main`, and every step is independently
safe to stop at.

## Out of scope

- Renaming the `/retailers` route
- Restyling the filter and pagination button components
- A link checker for the Cultivera URLs, which cannot work against an SPA
- Any change to the `retailer` document type or the `/find-us` page, which cover
  dispensaries that carry the product and are unrelated to wholesale ordering
