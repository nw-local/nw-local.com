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
| `retailerPage` | Wholesale singleton page with downloadable product sheets |
| `terpene` | Terpene reference documents — aroma, effects, foundIn, hero image |
| `glossaryTerm` | Glossary definitions, backlinked from the content that mentions them |

`blockContent` is also registered, but it is an object type used for rich text bodies, not a document.

Strain, product, blog post, author, terpene, and glossary pages are statically generated via `getStaticPaths()`.

## Gotchas

### Strains link terpenes by string, not by reference

The strain page resolves the matching `terpene` document by slug at render time. A typo silently produces a ghost terpene that links nowhere, so check existing terpene names before adding a strain.

### `rule.required()` is Studio-side only

Sanity's `required()` validation stops a human clicking Publish in the Studio UI. It does **not** stop writes through the HTTP API, the MCP tools, or a script — those will happily create a document missing a required field, and nothing in lint, type-check, or the build will notice.

Any code path that creates documents has to enforce required fields itself. Adding a required field means auditing every writer: the `.claude/skills/` that create that document type, and anything in `scripts/`.

### Registering a type is not enough to edit it

A document type registered in `studio/schemaTypes/index.ts` but absent from the sidebar in `studio/structure.ts` exists in the dataset and renders on the public site, while being invisible in the Studio. `structure.ts` now appends any unlisted document type automatically under its raw type name, so this cannot recur — but a type showing up with an ugly lowercase name is the signal that it needs a proper entry.

### The dataset is public

`aclMode` is `public`: every document is world-readable without a token. Nothing private belongs in it — no personal email addresses or phone numbers, not even in fields intended as internal notes.
