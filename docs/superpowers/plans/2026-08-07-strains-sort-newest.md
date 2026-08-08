# Strains List Newest/Oldest Sort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Newest/Oldest options to the strains list sort dropdown, with newest-first as the default order everywhere (server render, dropdown state, no-JS view).

**Architecture:** `getStrains()` orders by Sanity's `_createdAt desc` and exposes `_createdAt` through the central `StrainSummary` type. The page stamps each card wrapper with `data-created` and the existing client-side `sortCards()` gains two branches that compare the ISO 8601 strings lexicographically (ISO timestamps sort correctly as plain strings — no `Date` parsing). Dead `thc-*` sort branches and the unused `data-thc` attribute are removed.

**Tech Stack:** Astro 6 (SSG), Sanity GROQ, strict TypeScript. No test framework — verification is `yarn astro check` per task plus a manual check in the user's already-running dev server at the end.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-07-strains-sort-newest-design.md`
- Codebase style: spaces inside parens — `function name( arg )`, `if( condition )` (ESLint-enforced)
- Descriptive variable names only — no single-character identifiers
- Never boot a dev server; the user has one running
- `yarn astro check` must report 0 errors after every task

---

### Task 1: Data layer — order by and expose `_createdAt`

**Files:**
- Modify: `src/lib/sanity.ts:72-115` (`StrainSummary`, `getStrains()`, `getStrain()`)

**Interfaces:**
- Produces: `StrainSummary._createdAt: string` (required field, ISO 8601 timestamp) — Task 2 reads it as `strain._createdAt`. `getStrains()` now returns strains newest-first.

- [ ] **Step 1: Add `_createdAt` to `StrainSummary`**

In `src/lib/sanity.ts`, add the field directly under `_id` so the system fields sit together:

```ts
export interface StrainSummary {
  _id: string;
  _createdAt: string;
  name: string;
  slug: SanitySlug;
  strainType: StrainType;
  effects?: string[];
  terpenes?: string[];
  thcRange?: string;
  cbdRange?: string;
  nextHarvestDate?: string;
  heroImage?: SanityImage;
  featured?: boolean;
  available?: boolean;
}
```

`_createdAt` is required (not optional) because Sanity stamps it on every document; making it optional would push needless null-handling onto consumers.

- [ ] **Step 2: Update both strain GROQ projections**

`Strain extends StrainSummary`, so `getStrain()`'s projection must also fetch `_createdAt` or its declared return type would lie (per the memory rule: build against real GROQ output — a field in the type but not the projection is exactly that trap).

In `getStrains()`, change the order clause to `_createdAt desc` and add `_createdAt` to the projection:

```ts
export async function getStrains() {
  return sanityClient.fetch<StrainSummary[]>(
    `*[_type == "strain"] | order(_createdAt desc) {
      _id, _createdAt, name, slug, strainType, effects, terpenes,
      thcRange, cbdRange, nextHarvestDate,
      heroImage { asset->, alt, crop, hotspot },
      featured, available
    }`,
  );
}
```

In `getStrain()`, add `_createdAt` to the projection (order is irrelevant for a single document):

```ts
export async function getStrain( slug: string ) {
  return sanityClient.fetch<Strain | null>(
    `*[_type == "strain" && slug.current == $slug][0] {
      _id, _createdAt, name, slug, strainType,
      description[] ${PORTABLE_TEXT_PROJECTION},
      effects, terpenes, thcRange, cbdRange, nextHarvestDate,
      heroImage { asset->, alt, crop, hotspot },
      gallery[] { asset->, alt, crop, hotspot },
      featured, available
    }`,
    { slug },
  );
}
```

- [ ] **Step 3: Verify types are clean**

Run: `yarn astro check`
Expected: 0 errors, 0 warnings (hints are pre-existing and fine).

- [ ] **Step 4: Commit**

```bash
git add src/lib/sanity.ts
git commit -m "feat: order strains newest-first and expose _createdAt"
```

---

### Task 2: Strains page — sort options, data attribute, dead-code removal

**Files:**
- Modify: `src/pages/strains/index.astro:33-36` (dropdown), `:45-58` (card wrapper), `:118-133` (`sortCards()`)

**Interfaces:**
- Consumes: `strain._createdAt: string` from Task 1's `StrainSummary`.

- [ ] **Step 1: Add Newest/Oldest dropdown options, newest first**

The first `<option>` of a `<select>` is the default selection, which now matches the server-rendered order — no reflow on load. Replace the `<select>` contents:

```astro
<select id="strain-sort" class="strain-sort-select" aria-label="Sort strains">
  <option value="created-desc">Newest</option>
  <option value="created-asc">Oldest</option>
  <option value="name-asc">Name (A–Z)</option>
  <option value="name-desc">Name (Z–A)</option>
</select>
```

- [ ] **Step 2: Stamp `data-created` on card wrappers and drop dead `data-thc`**

In the card wrapper `<div>`, add `data-created` and delete the `data-thc` line (its only consumer is the dead sort branch removed in Step 3):

```astro
<div
  data-filter-item
  data-strain-type={strain.strainType}
  data-terpenes={strain.terpenes?.map( ( t: string ) => t.toLowerCase() ).join( "," )}
  data-name={strain.name.toLowerCase()}
  data-created={strain._createdAt}
  data-search={[ strain.name, strain.strainType, ...( strain.effects ?? [] ), ...( strain.terpenes ?? [] ) ].join( " " ).toLowerCase()}
>
  <StrainCard {...strain} />
</div>
```

- [ ] **Step 3: Rewrite `sortCards()` — add created branches, delete THC branches**

ISO 8601 timestamps sort correctly as plain strings, so `localeCompare` on the raw attribute value is enough. Replace the whole function:

```ts
function sortCards( cards: HTMLElement[] ): HTMLElement[] {
  const sortValue = sortSelect.value;
  return [ ...cards ].sort( ( cardA, cardB ) => {
    if( sortValue === "created-desc" ) {
      return ( cardB.dataset.created ?? "" ).localeCompare( cardA.dataset.created ?? "" );
    }
    if( sortValue === "created-asc" ) {
      return ( cardA.dataset.created ?? "" ).localeCompare( cardB.dataset.created ?? "" );
    }
    if( sortValue === "name-asc" ) {
      return ( cardA.dataset.name ?? "" ).localeCompare( cardB.dataset.name ?? "" );
    }
    if( sortValue === "name-desc" ) {
      return ( cardB.dataset.name ?? "" ).localeCompare( cardA.dataset.name ?? "" );
    }
    return 0;
  });
}
```

- [ ] **Step 4: Verify types and formatting**

Run: `yarn astro check`
Expected: 0 errors.

Run: `make format`
Expected: no rewrites of the touched files (paren-spacing style already matches); if it rewrites, re-stage.

- [ ] **Step 5: Commit**

```bash
git add src/pages/strains/index.astro
git commit -m "feat: add newest/oldest strain sort with newest as default"
```

---

### Task 3: End-to-end verification and PR

**Files:**
- None (verification + git only)

**Interfaces:**
- Consumes: the two commits above on branch `worktree-strains-sort-newest`.

- [ ] **Step 1: Full local check**

Run: `yarn astro check`
Expected: 0 errors. (No lint/format/test CI steps exist beyond this in `.github/workflows/deploy.yml` — the deploy workflow just builds; a successful `yarn build` is implied by a clean check but needs `.env`, which stays out of the worktree per secret-handling rules. The GitHub Actions build on the PR is the build verification.)

- [ ] **Step 2: Ask the user to verify in their running dev server**

The default view at `/strains` must show Cherry Bomb first (created 2026-08-05, newest of the 11 strains) and Gastro Pop last; switching to Oldest reverses; name sorts, filters, search, and pagination behave as before. Do not boot a dev server — the user has one running against the main checkout, so they may need to point it at the branch or trust the PR build.

- [ ] **Step 3: Push and open PR**

```bash
git push -u origin worktree-strains-sort-newest
gh pr create --title "Add newest/oldest sort to strains list (newest default)" --body "$(cat <<'EOF'
## Summary
- `getStrains()` now orders by `_createdAt desc` and exposes `_createdAt` through `StrainSummary`
- Strains list dropdown gains **Newest** (default) and **Oldest** options; cards carry `data-created` and sort by lexicographic ISO-timestamp comparison
- Removed unreachable `thc-desc`/`thc-asc` sort branches and the orphaned `data-thc` attribute

## Spec
`docs/superpowers/specs/2026-08-07-strains-sort-newest-design.md`

## Verification
- `yarn astro check`: 0 errors
- Manual: default order newest-first (Cherry Bomb first), Oldest reverses, name sorts/filters/search/pagination unchanged
EOF
)"
```
