# Blog Post Author Attribution

**Date:** 2026-08-11
**Status:** Approved
**Issue:** [#30](https://github.com/nw-local/nw-local.com/issues/30)

## Problem

Blog posts have no author attribution. `buildArticle()` in `src/lib/jsonld.ts` already emits an
`author`, but hardcoded as `{"@type": "Organization", name: publisherName}` — the site's own name
standing in for a byline. Nothing renders an author on the page, in cards, or in the RSS feed.

## Decisions

**Byline names a real person, not the brand.** A named human with a role and bio is a materially
stronger E-E-A-T signal than a faceless organization, which matters more in a regulated,
health-adjacent space than it would elsewhere.

**Author is a separate `author` document type, referenced from `blogPost`.** Edit the bio once and
every post picks it up. Follows the existing `product` → `strain` reference precedent
(`studio/schemaTypes/product.ts:24`). An inline object would duplicate the bio per post and drift;
a plain string would leave the bio, photo, and author page — the parts Google actually rewards —
off the table.

**Single reference, not an array.** Co-bylines are not a real need today, and widening one-to-many
later is a schema change plus a small template change, not a data migration.

**Authors get a page at `/authors/<slug>/`.** A resolvable `url` on the JSON-LD `Person` is what
converts a name into an identity Google can weigh. There is deliberately **no `/authors/` index
page** — with one author it would be a thin near-duplicate of the author page, and thin index pages
are an SEO liability. Revisit at 3+ authors.

**Dataset is public** (`aclMode: public` — every document is world-readable without a token), so the
author schema carries only intentionally-public fields. No email, no phone, not even "for internal
use only".

## Changes

### 1. Schema — `studio/schemaTypes/author.ts` (new)

| Field | Type | Notes |
|-------|------|-------|
| `name` | string | required |
| `slug` | slug | required, sourced from `name`, maxLength 96 |
| `role` | string | optional — e.g. "Founder & Head Grower" |
| `photo` | image (hotspot) | optional, with a **required** `alt`, matching the `heroImage` pattern in `blogPost.ts` |
| `bio` | `blockContent` | optional rich text, rendered by the existing `PortableText.astro` |
| `sameAs` | array of URL strings | optional, `rule.uri()` validated. Feeds schema.org `Person.sameAs` |

Registered in `studio/schemaTypes/index.ts`.

`blogPost` gains `author`: a `reference` to `author`, `validation: rule.required()`.

A `glossaryRef` inside an author bio creates no backlink, since `author` is not in
`GLOSSARY_MENTION_TYPES`. This matches the documented behavior for `product` bodies
(`src/lib/sanity.ts:267-270`) and needs no special handling.

### 2. Data layer — `src/lib/sanity.ts`

- `AuthorSummary { _id, name, slug, role?, photo? }` and `Author extends AuthorSummary { bio?, sameAs? }`,
  mirroring the existing `BlogPostSummary` / `BlogPost` split.
- `BlogPostSummary` gains `author?: AuthorSummary`; both blog queries project
  `author->{ _id, name, slug, role, photo { asset->, alt, crop, hotspot } }`.
- `getAuthors()` — for `getStaticPaths()`.
- `getAuthor( slug )` — full author including `bio` and `sameAs`.
- `getBlogPostsByAuthor( authorId )` — mirrors the existing `getProductsByStrain( strainId )` shape.
- `authorHref( slug )` exported alongside `glossaryMentionHref()`, so `/authors` is spelled once.

**Deliberate asymmetry: `author` is required in Sanity validation but optional in the TypeScript
type.** Code deploys before the content backfill (see Rollout), so there is a build window where the
existing post genuinely has no author. The optional TS type lets that build succeed rendering no
byline; the required Sanity validation makes it impossible to publish a post without an author going
forward. The gap closes at backfill and spans exactly one document.

### 3. Rendering

**`src/components/AuthorByline.astro` (new)** — small circular avatar + linked name + optional role.
Used in the blog post header.

**`src/pages/authors/[...slug].astro` (new)** — follows the `terpenes/[...slug].astro` shape:
`getStaticPaths()` from `getAuthors()`, then photo + name + role + `PortableText` bio, followed by
that author's posts as a `BlogPostCard` grid. Emits `Person` JSON-LD and a breadcrumb trail
(Home → Blog → Author), matching every other detail page.

**`src/pages/blog/[...slug].astro`** — renders `AuthorByline` in the header beside the date.

**`src/components/BlogPostCard.astro` and `src/components/FeaturedPost.astro`** — the existing date
line becomes `{formattedDate} · {author.name}`.

> **The byline on cards must be plain text, never a link.** Both components wrap their entire
> contents in `<a class="card">` (`BlogPostCard.astro:12`, `FeaturedPost.astro:13`), and nested
> `<a>` elements are invalid HTML — browsers break the outer link. Only the post header and the
> author page may link to an author.

Every byline surface renders conditionally on the author being present, so the pre-backfill build
renders exactly as it does today — no empty "By" label, no placeholder.

### 4. SEO — `src/lib/jsonld.ts`

Rename the existing `AuthorRef` (currently hardcoded to `{"@type": "Organization"}`) to
`OrganizationRef` — it describes an organization, not an author role — and make `ArticleSchema.author`
a union:

```ts
export interface PersonRef {
  "@type": "Person";
  name: string;
  url?: string;
  image?: string;
  jobTitle?: string;
  sameAs?: string[];
}
export type ArticleAuthor = PersonRef | OrganizationRef;
```

`buildArticle()` emits a `PersonRef` with `url` = `/authors/<slug>/` when the post has an author,
**falling back to the current Organization output when it does not** — so the pre-backfill build
emits today's output rather than an `Article` missing its author.

`buildPerson()` (new) backs the author page: `Person` with name, url, image, `jobTitle`, `sameAs`,
and a `description` from the bio via the existing `portableTextToPlainText()`. Added to the
`StructuredData` union.

**Targeted refactor:** `buildArticle()` takes 4 positional params today; the author photo URL would
make 5, with `heroImageUrl` and `authorImageUrl` as adjacent optional strings — a swap-by-accident
footgun. Convert it to a single options object. One call site, so the change is contained.

### 5. RSS — `src/pages/rss.xml.ts`

Not the per-item `author` field: `@astrojs/rss` types it as *"The item author's email address"*
(`dist/index.d.ts:42`), per RSS 2.0, where `<author>` must be an email. A plain name there is
spec-invalid. Instead:

- `xmlns: { dc: "http://purl.org/dc/elements/1.1/" }` on the feed
- per item: `customData: <dc:creator>…</dc:creator>`

`customData` is injected raw and unescaped, so the name passes through a local `escapeXml()` — an
`&` in a name would otherwise emit a malformed feed that some readers reject outright.

### 6. Docs

Add the `author` row to the Sanity Content Model table in `CLAUDE.md`.

## Out of scope

- `/authors/` index page (see Decisions).
- Co-author / multi-author support.
- Author bio card at the end of each post — the byline links to the author page instead.
- Widening `GLOSSARY_MENTION_TYPES` to include `author`.

## Rollout

Publish/rebuild ordering applies: a Sanity publish rebuilds against `main`, so code must merge first.

1. Merge the code PR to `main`. Deploy runs green with no author on the existing post; no byline renders.
2. `make deploy-studio` so the Studio exposes the new type.
3. Create the `author` document — name, role, bio, photo. **Still needed from the user:** the role
   and bio text. The photo is prepared (see Author photo below).
4. Patch and republish `why-cannabis-turns-purple` with the reference, which triggers the rebuild
   that lights everything up.

Issue #29 is open (webhook still points at the pre-rename repo path), so verify the deploy actually
fires after the step-4 publish and fall back to a manual `workflow_dispatch` if it does not.

### Author photo

Prepared at `Dropbox/Northwest Local Cannabis/www/Blog/Authors/_processed/ben-petty.jpg`
(2316×3088 portrait), following the `_processed/` convention `prep-images.sh` already writes to.

The source carries **EXIF orientation tag 6** while `sips -g orientation` reports `<nil>` — `sips`
reads a different metadata slot than the actual EXIF IFD0 tag. The prepared file has the orientation
baked into the pixels and the tag dropped, so no renderer in the chain can disagree about which way
is up. Anything re-deriving this asset must bake orientation the same way rather than trusting
`sips`.

Uploaded at full resolution via `make upload-image`. The Sanity `hotspot` (approximately
`x: 0.46, y: 0.50`) lets `urlFor()` derive both the small circular byline avatar and the larger
author page image from the single asset, so no pre-cropped square is uploaded.

`upload-image.sh` warns that portrait images "will be cropped on the strain page" — a false positive
here, since the check assumes every upload is a strain hero. Author portraits make portrait a
legitimate shape, so the warning gets scoped to stop firing on non-hero uploads.

## Testing

No test framework is configured. Verification is:

- `yarn astro check` — types stay clean, and the new `author` field must flow through the central
  types per the project's central-data-types convention.
- `make build` — succeeds both before and after the backfill.
- Read the built `dist/rss.xml` and the article page's JSON-LD block to confirm real emitted output
  rather than assuming it.
- Manual check in the user's running dev server: byline in the post header links to the author page;
  card bylines are plain text; the author page lists the author's posts.
