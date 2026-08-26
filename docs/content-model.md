# Sanity content model

All content types are defined in `studio/schemaTypes/`. Sanity is the single source of truth — there are no Markdown content files in the repo, and everything is fetched at build time through the GROQ queries in `src/lib/sanity.ts`.

## Document types

| Document type | Purpose |
|---|---|
| `strain` | Cannabis strains — effects, terpenes, THC/CBD ranges, hero + gallery images |
| `product` | SKUs (flower, preroll, concentrate, edible) referencing a parent strain |
| `blogPost` | Blog posts with rich text body, tags, hero image, and a required `author` reference |
| `author` | Post authors — role, bio, photo, and `sameAs` profile links |
| `retailer` | Dispensary partners with address, contact info, products carried |
| `page` | Singleton pages (home, about, contact) with flexible body content — the home page's `heroImages` array is the crossfaded hero backdrop |
| `siteSettings` | Global config: title, logo, hero lockup, social links, contact info, age gate message |
| `retailerPage` | Wholesale singleton page: Cultivera storefront links, contact details, downloadable product sheets |
| `terpene` | Terpene reference documents — aroma, effects, foundIn, hero image |
| `glossaryTerm` | Glossary definitions, backlinked from the content that mentions them |

`blockContent` is also registered, but it is an object type used for rich text bodies, not a document. `tableBlock` is likewise an object type, available inside any `blockContent` body.

## Block content

`blockContent` is the shared rich-text array behind every body field. Beyond ordinary blocks it accepts:

| Member | Purpose |
|---|---|
| `image` | Inline figure with `alt` and `caption`. Both live **outside** `children`, so a GROQ audit shaped like `body[].children[...]` misses them entirely |
| `tableBlock` | Reference table: optional `caption`, a `headers` array, and `rows` of `cells`. One row may set `highlight` |
| `glossaryRef` | A mark, not a member. Annotates a span with a reference to a `glossaryTerm` or `terpene` |

### Tables carry plain strings, not rich text

`tableBlock` cells are plain strings on purpose: the content is setpoints and short labels, and nesting Portable Text inside cells would mean a second renderer and a much heavier editing surface for no gain. The practical consequence is that **a glossary link cannot live inside a table cell** — link the term in the prose around the table instead.

Captions are plain strings too. Anything that generates this content by templating markup has to skip captions, headers, and cells, or the markup publishes as literal text.

### A ragged table fails the build

`PortableTextTable.astro` throws when a row's cell count does not match the header count, because a ragged row silently shifts every later cell into the wrong column — worse than a missing table, since it still looks like data. The schema repeats the check as a Studio validation so an editor sees it while they can still fix it, but per the `rule.required()` gotcha below, only the renderer's throw actually stops bad content reaching the site.

Strain, product, blog post, author, terpene, and glossary pages are statically generated via `getStaticPaths()`.

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
