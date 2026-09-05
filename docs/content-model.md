# Sanity content model

All content types are defined in `studio/schemaTypes/`. Sanity is the single source of truth — there are no Markdown content files in the repo, and everything is fetched at build time through the GROQ queries in `src/lib/sanity.ts`.

## Document types

| Document type | Purpose |
|---|---|
| `strain` | Cannabis strains — effects, terpenes, THC/CBD ranges, hero + gallery images |
| `product` | SKUs (flower, preroll, concentrate, edible) referencing a parent strain |
| `drop` | Limited release batches: a dated release bundling products from one or more harvests, with an editor-set status |
| `blogPost` | Blog posts with rich text body, tags, hero image, and a required `author` reference |
| `author` | Post authors — role, bio, photo, optional direct email, and `sameAs` profile links |
| `retailer` | Dispensary partners with address, contact info, products carried |
| `page` | Singleton pages (home, about, contact) with flexible body content — the home page's `heroImages` array is the crossfaded hero backdrop |
| `siteSettings` | Global config: title, logo, hero lockup, social links, contact info, age gate message |
| `retailerPage` | Wholesale singleton page: Cultivera storefront links, contact details, downloadable product sheets |
| `terpene` | Terpene reference documents — aroma, effects, foundIn, hero image |
| `glossaryTerm` | Glossary definitions, backlinked from the content that mentions them |
| `coa` | Machine-owned public laboratory-result projection and paired certificate PDF |
| `pesticideDisclosure` | Machine-owned public per-lot pesticide application record |

`blockContent` is also registered, but it is an object type used for rich text bodies, not a document. `tableBlock` is likewise an object type, available inside any `blockContent` body.

## Homepage strain selection

The homepage’s “Latest Strains” section shows up to six published strains, newest first by Sanity `_createdAt`, with a “See all strains” link to `/strains`. Editing an existing strain does not move it to the front. With fewer than six strains, all are shown; with none, the section is omitted.

Strains have no editor-controlled `featured` field. Legacy values in existing documents are ignored by the site.

## Block content

`blockContent` is the shared rich-text array behind every body field. Beyond ordinary blocks it accepts:

| Member | Purpose |
|---|---|
| `image` | Inline figure with `alt` and `caption`. Both live **outside** `children`, so a GROQ audit shaped like `body[].children[...]` misses them entirely |
| `videoFile` | Inline self-hosted video: an MP4 `file`, an optional `poster` image, plus `alt` and `caption`. Renders a native `<video>` from the file asset's CDN url (`PortableTextVideo.astro`); `PORTABLE_TEXT_PROJECTION` dereferences it as `"src": file.asset->url` because `@sanity/image-url` cannot build file urls. Upload H.264/AAC MP4 via `make upload-file`, **never** the phone's `.mov`/HEVC, which most browsers refuse to play. Like `image`, `alt`/`caption` sit **outside** `children` |
| `tableBlock` | Reference table: optional `caption`, a `headers` array, and `rows` of `cells`. One row may set `highlight` |
| `glossaryRef` | A mark, not a member. Annotates a span with a reference to a `glossaryTerm` or `terpene` |

### Headings are linkable, and their ids come from their text

`h2` and `h3` inside a body render through `PortableTextHeading.astro`, which slugifies the heading's own text into an `id`. So "Daily schedule" is reachable at `/blog/<slug>/#daily-schedule`, and a cross-post link should point at the section rather than the top of the page.

Two consequences worth holding onto. **Rewording a heading changes its anchor**, and any link pointing at the old one silently degrades to landing at the top of the page rather than erroring, so grep the built `dist/` for the old fragment before renaming a heading other posts link to. And **two headings on one page must not slugify alike**: the browser jumps to whichever came first, which looks like the link worked. `make check-anchors` fails the build on that, since nothing else would notice.

The id is deliberately derived from the text rather than from the block's `_key`. `_key` is stabler, but `#h52` tells a reader nothing and survives nothing anyone would notice either.

### Tables carry plain strings, not rich text

`tableBlock` cells are plain strings on purpose: the content is setpoints and short labels, and nesting Portable Text inside cells would mean a second renderer and a much heavier editing surface for no gain. The practical consequence is that **a glossary link cannot live inside a table cell** — link the term in the prose around the table instead.

Emphasis therefore works per row, not per phrase. Setting `highlight` on a row renders its whole row bold, and that is the only emphasis channel a table has, so pick the row that carries the point rather than trying to stress a clause inside a cell. Use it once per table: highlighting everything highlights nothing.

Captions are plain strings too. Anything that generates this content by templating markup has to skip captions, headers, and cells, or the markup publishes as literal text.

### A line break in a cell is the one formatting channel

Cells carry no markup, but they do honor newlines: `TableCellText.astro` splits a cell on `\n` and renders each break as a real `<br>`, for column headers, row headers, and data cells alike. This exists for paired temperature units. `82 to 85 °F (28 to 29 °C)` is about twice as wide as the number it carries, so a table with a day and a night column wraps it at whatever point the column width lands on, splitting the pair somewhere arbitrary. Writing the conversion on its own line keeps the column narrow and the pair intact:

```
82 to 85 °F
(28 to 29 °C)
```

Two things follow. **`cells` is `text`, not `string`** — Sanity renders a string field as a single-line input that cannot accept a newline, so a cell written through the API would be uneditable in the Studio and could lose its break on the next save. Column *headers* are still `string` on purpose: a header short enough to be a good header never needs to break.

And the break is a `<br>` rather than `white-space: pre-line` on the cells. Both work — Astro's minifier does preserve a raw newline inside a `<td>` — but `pre-line` would put the intent in a CSS property that a later change to the table styles could drop silently, with no build failure and no visible diff outside the rendered page.

### A ragged table fails the build

`PortableTextTable.astro` throws when a row's cell count does not match the header count, because a ragged row silently shifts every later cell into the wrong column — worse than a missing table, since it still looks like data. The schema repeats the check as a Studio validation so an editor sees it while they can still fix it, but per the `rule.required()` gotcha below, only the renderer's throw actually stops bad content reaching the site.

Strain, product, blog post, author, terpene, and glossary pages are statically generated via `getStaticPaths()`.

### Drops carry explicit certificates, lineage, and gallery photography

A `drop` document's `coas` field is an explicit array of `coa` references, one per strain in the drop, set by Ops from the launch snapshot. The drop page never looks a certificate up by strain name: it matches each referenced `coa` to a chapter by exact `strain.url === ${siteUrl}/strains/${slug}/`, so a mismatched or stale reference renders as an unmatched certificate instead of attaching to the wrong strain. `strain.lineage`, a free-text field on `strain`, renders as the chapter's parentage line whenever it is present. `drop.gallery` is an array of release photography images, rendered as a keyboard-accessible thumbnail grid that opens `ImageLightbox.astro` — independent of the per-product images on `product.image`.

### Public COAs are an exact machine-owned contract

`coa` documents are written by Northwest Local OPS, not authored in Studio. Their stable identity is `coa.<sourceId>`, where `sourceId` is the immutable OPS laboratory-result UUID, and their required `publishedAt` records the publication act rather than a laboratory test time. The site fetch boundary audits the complete stored object at every public contract level before returning the separate buyer-safe projection, so unknown destination fields, duplicate routes, malformed timestamps, or non-deterministic IDs fail the build instead of producing a plausible partial certificate.

The public route is `/coas/<sourceId>/`. It renders the validated direct fetch, ordered panels and metrics, explicit metric statuses, publication time, and the Sanity-hosted certificate link. Raw WCIA payloads, operator provenance, storage keys, and private URLs are never part of the public `Coa` interface or page.

### Public pesticide disclosures are a second machine-owned contract

`pesticideDisclosure` documents are written by Northwest Local OPS (SP2), not authored in Studio, mirroring `coa`. They key on `lotCultiveraId` — the number printed on the jar — rather than an internal id, because that is the only identifier a buyer holding the physical package can read off it. The public route is `/pesticides/<lotCultiveraId>/`, alongside a browsable `/pesticides` index with client-side search.

Like `coa`, the type is registered but intentionally absent from the Studio sidebar in `structure.ts` — it is machine-owned, and `sanity.config.ts` auto-appends any unlisted document type under its raw type name rather than leaving it unreachable. And like the glossary and drop checks above, its content can change through a Sanity publish with no pull request, so `check-pesticide-disclosure-build.py` runs against the built `dist/` and gates `deploy.yml` before GitHub Pages receives the artifact.

## Gotchas

### Strains link terpenes by string, not by reference

The strain page resolves the matching `terpene` document by slug at render time. A typo silently produces a ghost terpene that links nowhere, so check existing terpene names before adding a strain.

### A glossary definition must stand alone

`shortDefinition` explains the term as it exists in the world. It may state a general fact about the term (calcium moves almost entirely by transpirational flow; anthocyanins are a flavonoid subclass). It may not reference the argument, conclusions, or framing of whatever article prompted it.

The failure mode is subtle, because an article-specific clause still reads as true. The original `Chlorophyll` entry ended on "which is why purpling can look sudden" — accurate, useful inside the post that prompted it, and meaningless to a reader who arrived from a search for "what is chlorophyll". Four of the first eight entries had to be rewritten for this in [#39](https://github.com/nw-local/nw-local.com/pull/39).

The term is also the entry point to a page of its own and gets cited from any post, so an entry written at one article ages badly the moment a second one links it. `shortDefinition` renders in the hover card, the A-Z index, and the term page, and is capped at 200 characters by `rule.required().max(200)`.

### `rule.required()` is Studio-side only

Sanity's `required()` validation stops a human clicking Publish in the Studio UI. It does **not** stop writes through the HTTP API, the MCP tools, or a script — those will happily create a document missing a required field, and nothing in lint, type-check, or the build will notice.

Any code path that creates documents has to enforce required fields itself. Adding a required field means auditing every writer: the `.claude/skills/` that create that document type, and anything in `scripts/`.

### Registering a type is not enough to edit it

A document type registered in `studio/schemaTypes/index.ts` but absent from the sidebar in `studio/structure.ts` exists in the dataset and renders on the public site, while being invisible in the Studio. `structure.ts` now appends any unlisted document type automatically under its raw type name, so this cannot recur — but a type showing up with an ugly lowercase name is the signal that it needs a proper entry.

### `retailerPage` is required for the build to succeed

Unlike every other content type, a missing or half-filled `retailerPage` fails the build rather than degrading. `getRetailerPage()` in `src/lib/sanity.ts` throws when the singleton is absent, when its `marketplaces` array is empty, and when any entry is missing a `label` or a `url`. Deleting that document, or removing its last storefront, breaks deploys site-wide until it is restored.

That is deliberate. The page is promoted by a dedicated CTA in the nav and a link in the footer, and every section on it is optional-chained, so before the guards existed a missing document rendered a bare hero and looked intentional. Nothing failed: not lint, not `astro check`, not the build. Failing loudly is the only way an operator finds out.

Both guards are verified by observed failure rather than by assertion. To re-check either, temporarily break the GROQ filter or project `"marketplaces": []`, confirm `make build` fails, then revert.

### The dataset is public

`aclMode` is `public`: every document is world-readable without a token. Nothing private belongs in it — no personal email addresses or phone numbers, not even in fields intended as internal notes.
