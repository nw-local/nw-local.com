# Glossary of terms — design

**Date:** 2026-08-04
**Status:** approved

## Problem

Articles like [Why Cannabis Turns Purple](https://www.nw-local.com/blog/why-cannabis-turns-purple)
use scientific vocabulary — anthocyanin, senescence, VPD, flavylium, MBW complex — with no way to
lead a reader to a definition. A reader who doesn't know a term either guesses or leaves.

## Decisions

Three decisions were settled before design:

1. **Reading experience** — a term is a real link to its own page, *plus* a hover/focus card
   showing the short definition inline. The card is progressive enhancement; the link works
   without it.
2. **Authoring** — a Sanity reference annotation, not hand-typed URLs and not build-time
   auto-detection. Renaming a term or changing a slug can never break a citation.
3. **Relationship to terpenes** — `terpene` is untouched. A new `glossaryTerm` type sits beside it
   and the annotation can reference *either*, so `myrcene` links to its existing rich terpene page
   while `anthocyanin` links to a glossary entry. No migration, no duplicate content, no URL
   changes.

## Data model

### New document: `glossaryTerm`

| Field | Type | Required | Notes |
|---|---|---|---|
| `term` | string | yes | Canonical name, e.g. "Anthocyanin" |
| `slug` | slug | yes | Sourced from `term` |
| `shortDefinition` | text | yes | Max 200 chars. Powers the hover card and the index. |
| `body` | blockContent | no | Longer explanation shown on the term page |

Deliberately lean. No `category`, `aliases`, or `relatedTerms` — those are guesses about future
need. Add them when something concrete wants them.

### New annotation: `glossaryRef`

Added to `blockContent`'s `marks.annotations`, beside the existing `link`:

```ts
{
  name: 'glossaryRef',
  title: 'Glossary term',
  type: 'object',
  fields: [
    {
      name: 'term',
      type: 'reference',
      to: [ { type: 'glossaryTerm' }, { type: 'terpene' } ],
      validation: (rule) => rule.required(),
    },
  ],
}
```

`terpene` already has `tagline`, which plays the same role as `shortDefinition`. Terpene hover cards
therefore work with **no change to the terpene schema**.

## Fetching

The annotation stores a reference. Unresolved, the renderer receives an ID and has nothing to
display, so every query returning `blockContent` must dereference its `markDefs`.

`blockContent` is used by six document types: `blogPost.body`, `page.body`, `product.description`,
`retailerPage.body`, `strain.description`, `terpene.description`. Only two queries currently project
`markDefs` at all.

Rather than add a seventh inconsistent variation, extract one exported projection fragment in
`src/lib/sanity.ts` and use it everywhere blockContent is fetched:

```groq
body[] {
  ...,
  markDefs[] {
    ...,
    _type == "glossaryRef" => {
      ...,
      term-> {
        _type,
        "slug": slug.current,
        "label": coalesce(term, name),
        "summary": coalesce(shortDefinition, tagline)
      }
    }
  },
  _type == "image" => { asset->, alt, caption }
}
```

`coalesce` normalises the two document shapes (`term`/`name`, `shortDefinition`/`tagline`) so the
renderer sees one uniform object regardless of which type it points at.

The href is derived from `_type`: `terpene` → `/terpenes/<slug>`, otherwise `/glossary/<slug>`.

## Rendering

`src/components/GlossaryTerm.astro`, registered as `components.mark.glossaryRef` in
`PortableText.astro` — the same components map that already handles `image`.

**No JavaScript.** Structure:

```html
<span class="glossary">
  <a href={href} class="glossary-term" aria-describedby={tipId}><slot /></a>
  <span class="glossary-tip" id={tipId} role="tooltip">…</span>
</span>
```

The card is revealed by `:hover` and `:focus-within` on the wrapper. Keyboard support comes free;
on touch, where hover never fires, the tap simply follows the link — the agreed fallback.

Styling uses a dotted underline rather than the solid accent used for ordinary links, so a
definition reads as a different kind of link.

**Edge handling — changed during implementation.** The design accepted that a left-anchored card
could sit tight against the viewport edge. In practice a term near the right of the column pushed
the card off screen entirely and the definition became unreadable, so that was not acceptable.

Resolved with CSS anchor positioning (`position-anchor` + `position-try-fallbacks: flip-inline`)
behind an `@supports` guard, which flips the card to the other side of the term when it would
overflow. Still zero JavaScript. Browsers without anchor positioning keep the left-anchored
fallback, which is the originally-specified behaviour.

**Failure mode:** a `glossaryRef` whose reference did not resolve throws at build time naming the
offending mark key, rather than rendering a link to nowhere. Matches `PortableTextImage`.

## Pages

- **`/glossary`** — terms alphabetically with their short definitions, plus a pointer across to
  `/terpenes`.
- **`/glossary/[slug]`** — term, short definition, optional body, and **backlinks**: the posts that
  cite this term, via `*[_type == "blogPost" && references(^._id)]`. This makes the glossary a way
  into the writing, not just out of it.
- **Footer link only, not the main nav.** `Terpenes` sets that precedent, and the nav is already at
  8 items and wrapping to three rows on mobile.

## Out of scope

- Auto-detecting terms in body text.
- Aliases/synonyms — unnecessary while annotation is manual, since the author picks the term
  regardless of the surface wording.
- Backlinks from any type other than `blogPost`.

## Verification

- `yarn astro check`, `make lint`, `make build` clean.
- Build against real published content and grep `dist/` for the rendered markup — not a fixture.
  (A fixture using the wrong shape is what shipped the broken `_ref` build on 2026-08-04.)
- Render at a true 390px viewport via a sized iframe, not `--window-size`, which floors at ~500px on
  macOS and crops rather than reflows.
