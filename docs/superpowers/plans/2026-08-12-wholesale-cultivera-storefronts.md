# Wholesale Page with Dual Cultivera Storefronts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the blank `/retailers` page into a Wholesale page that sends licensed buyers to the correct Cultivera Market storefront for their license type.

**Architecture:** A repeatable `marketplaces` array on the existing `retailerPage` Sanity singleton drives a grid of call-to-action cards, reusing the established `.card` / `.card-grid` system. The data layer stops returning `null` for a missing singleton and throws instead, so a promoted page can never ship blank again. The accent-fill button mechanic, currently duplicated across several rules, is extracted into one shared class.

**Tech Stack:** Astro 6 (SSG, strict TypeScript), Sanity CMS, GROQ, plain CSS custom properties, yarn.

## Global Constraints

- **No test framework exists in this repo.** Do not add one. The verification cycle for every task is `yarn astro check`, `make build`, and grep assertions against the built HTML in `dist/`. This is a real assertion surface for a static site generator: the build either produces the expected markup or it does not.
- **Never start the dev server.** `make dev` is hard-blocked by a hook. Browser-level confirmation must be requested from the operator, who keeps a server running.
- **House style is spaced parens:** `function name( arg )` and `if( condition )`. ESLint enforces this; `make format` rewrites tight-paren code automatically.
- **`studio/` is a separate project with opposite style:** no semicolons, single quotes, `bracketSpacing: false`, tight parens `(rule) => rule.required()`. The root ESLint config ignores `studio/**`, so `make format` will not touch it and must not be relied on there.
- **Astro preserves template whitespace, unlike JSX.** Hug expression braces tightly against surrounding tags. Spreading `<h3>{expr}</h3>` across multiple lines emits stray whitespace text nodes and changes rendered output.
- **No em dashes, aphorisms, or swagger in published copy.** Applies to all Sanity content and any user-facing string in a component.
- **Never publish the facility street address.** City and region are acceptable; street address and coordinates are not.
- **No TypeScript `as` assertions.** Use type guards or narrowing.
- **No `eslint-disable` comments.**
- **Do not add an `available` / launch-gating flag to marketplace entries.** This was explicitly considered and declined. The links ship live against unstocked catalogs by operator decision.

## File Structure

| File | Responsibility | Change |
| --- | --- | --- |
| `studio/schemaTypes/retailerPage.ts` | Studio authoring shape for the singleton | Modify: add `marketplaces` array |
| `src/lib/sanity.ts` | Types, GROQ projection, and integrity validation | Modify: add marketplace type, project the field, throw on missing singleton and malformed entries |
| `src/styles/global.css` | Theme and shared component classes | Modify: extract `.btn-accent`, add marketplace card rules |
| `src/pages/retailers.astro` | Wholesale page composition | Modify: render marketplace cards, drop now-dead optional chaining |
| `src/components/AgeGate.astro` | Age gate overlay | Modify: class list only |
| `src/components/Nav.astro` | Primary nav | Modify: class list and CTA label |
| `src/components/Footer.astro` | Footer site map | Modify: relabel link text |
| Sanity `retailerPage` document | The content itself | Create and publish |

No new components. A marketplace card is nine lines of markup used in exactly one place; extracting a `MarketplaceCard.astro` for a single call site would add indirection without a second consumer to justify it. If a third surface ever renders these cards, extract at that point.

## Sequencing Constraint

Task 3 makes the build **require** the `retailerPage` document. The content must therefore exist before that code lands, which inverts this repo's usual ordering. Tasks 1 and 2 create the schema and the document first. Do not reorder.

---

### Task 1: Add the marketplaces field to the Studio schema

**Files:**
- Modify: `studio/schemaTypes/retailerPage.ts`

**Interfaces:**
- Consumes: nothing
- Produces: a `marketplaces` array field on `retailerPage`, each entry an object with `label` (string, required), `audience` (string, optional), `url` (url, required, https only)

- [ ] **Step 1: Add the field**

Insert this block into the `fields` array in `studio/schemaTypes/retailerPage.ts`, immediately after the `contactPhone` field and before `downloadables`. Note the studio style: single quotes, no semicolons, tight parens, `bracketSpacing: false`.

```ts
    defineField({
      name: 'marketplaces',
      title: 'Marketplaces',
      description:
        'Cultivera Market storefronts. Rendered as call-to-action cards in the order listed.',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            defineField({
              name: 'label',
              title: 'Label',
              type: 'string',
              description: 'The buyer type this storefront serves, e.g. "Retailers".',
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: 'audience',
              title: 'Audience Line',
              type: 'string',
              description: 'One supporting line describing what this storefront carries.',
            }),
            defineField({
              name: 'url',
              title: 'Storefront URL',
              type: 'url',
              validation: (rule) => rule.required().uri({scheme: ['https']}),
            }),
          ],
          preview: {select: {title: 'label', subtitle: 'audience'}},
        },
      ],
    }),
```

- [ ] **Step 2: Type-check the studio project**

`studio/package.json` defines no `lint` script, so check it directly.

Run: `cd studio && npx tsc --noEmit`
Expected: no output, exit 0.

- [ ] **Step 3: Lint the studio project**

Run: `cd studio && npx eslint .`
Expected: no output, exit 0.

- [ ] **Step 4: Commit**

```bash
git add studio/schemaTypes/retailerPage.ts
git commit -m "feat(studio): add marketplaces array to retailerPage schema"
```

- [ ] **Step 5: Deploy the Studio**

The hosted Studio at https://nw-local.sanity.studio/ must carry the new field before the operator can edit marketplace entries by hand.

Run: `make deploy-studio`
Expected: deploy completes and reports the studio URL.

---

### Task 2: Create and publish the retailerPage document

**Files:**
- Create: one `retailerPage` document in the Sanity `production` dataset (project `nyd3p2n0`)

**Interfaces:**
- Consumes: the `marketplaces` field shape from Task 1
- Produces: the singleton that `getRetailerPage()` requires from Task 3 onward

This task is content, not code. It uses the Sanity MCP tools. Note that the dataset is world-readable and publishing fires the deploy webhook, so this content goes live within a couple of minutes.

- [ ] **Step 1: Confirm no document already exists**

Query with `mcp__Sanity__query_documents`, resource `{"projectId": "nyd3p2n0", "dataset": "production"}`, perspective `raw`:

```groq
*[_type == "retailerPage"]
```

Expected: 0 documents. If any exist, stop and patch the existing one rather than creating a duplicate. This singleton has no uniqueness enforcement.

- [ ] **Step 2: Create the document**

Use `mcp__Sanity__create_documents`. Copy avoids em dashes and states the login requirement before the click, per the spec.

```json
{
  "_type": "retailerPage",
  "headline": "Wholesale",
  "intro": [
    {
      "_type": "block",
      "_key": "introOne",
      "style": "normal",
      "markDefs": [],
      "children": [
        {
          "_type": "span",
          "_key": "introOneSpan",
          "marks": [],
          "text": "Northwest Local Cannabis is a licensed Washington producer and processor in Thurston County. We grow small-batch indoor flower and make pre-rolls and concentrates for licensed retailers and for other producer/processors."
        }
      ]
    },
    {
      "_type": "block",
      "_key": "introTwo",
      "style": "normal",
      "markDefs": [],
      "children": [
        {
          "_type": "span",
          "_key": "introTwoSpan",
          "marks": [],
          "text": "Ordering runs through Cultivera Market. Choose the storefront that matches your license type."
        }
      ]
    }
  ],
  "contactEmail": "benny@nw-local.com",
  "contactPhone": "+1 (206) 353-9874",
  "marketplaces": [
    {
      "_type": "object",
      "_key": "marketRetail",
      "label": "Retailers",
      "audience": "Flower, pre-rolls, and concentrates for licensed retail shelves.",
      "url": "https://wa.cultiveramarket.com/bm/market/northwest-local-cannabis-llc/menu"
    },
    {
      "_type": "object",
      "_key": "marketWholesale",
      "label": "Producer / Processors",
      "audience": "Bulk material for extraction and manufacture.",
      "url": "https://wa.cultiveramarket.com/bm/market/northwest-local-cannabis-llcwholesale_1/menu"
    }
  ]
}
```

The two URLs differ only in the slug, and the second one (`northwest-local-cannabis-llcwholesale_1`) is easy to mistype. Copy them verbatim. They cannot be validated by any automated check, because Cultivera Market is a client-rendered SPA that returns an identical shell for every path including nonexistent slugs.

- [ ] **Step 3: Publish the document**

Use `mcp__Sanity__publish_documents` with the `_id` returned by Step 2.

- [ ] **Step 4: Verify the published shape**

Query with perspective `published`:

```groq
*[_type == "retailerPage"][0]{headline, "marketplaceCount": count(marketplaces), marketplaces[]{label, url}}
```

Expected: `headline` is `"Wholesale"`, `marketplaceCount` is `2`, and both entries have a non-empty `label` and a `url` on `wa.cultiveramarket.com`.

---

### Task 3: Project and validate marketplaces in the data layer

**Files:**
- Modify: `src/lib/sanity.ts:486-509`

**Interfaces:**
- Consumes: the published document from Task 2
- Produces: `RetailerPageMarketplace` interface (`label: string`, `audience?: string`, `url: string`); `getRetailerPage()` now returns `Promise<RetailerPage>` rather than `Promise<RetailerPage | null>`

- [ ] **Step 1: Add the marketplace interface**

In `src/lib/sanity.ts`, directly above the existing `RetailerPage` interface:

```ts
export interface RetailerPageMarketplace {
  label: string;
  audience?: string;
  url: string;
}
```

- [ ] **Step 2: Add the field to the RetailerPage interface**

Add `marketplaces` between `contactPhone` and `downloadables`:

```ts
export interface RetailerPage {
  headline?: string;
  intro?: PortableText;
  contactEmail?: string;
  contactPhone?: string;
  marketplaces?: RetailerPageMarketplace[];
  downloadables?: RetailerPageDownloadable[];
}
```

- [ ] **Step 3: Project the field and add validation**

Replace the whole `getRetailerPage` function with:

```ts
export async function getRetailerPage() {
  const page = await sanityClient.fetch<RetailerPage | null>(
    `*[_type == "retailerPage"][0] {
      headline, intro[] ${PORTABLE_TEXT_PROJECTION},
      contactEmail, contactPhone,
      marketplaces[] { label, audience, url },
      "downloadables": downloadables[] { label, "url": file.asset->url }
    }`,
  );

  // Both the nav and the footer promote /retailers, and every section on that
  // page is optional-chained. A missing singleton therefore renders a blank page
  // behind the most prominent CTA on the site, and nothing else fails: not lint,
  // not astro check, not the build. Fail the build instead.
  if( !page ) {
    throw new Error(
      "No retailerPage document found in Sanity. "
      + "Create and publish one in the Studio before building.",
    );
  }

  // Studio validation is not enforced by the Content Lake, so an entry written
  // through the HTTP API, the MCP tools, or a script can be missing either field
  // and would render an unlabelled card or a link to nowhere.
  page.marketplaces?.forEach( ( marketplace, index ) => {
    if( !marketplace.label?.trim() || !marketplace.url?.trim() ) {
      throw new Error(
        `retailerPage.marketplaces[${index}] is missing a label or a url. `
        + "Both are required to render a storefront card.",
      );
    }
  } );

  return page;
}
```

- [ ] **Step 4: Type-check**

Run: `yarn astro check`
Expected: 0 errors. The return type narrowing from `RetailerPage | null` to `RetailerPage` is source-compatible with `src/pages/retailers.astro`, which currently uses optional chaining. That redundant chaining is cleaned up in Task 5, not here.

- [ ] **Step 5: Build and confirm the throw does not fire**

Run: `make build`
Expected: build succeeds, 56 pages. If it fails with "No retailerPage document found", Task 2 did not publish. Return to Task 2 and finish it before continuing.

- [ ] **Step 6: Prove the guard actually works**

A guard that never fires under test is indistinguishable from a guard that is broken. Temporarily change the GROQ filter in `getRetailerPage` from `_type == "retailerPage"` to `_type == "retailerPageNope"`, then:

Run: `make build`
Expected: build FAILS with `No retailerPage document found in Sanity.`

Revert the filter to `_type == "retailerPage"` and re-run `make build`. Expected: succeeds again.

- [ ] **Step 7: Format, lint, commit**

```bash
make format
yarn lint
git add src/lib/sanity.ts
git commit -m "feat: project marketplaces and fail the build on a missing retailerPage"
```

---

### Task 4: Extract the accent-fill CTA mechanic

**Files:**
- Modify: `src/styles/global.css:163-174` and `src/styles/global.css:277-293`
- Modify: `src/components/AgeGate.astro` (class list only)
- Modify: `src/components/Nav.astro:43` (class list only)

**Interfaces:**
- Consumes: nothing
- Produces: a `.btn-accent` class owning accent background, radius, and hover background. Task 5 applies it to the storefront CTA.

**Critical specificity note.** `.nav-links a` is specificity (0,1,1), one class plus one element. `.nav-retailers-cta` is (0,1,0), so the nav rule wins and the `!important` flags on `color`, `font-weight`, and `transition` exist to beat it. A plain `.btn-accent` at (0,1,0) would lose the same fight. The shared class may therefore own only `background`, `border-radius`, and `:hover` background, which `.nav-links a` never sets. **The nav call site must keep its `!important` trio.** Removing them reverts the nav CTA to grey uppercase link styling.

- [ ] **Step 1: Add the shared class**

Insert immediately above the `/* --- Cards (shared) --- */` comment at `src/styles/global.css:569`:

```css
/* --- Accent CTA (shared) --- */

/* The accent fill, radius, and hover shared by every call-to-action control.
   Call sites keep their own sizing, which is where they legitimately differ:
   the nav CTA is compact, the age gate and storefront buttons are full size.
   This class deliberately omits color, font-weight, and transition: at (0,1,0)
   it would lose to `.nav-links a` at (0,1,1), so the nav call site sets those
   three with !important instead. */
.btn-accent {
  background: var(--accent);
  border-radius: 4px;
}

.btn-accent:hover {
  background: var(--accent-hover);
}
```

- [ ] **Step 2: Slim the nav CTA rule**

Replace `src/styles/global.css:163-174` with:

```css
.nav-retailers-cta {
  color: var(--bg) !important;
  padding: 0.4rem 1rem;
  font-weight: 700 !important;
  transition: background 0.2s !important;
}
```

The `background`, `border-radius`, and `:hover` rules now come from `.btn-accent`. Keep the class name: it names the route it points at, `/retailers`, which is unchanged by this work. Renaming it to match the new visible label would add diff noise for zero behavior change.

- [ ] **Step 3: Slim the age gate button rule**

Replace `src/styles/global.css:277-293` with:

```css
.age-gate-button {
  color: var(--bg);
  border: none;
  padding: 0.75rem 2rem;
  font-size: 1rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  cursor: pointer;
  transition: background 0.2s;
}
```

- [ ] **Step 4: Apply the class at both call sites**

In `src/components/Nav.astro:43`, change the class attribute only. Leave the link text alone in this task; Task 6 relabels it.

```astro
      <a href="/retailers" class="nav-retailers-cta btn-accent">For Retailers</a>
```

In `src/components/AgeGate.astro`, find the element carrying `class="age-gate-button"` and change it to:

```astro
class="age-gate-button btn-accent"
```

- [ ] **Step 5: Build and assert both call sites carry the class**

```bash
make build
grep -c "age-gate-button btn-accent" dist/index.html
grep -c "nav-retailers-cta btn-accent" dist/index.html
```

Expected: build succeeds; each grep prints `1`.

- [ ] **Step 6: Assert the shared rule reached the bundled CSS**

```bash
grep -rc "btn-accent" dist/_astro/*.css
```

Expected: a non-zero count.

- [ ] **Step 7: Format, lint, commit**

```bash
make format
yarn lint
git add src/styles/global.css src/components/Nav.astro src/components/AgeGate.astro
git commit -m "refactor: extract the accent-fill CTA mechanic into .btn-accent"
```

- [ ] **Step 8: Request a browser check**

This is a visual refactor and the build cannot confirm it renders correctly. Starting the dev server is blocked by policy. Ask the operator to confirm in the server they already have running that the nav CTA is still a green pill with dark text, and that the age gate button is unchanged. Do not mark this task complete until they confirm.

---

### Task 5: Render the storefront cards

**Files:**
- Modify: `src/pages/retailers.astro`
- Modify: `src/styles/global.css` (append marketplace card rules)

**Interfaces:**
- Consumes: `getRetailerPage()` returning non-nullable `RetailerPage` from Task 3; `.btn-accent` from Task 4; the existing `.card`, `.card-grid`, `.card-body` system
- Produces: the rendered page. Nothing downstream consumes this.

- [ ] **Step 1: Add the card styles**

Append to `src/styles/global.css`, after the `.btn-accent` block added in Task 4:

```css
.marketplace-card-cta {
  display: inline-block;
  margin-top: 1rem;
  padding: 0.5rem 1.25rem;
  color: var(--bg);
  font-weight: 700;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 1px;
  transition: background 0.2s;
}

.marketplace-note {
  margin-top: 1rem;
  color: var(--text-secondary);
  font-size: 0.85rem;
}
```

- [ ] **Step 2: Rewrite the page**

Replace the whole of `src/pages/retailers.astro` with the following. Two things changed beyond the new section: `page?.` became `page.` throughout, because Task 3 made the return non-nullable and the optional chaining is now dead code that would mislead a reader into thinking the null case is still live. The `<Layout>` title and description are updated here as part of the same deliverable.

Note the tight expression braces on `<h3>` and the `<span>`. Astro preserves template whitespace, so spreading these across lines changes the rendered output.

```astro
---
import Layout from "../layouts/Layout.astro";
import Hero from "../components/Hero.astro";
import PortableText from "../components/PortableText.astro";
import ContactInfo from "../components/ContactInfo.astro";
import { getRetailerPage } from "../lib/sanity";

const page = await getRetailerPage();
---

<Layout title="Wholesale" description="Wholesale ordering for licensed Washington retailers and producer/processors.">
  <Hero title={page.headline ?? "Wholesale"} />

  <div style="max-width:var(--content-width);">
    {page.intro && <PortableText value={page.intro} />}

    {page.marketplaces && page.marketplaces.length > 0 && (
      <section style="margin-top:2rem;">
        <div class="card-grid">
          {page.marketplaces.map( marketplace => (
            <a class="card" href={marketplace.url} target="_blank" rel="noopener">
              <div class="card-body">
                <h3>{marketplace.label}</h3>
                {marketplace.audience && <p>{marketplace.audience}</p>}
                <span class="btn-accent marketplace-card-cta">Shop on Cultivera</span>
              </div>
            </a>
          ) )}
        </div>
        <p class="marketplace-note">A licensed buyer account is required to view pricing and place orders.</p>
      </section>
    )}

    {( page.contactEmail || page.contactPhone ) && (
      <section style="margin-top:2rem;">
        <h3 style="text-transform:uppercase;letter-spacing:2px;font-size:0.85rem;color:var(--accent);margin-bottom:1rem;">Wholesale Inquiries</h3>
        <ContactInfo email={page.contactEmail} phone={page.contactPhone} />
      </section>
    )}

    {page.downloadables && page.downloadables.length > 0 && (
      <section style="margin-top:2rem;">
        <h3 style="text-transform:uppercase;letter-spacing:2px;font-size:0.85rem;color:var(--accent);margin-bottom:1rem;">Downloads</h3>
        <ul style="list-style:none;display:grid;gap:0.75rem;">
          {page.downloadables.map( ( download: { label: string; url: string }) => (
            <li>
              <a href={download.url} target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:0.5rem;">
                {download.label}
              </a>
            </li>
          ) )}
        </ul>
      </section>
    )}
  </div>
</Layout>
```

- [ ] **Step 3: Type-check**

Run: `yarn astro check`
Expected: 0 errors.

- [ ] **Step 4: Build and assert the rendered output**

```bash
make build
grep -c "Shop on Cultivera" dist/retailers/index.html
grep -c "wa.cultiveramarket.com" dist/retailers/index.html
grep -o "northwest-local-cannabis-llcwholesale_1" dist/retailers/index.html
grep -c "licensed buyer account is required" dist/retailers/index.html
```

Expected: build succeeds; the first two greps print `2`; the third prints the wholesale slug once; the fourth prints `1`.

- [ ] **Step 5: Assert the page is no longer a stub**

The original defect was a page with an `<h1>` and nothing else. Confirm it now has section headings:

```bash
grep -c "<h3" dist/retailers/index.html
```

Expected: `3` or more. Before this work it was `0`.

- [ ] **Step 6: Assert both links open safely**

Every storefront link is `target="_blank"` and must carry `rel="noopener"` to prevent the opened page from reaching back through `window.opener`.

```bash
grep -o 'target="_blank" rel="noopener"' dist/retailers/index.html | wc -l
```

Expected: at least `2`.

- [ ] **Step 7: Format, lint, commit**

```bash
make format
yarn lint
git add src/pages/retailers.astro src/styles/global.css
git commit -m "feat: render Cultivera storefront cards on the wholesale page"
```

---

### Task 6: Relabel the page to Wholesale

**Files:**
- Modify: `src/components/Nav.astro:43`
- Modify: `src/components/Footer.astro:23`

**Interfaces:**
- Consumes: nothing
- Produces: nothing downstream

The route stays `/retailers`. Only the visible label changes, so no redirect is needed and no inbound link breaks.

- [ ] **Step 1: Relabel the nav CTA**

In `src/components/Nav.astro:43`, change the link text only. The `href` and both classes stay as they are:

```astro
      <a href="/retailers" class="nav-retailers-cta btn-accent">Wholesale</a>
```

- [ ] **Step 2: Relabel the footer link**

In `src/components/Footer.astro:23`:

```astro
      <a href="/retailers">Wholesale</a>
```

- [ ] **Step 3: Build and assert the label changed everywhere**

```bash
make build
grep -rl "For Retailers" dist/ | head
```

Expected: no output. The string should appear nowhere in the built site. If it appears, a third reference exists that this plan missed; find and update it.

- [ ] **Step 4: Assert the new label and the unchanged route**

```bash
grep -c ">Wholesale<" dist/index.html
grep -c 'href="/retailers"' dist/index.html
```

Expected: the first prints `2` (nav and footer); the second prints `2`.

- [ ] **Step 5: Assert the route still resolves**

```bash
test -f dist/retailers/index.html && echo "route intact"
```

Expected: `route intact`.

- [ ] **Step 6: Format, lint, commit**

```bash
make format
yarn lint
git add src/components/Nav.astro src/components/Footer.astro
git commit -m "feat: relabel the retailers page as Wholesale"
```

---

### Task 7: Full verification and pull request

**Files:** none modified

- [ ] **Step 1: Run the full CI-equivalent check locally**

Lint, type-check, and build are separate CI steps that fail independently.

```bash
make format
yarn lint
yarn astro check
make build
```

Expected: all four clean, build reports 56 pages.

- [ ] **Step 2: Confirm no unrelated page changed**

The whitespace-preservation invariant means a stray edit can silently alter many pages. Confirm the diff is scoped:

```bash
git diff --stat main...HEAD
```

Expected: only the files named in the File Structure table, plus the two docs files.

- [ ] **Step 3: Request the browser check**

Ask the operator to confirm in their running dev server: the Wholesale nav pill still renders green with dark text, `/retailers` shows two storefront cards side by side that collapse to one column on mobile, and both cards open the correct Cultivera storefront in a new tab.

Do not proceed until they confirm. The build can prove the markup is present; it cannot prove it looks right.

- [ ] **Step 4: Push the branch**

```bash
git push -u origin worktree-wholesale-cultivera-storefronts
```

- [ ] **Step 5: Open the pull request**

Run as a separate command from the push. A guard false-positives on compound commands containing the word "main".

```bash
gh pr create --title "Wholesale page with dual Cultivera storefronts" --body "$( cat <<'EOF'
## Problem

`/retailers` rendered as a bare hero because no `retailerPage` document existed in
Sanity. Every section on the page was optional-chained, so a null singleton
degraded to an empty div rather than failing. Nothing caught it: not lint, not
`astro check`, not the build. Meanwhile the nav promoted that page with a
dedicated accent CTA and the footer linked it.

## Changes

- Reframe the page as **Wholesale**, addressing both buyer types. The route stays
  `/retailers`, so no redirect is needed and no inbound link breaks.
- Add a repeatable `marketplaces` array to the `retailerPage` schema, rendering
  one CTA card per Cultivera storefront: one for retailers, one for other
  producer/processors.
- `getRetailerPage()` now throws when the singleton is missing, and validates that
  every marketplace entry has a label and a url. Sanity's `rule.required()` is
  Studio-side only and does not bind API or MCP writes, so the data layer enforces
  it too.
- Extract the accent-fill CTA mechanic into `.btn-accent`, previously duplicated
  across the nav CTA and the age gate button.

## Notes for review

- The `!important` flags on `.nav-retailers-cta` are load-bearing. `.nav-links a`
  is specificity (0,1,1) and wins against a bare class, so `.btn-accent` owns only
  `background`, `border-radius`, and `:hover`.
- The Cultivera URLs cannot be link-checked. The platform is a client-rendered SPA
  that returns an identical shell for every path, including nonexistent slugs, so
  an HTTP status check would assert nothing and fail open.
- The storefront catalogs are not stocked yet. Shipping the links live against
  empty menus is a deliberate decision, recorded in the spec.

Spec: `docs/superpowers/specs/2026-08-12-wholesale-cultivera-storefronts-design.md`
EOF
)"
```

---

## Self-Review

**Spec coverage.** Every numbered decision in the spec maps to a task: reframe as Wholesale with the route unchanged (Tasks 5 and 6), repeatable marketplaces array (Tasks 1 and 3), data-layer validation because `rule.required()` does not bind API writes (Task 3), fail the build on a missing singleton (Task 3, with Step 6 proving the guard fires), extract the accent-fill mechanic (Task 4), login-wall microcopy (Task 5), ship links before catalogs are stocked with no launch-gating flag (recorded in Global Constraints as a do-not-add). The spec's sequencing constraint is honored by ordering schema and content ahead of the code that requires them.

**Placeholder scan.** No unfilled sections, no deferred-action vocabulary, no "similar to Task N" cross-references, and no vague instructions like "add appropriate error handling". Every code step carries the literal code to write. Both Cultivera URLs appear in full rather than abbreviated, since the wholesale slug is not reconstructible from the retail one.

**Type consistency.** `RetailerPageMarketplace` is defined in Task 3 Step 1 with `label: string`, `audience?: string`, `url: string`, and consumed in Task 5 as `marketplace.label`, `marketplace.audience`, `marketplace.url`. The Studio field names in Task 1 (`label`, `audience`, `url`) match the GROQ projection in Task 3 and the JSON in Task 2. `.btn-accent` is defined in Task 4 Step 1 and applied in Task 4 Step 4 and Task 5 Step 2 under the same name. `getRetailerPage()` narrows to `Promise<RetailerPage>` in Task 3, and Task 5 drops the optional chaining that narrowing makes dead.

**Known verification gap.** No task can prove the CSS renders correctly. Tasks 4 and 7 both stop and ask the operator for a browser check rather than claiming visual correctness from a passing build.
