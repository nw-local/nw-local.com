# Strains List: Newest/Oldest Sort with Newest Default

**Date:** 2026-08-07
**Status:** Approved (Approach A)

## Problem

The strains list (`src/pages/strains/index.astro`) offers only Name (A–Z / Z–A) sorting. There is no way to sort by when a strain was added, and the default order is effectively alphabetical (the GROQ `sortOrder asc` prefix is inert — every strain document has `sortOrder` 0 or null). New additions like Cherry Bomb are buried mid-list.

## Decision

"Newest" means **when the strain was added to the site**, driven by Sanity's built-in `_createdAt` timestamp. `nextHarvestDate` was rejected because it is optional and unset on most strains; `_updatedAt` was rejected because edits would reshuffle the order.

Newest-first becomes the default everywhere: the server renders cards newest-first, so the initial paint, no-JS view, and crawler view all match the default dropdown state with no client-side reflow on load.

## Changes

### 1. Data layer — `src/lib/sanity.ts`

- `getStrains()` GROQ: replace `order(sortOrder asc, name asc)` with `order(_createdAt desc)`.
- Add `_createdAt` to the projection and to the strain list item type consumed by the page.

### 2. Page — `src/pages/strains/index.astro`

- Card wrapper: add `data-created={strain._createdAt}`.
- Dropdown: add `Newest` as the **first, default** option and `Oldest` second, before the existing name options. Values: `created-desc`, `created-asc`.
- `sortCards()`: compare `data-created` values as plain strings — ISO 8601 timestamps sort lexicographically, no `Date` parsing needed.
- Delete the unreachable `thc-desc` / `thc-asc` branches (no `<option>` has ever offered them on this page).

### 3. Out of scope

- The `sortOrder` schema field stays as-is (unused, not our concern here).
- No THC sort options (explicitly declined in favor of deleting the dead branches).
- Blog list page sorting is untouched.

## Error handling

A card missing `data-created` sorts as the empty string (oldest). This cannot happen in practice — `_createdAt` is a Sanity system field present on every document — so no special handling is added.

## Testing

No test framework is configured. Verification is:

- `yarn astro check` — types stay clean (the new `_createdAt` field must flow through the central `Strain` type per the project's central-data-types convention).
- Manual check in the user's running dev server: default order is newest-first (Cherry Bomb first), switching to Oldest reverses it, name sorts still work, filters/search/pagination unaffected.
