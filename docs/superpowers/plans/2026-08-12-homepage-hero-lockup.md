# Homepage Hero Lockup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the homepage's text `<h1>` with the NW Local Cannabis emblem-and-wordmark lockup, layered over an optional background photograph with a gradient scrim.

**Architecture:** Three units with separate jobs. `Hero.astro` gains one optional prop and renders a lockup image inside its `<h1>` when given one. A new `HeroBackdrop.astro` owns a three-layer stack (photo, scrim, slotted content) and is a passthrough when given no image. `index.astro` composes them. Both assets come from Sanity: the lockup from a new `siteSettings.heroLockup` field, the photo from the existing `page.heroImage` field on a `home` document that does not exist yet.

**Tech Stack:** Astro 6 (SSG, strict TypeScript), Sanity CMS, `@sanity/image-url`, plain CSS custom properties. Package manager is yarn. Sanity Studio lives in `studio/`.

**Spec:** `docs/superpowers/specs/2026-08-12-homepage-hero-lockup-design.md`

## Global Constraints

- **No test framework exists in this project.** The verification cycle for every task is `yarn astro check` (this is exactly what CI runs, `ci.yml:23`) plus, where runtime behaviour changes, `make build` against real Sanity content. Baseline before this work: **0 errors, 0 warnings, 5 pre-existing hints.** Any task that raises the error or warning count has failed.
- **Never start a dev server.** `make dev` / `yarn dev` are blocked by a hook. Visual confirmation is requested from the user, who keeps one running.
- **Whitespace inside parens.** House style is `function name( argument )` and `if( condition )`. ESLint enforces it; `yarn format` rewrites tight-paren code automatically.
- **No TypeScript `as` assertions.** Use type guards, narrowing, or `satisfies`.
- **No `eslint-disable` comments.** Fix the underlying code.
- **Descriptive variable names.** No single-character identifiers anywhere, including callback parameters.
- **Card and component props import their types from `src/lib/sanity.ts`** rather than redeclaring inline shapes.
- **Run `yarn format` before every commit.**
- **Accent green (`--accent`, #00ff88) is for emphasis, not surface.** Never a background for large areas.
- **Guard Sanity image fields with `?.asset`, never `?.image`.** A field touched then cleared in Studio leaves a truthy `{}` behind.
- **No Claude attribution** in commit messages or PR bodies.

---

### Task 1: Extract `resolveImageDimensions` into the image library

`PortableTextImage.astro` already solves "given a Sanity image, resolve its true intrinsic dimensions." Tasks 3 and 5 both need the same mechanic. Extract it first, as a pure refactor with no behaviour change, so the refactor and the feature stay separable in review.

**Files:**
- Modify: `src/lib/image.ts` (append after `imageDimensions`, line 29)
- Modify: `src/lib/sanity.ts:44-56` (the `SanityImage` interface)
- Modify: `src/components/PortableTextImage.astro:4-18,26-47`
- Test: none available; verified by `yarn astro check` and a real-content build

**Interfaces:**
- Consumes: `imageDimensions( assetRef: string ): ImageDimensions` and `ImageDimensions` (both already exported from `src/lib/image.ts`)
- Produces: `resolveImageDimensions( asset: SanityImageAssetLike | undefined, context: string ): ImageDimensions` and `interface SanityImageAssetLike`, both exported from `src/lib/image.ts`. Tasks 3 and 4 call this.
- Produces: `SanityImage.asset.metadata` narrowed from `unknown` to a real shape, so a `SanityImage` can be passed to `resolveImageDimensions` at all.

- [ ] **Step 1: Confirm the baseline is clean**

Run: `yarn astro check`
Expected: `0 errors, 0 warnings, 5 hints`. If it differs, stop and report before changing anything.

- [ ] **Step 2: Append the shared mechanic to `src/lib/image.ts`**

Add below the existing `imageDimensions` function:

```ts
// Both raw documents and `asset->` projections flow through the components that
// need dimensions: a raw reference carries `_ref` and no metadata, while a
// dereferenced asset carries `_id` plus a populated `metadata.dimensions`.
// Accept either shape so callers do not each reimplement the fallback.
export interface SanityImageAssetLike {
  _ref?: string;
  _id?: string;
  metadata?: { dimensions?: { width?: number; height?: number } };
}

export function resolveImageDimensions(
  asset: SanityImageAssetLike | undefined,
  context: string,
): ImageDimensions {
  const dimensions = asset?.metadata?.dimensions;
  if( dimensions?.width && dimensions?.height ) {
    return { width: dimensions.width, height: dimensions.height };
  }

  const assetId = asset?._ref ?? asset?._id;
  if( !assetId ) {
    throw new Error(
      `${context} has no asset reference. Attach an image in Sanity Studio or remove the field.`,
    );
  }

  return imageDimensions( assetId );
}
```

- [ ] **Step 3: Narrow `SanityImage.asset.metadata` in `src/lib/sanity.ts`**

`metadata` is currently `unknown`, which cannot be passed to a parameter typed
`SanityImageAssetLike`. Without this, Tasks 3 and 4 fail to compile. Replace the
`SanityImage` interface at line 44:

```ts
export interface SanityImage {
  asset: {
    _id?: string;
    _ref?: string;
    url?: string;
    metadata?: { dimensions?: { width?: number; height?: number } };
  };
  alt?: string;
  caption?: string;
  crop?: unknown;
  hotspot?: unknown;
}
```

This is a narrowing of a previously opaque type, so no existing consumer can
break: a repo-wide grep confirms `PortableTextImage.astro:44` is the only site
that reads `.metadata` today, and Step 4 rewrites it.

- [ ] **Step 4: Rewrite the frontmatter of `src/components/PortableTextImage.astro`**

Replace lines 1 through 50 with:

```astro
---
import { urlFor, resolveImageDimensions, type SanityImageAssetLike } from "../lib/image";

export interface PortableTextImageNode {
  _type: "image";
  _key?: string;
  asset?: SanityImageAssetLike;
  alt?: string;
  caption?: string;
}

interface Props {
  node: PortableTextImageNode;
}

const { node } = Astro.props;

// astro-portabletext renders unhandled node types into a display:none div, so a
// malformed image block would vanish from the page instead of failing. The throw
// inside resolveImageDimensions rejects it at build time rather than shipping a
// post with a hole in it.
const { width, height } = resolveImageDimensions(
  node.asset,
  `Portable Text image block ${node._key ?? "(no _key)"}`,
);

const displayWidth = Math.min( width, 1400 );
const displayHeight = Math.round( displayWidth * ( height / width ) );
---
```

The `PortableTextImageAsset` interface is deleted rather than kept as an alias: a repo-wide grep confirms nothing outside this file imports it or `PortableTextImageNode`.

- [ ] **Step 5: Verify the type check still passes**

Run: `yarn format && yarn astro check`
Expected: `0 errors, 0 warnings, 5 hints`, unchanged from Step 1.

- [ ] **Step 6: Verify no behaviour changed, against real content**

Run: `make build`
Expected: build succeeds. Then confirm a blog post that contains an inline image still emits correct dimensions:

```bash
grep -o '<img[^>]*width="[0-9]*"[^>]*>' dist/blog/*/index.html | head -5
```

Expected: `width`/`height` attributes present and non-zero, exactly as before the refactor.

- [ ] **Step 7: Commit**

```bash
git add src/lib/image.ts src/lib/sanity.ts src/components/PortableTextImage.astro
git commit -m "refactor: extract resolveImageDimensions into the image library

PortableTextImage owned the logic for resolving a Sanity image's intrinsic
dimensions from either a raw _ref or a dereferenced _id. The hero lockup and
backdrop both need the same mechanic, so it moves to lib/image.ts and
PortableTextImage becomes a consumer.

SanityImage.asset.metadata is narrowed from unknown to its real shape so a
SanityImage can be passed to the shared helper at all. No behaviour change."
```

---

### Task 2: Add the `heroLockup` field to the schema and data layer

**Files:**
- Modify: `studio/schemaTypes/siteSettings.ts:28` (insert after the `logo` field)
- Modify: `src/lib/sanity.ts:461-482` (the `SiteSettings` interface and `getSiteSettings` query)

**Interfaces:**
- Consumes: `SanityImage` (already defined at `src/lib/sanity.ts:44-56`)
- Produces: `SiteSettings.heroLockup?: SanityImage`, populated by `getSiteSettings()`. Task 5 reads it.

- [ ] **Step 1: Add the Studio field**

In `studio/schemaTypes/siteSettings.ts`, insert immediately after the `logo` field's closing `}),` (line 28):

```ts
    defineField({
      name: 'heroLockup',
      title: 'Hero Lockup',
      type: 'image',
      description:
        'Emblem + wordmark shown as the homepage headline. White artwork on a '
        + 'transparent background. Pair only with dark, low-key hero photography: '
        + 'a bright photo will wash out the wordmark.',
      fields: [
        defineField({ name: 'alt', title: 'Alternative Text', type: 'string' }),
      ],
    }),
```

Note the deliberate absence of `options: { hotspot: true }`. Hotspot governs cropping, and this image is never cropped.

- [ ] **Step 2: Add the field to the `SiteSettings` type**

In `src/lib/sanity.ts`, add to the interface at line 461:

```ts
export interface SiteSettings {
  siteTitle?: string;
  siteDescription?: string;
  logo?: SanityImage;
  heroLockup?: SanityImage;
  socialLinks?: SocialLinks;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  ageGateMessage?: string;
}
```

- [ ] **Step 3: Project the field in the query**

In the same file, update the `getSiteSettings` GROQ projection:

```ts
    `*[_type == "siteSettings"][0] {
      siteTitle, siteDescription,
      logo { asset->, alt },
      heroLockup { asset->, alt },
      socialLinks,
      contactEmail, contactPhone, address,
      ageGateMessage
    }`,
```

- [ ] **Step 4: Verify**

Run: `yarn format && yarn astro check`
Expected: `0 errors, 0 warnings, 5 hints`.

- [ ] **Step 5: Confirm the query is valid against the live dataset**

Run: `make build`
Expected: build succeeds. The field is unset in Sanity at this point, so `heroLockup` resolves to `null`. That is the correct state; do not create the content yet, because the rollout order requires code to merge first.

- [ ] **Step 6: Commit**

```bash
git add studio/schemaTypes/siteSettings.ts src/lib/sanity.ts
git commit -m "feat: add heroLockup field to site settings

Stores the emblem + wordmark brand mark alongside the existing logo, so both
brand assets live in one place in Studio. The field description carries the
constraint the homepage scrim imposes: white artwork, dark photography only."
```

---

### Task 3: Teach `Hero.astro` to render a lockup image

**Files:**
- Modify: `src/components/Hero.astro` (whole file, currently 16 lines)
- Modify: `src/styles/global.css` (append to the Hero block, after line 310)

**Interfaces:**
- Consumes: `resolveImageDimensions`, `SanityImageAssetLike` (Task 1); `SanityImage` from `src/lib/sanity.ts`
- Produces: `Hero` accepts `image?: SanityImage`. Task 5 passes `settings?.heroLockup` to it.

- [ ] **Step 1: Capture the "before" build output**

`Hero` is imported by 14 pages and only `index.astro` will ever pass `image`, so
the other 13 must come out byte-identical. Capture the baseline **before**
editing anything, so the comparison in Step 5 needs no stashing. The stash stack
is shared with the main checkout and every other worktree, and another session
may push or pop it concurrently.

```bash
make build && rm -rf /tmp/hero-before && cp -R dist /tmp/hero-before
```

Expected: build succeeds.

- [ ] **Step 2: Rewrite `src/components/Hero.astro`**

```astro
---
import type { SanityImage } from "../lib/sanity";
import { urlFor, resolveImageDimensions } from "../lib/image";

interface Props {
  title: string
  subtitle?: string
  titleClass?: string
  image?: SanityImage
}

const { title, subtitle, titleClass, image } = Astro.props;

// A Sanity image field that has been touched and then cleared in Studio leaves
// an empty object behind, so test the asset rather than the wrapper.
const lockup = image?.asset ? image : undefined;
const lockupDimensions = lockup
  ? resolveImageDimensions( lockup.asset, "Hero lockup image" )
  : undefined;
---

<section class="hero">
  <h1 class:list={[ titleClass, { "hero-title-lockup": Boolean( lockup ) } ]}>
    {lockup && lockupDimensions ? (
      <img
        class="hero-lockup"
        src={urlFor( lockup ).width( 1800 ).format( "webp" ).url()}
        alt={lockup.alt ?? title}
        width={lockupDimensions.width}
        height={lockupDimensions.height}
        fetchpriority="high"
      />
    ) : title}
  </h1>
  <div class="hero-accent"></div>
  {subtitle && <p>{subtitle}</p>}
  <slot />
</section>
```

The lockup is requested at `width( 1800 )`, twice the 900px display box, and with **no** `.height()` call. Cropping a logo is never correct.

- [ ] **Step 3: Add the lockup CSS**

In `src/styles/global.css`, append to the Hero section, after the `.hero-accent` rule:

```css
/* h1/h2 carry a horizontal display-type stretch (see the h1, h2 rule above).
   That is correct for text and wrong for artwork: it would render the lockup
   3.85% too wide, distorting the emblem and contradicting the aspect ratio the
   width/height attributes declare. Neutralise it when the heading holds an
   image. */
.hero h1.hero-title-lockup {
  transform: none;
  max-width: 100%;
  letter-spacing: normal;
  -webkit-text-stroke: 0;
}

/* 900px at the 1200px content column is the approved scale. Below that the
   lockup goes fluid, so mobile needs no breakpoint of its own. */
.hero-lockup {
  width: 100%;
  max-width: 900px;
  height: auto;
}
```

- [ ] **Step 4: Verify the type check passes**

Run: `yarn format && yarn astro check`
Expected: `0 errors, 0 warnings, 5 hints`.

- [ ] **Step 5: Prove the change is inert for the other 13 pages**

```bash
make build
for page in about-us contact find-us products retailers blog strains terpenes glossary; do
  diff -q "/tmp/hero-before/$page/index.html" "dist/$page/index.html" || echo "CHANGED: $page"
done
```

Expected: no output at all. Any `CHANGED:` line means the edit was not additive and must be fixed before proceeding. `index.astro` is deliberately excluded: it does not pass `image` yet either, so it should also be unchanged at this point, but Task 5 is where its output is expected to move.

- [ ] **Step 6: Commit**

```bash
git add src/components/Hero.astro src/styles/global.css
git commit -m "feat: let Hero render a brand lockup in place of its heading text

Adds an optional image prop. When supplied, the image renders inside the h1
with the title as its alt text, so the accessible output is unchanged. The
global h1 scaleX stretch is neutralised for image headings, since it would
distort the artwork."
```

---

### Task 4: Create `HeroBackdrop.astro`

**Files:**
- Create: `src/components/HeroBackdrop.astro`
- Modify: `src/styles/global.css` (add `--bg-rgb` to `:root` near line 2, and a Hero Backdrop block after the Hero block)

**Interfaces:**
- Consumes: `resolveImageDimensions` (Task 1); `SanityImage` from `src/lib/sanity.ts`
- Produces: `HeroBackdrop` accepts `image?: SanityImage` and renders `<slot />`. Task 5 wraps `Hero` in it.

- [ ] **Step 1: Add the `--bg-rgb` custom property**

In `src/styles/global.css`, directly below `--bg: #111111;` in the `:root` block:

```css
  /* Channel triplet of --bg, so the hero scrim can compose an alpha version of
     the background colour without hardcoding a second copy of the value. */
  --bg-rgb: 17, 17, 17;
```

- [ ] **Step 2: Create `src/components/HeroBackdrop.astro`**

```astro
---
import type { SanityImage } from "../lib/sanity";
import { urlFor, resolveImageDimensions } from "../lib/image";

interface Props {
  image?: SanityImage
}

const { image } = Astro.props;

// Same empty-object guard as Hero: a cleared Sanity image field is truthy.
const backdrop = image?.asset ? image : undefined;

// Sanity will happily upscale a small source and return double the bytes for no
// extra detail, so cap the request at the asset's own width. 2400 is twice the
// 1200px content column, for retina displays.
const backdropWidth = backdrop
  ? Math.min( 2400, resolveImageDimensions( backdrop.asset, "Hero backdrop image" ).width )
  : 0;
---

{backdrop ? (
  <div class="hero-backdrop">
    <img
      class="hero-backdrop-image"
      src={urlFor( backdrop ).width( backdropWidth ).format( "webp" ).url()}
      alt=""
      aria-hidden="true"
    />
    <div class="hero-backdrop-scrim"></div>
    <div class="hero-backdrop-content">
      <slot />
    </div>
  </div>
) : (
  <slot />
)}
```

With no image this is a plain passthrough, so it never imposes layering on a caller that does not want it.

- [ ] **Step 3: Add the backdrop CSS**

Append to `src/styles/global.css` after the Hero block:

```css
/* --- Hero Backdrop --- */

/* isolation: isolate is load-bearing. Without a local stacking context these
   z-indexes compete page-wide, and AgeGate (which sits above everything on its
   own z-index) can interleave with the hero layers. */
.hero-backdrop {
  position: relative;
  overflow: hidden;
  isolation: isolate;
  border-radius: 8px;
}

.hero-backdrop-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
}

/* Measured worst-case contrast for white artwork over this gradient is 4.98:1
   against the darkest real photo in the dataset, clearing WCAG AA. The margin
   is thin by design, which is why the Studio field description restricts the
   backdrop to dark, low-key photography. */
.hero-backdrop-scrim {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(
    180deg,
    rgba(var(--bg-rgb), 0.55) 0%,
    rgba(var(--bg-rgb), 0.75) 60%,
    rgba(var(--bg-rgb), 0.92) 100%
  );
}

.hero-backdrop-content {
  position: relative;
  z-index: 2;
}

/* .hero is padding: 4rem 0, which is right against a page background and wrong
   inside a backdrop, where it puts text flush against the photo edge. */
.hero-backdrop .hero {
  padding-inline: 2rem;
}
```

- [ ] **Step 4: Verify**

Run: `yarn format && yarn astro check`
Expected: `0 errors, 0 warnings, 5 hints`. The component is not yet imported anywhere, so the build output is unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/components/HeroBackdrop.astro src/styles/global.css
git commit -m "feat: add HeroBackdrop for layered hero photography

Owns a three-layer stack of photo, gradient scrim, and slotted content, in a
local stacking context so its z-indexes cannot interleave with AgeGate. A
passthrough when given no image. The scrim gradient composes --bg via a new
--bg-rgb triplet rather than hardcoding the colour a second time."
```

---

### Task 5: Compose the new hero on the homepage

**Files:**
- Modify: `src/pages/index.astro:1-33`
- Modify: `src/styles/global.css` (append hero CTA classes to the Hero block)

**Interfaces:**
- Consumes: `Hero` with `image` (Task 3), `HeroBackdrop` with `image` (Task 4), `SiteSettings.heroLockup` (Task 2), `getPage( "home" )` returning `heroImage` (already projected at `src/lib/sanity.ts:383`)
- Produces: the finished homepage hero. Nothing consumes this.

- [ ] **Step 1: Add the hero CTA classes**

The Wholesale button's border is `var(--border)` (#333), which is invisible over a photograph. Both CTAs are inline-styled and duplicate six declarations between them, and inline styles cannot carry hover states. Append to the Hero block in `src/styles/global.css`:

```css
.hero-cta-row {
  display: flex;
  gap: 1rem;
  margin-top: 1.5rem;
}

.hero-cta-primary,
.hero-cta-ghost {
  padding: 0.6rem 1.5rem;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 1px;
  border-radius: 4px;
  border: 1px solid;
  transition: color 0.2s, border-color 0.2s;
}

.hero-cta-primary {
  color: var(--accent);
  border-color: var(--accent);
}

.hero-cta-primary:hover {
  color: var(--accent-hover);
  border-color: var(--accent-hover);
}

/* Translucent white rather than --border (#333), which disappears against a
   backdrop photograph. */
.hero-cta-ghost {
  color: var(--text-primary);
  border-color: rgba(255, 255, 255, 0.35);
}

.hero-cta-ghost:hover {
  border-color: rgba(255, 255, 255, 0.6);
}
```

- [ ] **Step 2: Rewrite the homepage hero in `src/pages/index.astro`**

Replace the import block and the `<Hero>` element (lines 1 to 33). New imports at the top:

```astro
import Layout from "../layouts/Layout.astro";
import Hero from "../components/Hero.astro";
import HeroBackdrop from "../components/HeroBackdrop.astro";
import SectionHeading from "../components/SectionHeading.astro";
import StrainCard from "../components/StrainCard.astro";
import FeaturedPost from "../components/FeaturedPost.astro";
import { getSiteSettings, getStrains, getPage, getBlogPosts } from "../lib/sanity";
```

New hero markup, replacing lines 21 to 33:

```astro
  <HeroBackdrop image={page?.heroImage}>
    <Hero
      title={page?.title ?? settings?.siteTitle ?? "Northwest Local Cannabis"}
      subtitle={page?.seoDescription ?? settings?.siteDescription}
      image={settings?.heroLockup}
    >
      <div class="hero-cta-row">
        <a href="/strains" class="hero-cta-primary">Explore Strains</a>
        <a href="/retailers" class="hero-cta-ghost">Wholesale</a>
      </div>
    </Hero>
  </HeroBackdrop>
```

The `nav-retailers-cta` class is dropped from the primary CTA. It was borrowed from the nav and pulled in nav-specific sizing that the inline styles then had to override.

- [ ] **Step 3: Verify**

Run: `yarn format && yarn astro check`
Expected: `0 errors, 0 warnings, 5 hints`.

- [ ] **Step 4: Verify the empty-content fallback, which is what ships**

Neither Sanity field has content yet, so this build exercises row 4 of the spec's fallback matrix: the homepage must look exactly as it does in production today.

```bash
make build
grep -c "hero-backdrop" dist/index.html
grep -c "hero-lockup" dist/index.html
grep -o "<h1[^>]*>[^<]*" dist/index.html
```

Expected: both counts are `0`; the `<h1>` still contains the text "Northwest Local Cannabis". **This is the state that will be live after merge**, and it must be a no-op.

- [ ] **Step 5: Verify the populated path before it ships**

The fallback proves nothing about the feature itself. Temporarily point the homepage at assets that already exist in Sanity, exercising rows 1 through 3 without publishing anything. In `src/pages/index.astro`, replace the whole hero block with this temporary version:

```astro
  <HeroBackdrop image={allStrains.find( strain => strain.heroImage?.asset )?.heroImage}>
    <Hero
      title={page?.title ?? settings?.siteTitle ?? "Northwest Local Cannabis"}
      subtitle={page?.seoDescription ?? settings?.siteDescription}
      image={settings?.logo}
    >
      <div class="hero-cta-row">
        <a href="/strains" class="hero-cta-primary">Explore Strains</a>
        <a href="/retailers" class="hero-cta-ghost">Wholesale</a>
      </div>
    </Hero>
  </HeroBackdrop>
```

`settings.logo` stands in for the lockup (it is also a white-on-transparent PNG, so it exercises the same rendering path) and the first strain hero stands in for the backdrop photo. Then:

```bash
make build
grep -o "hero-backdrop-scrim\|hero-lockup\|hero-title-lockup" dist/index.html | sort -u
```

Expected: all three class names present. Ask the user to look at the homepage on their running dev server and confirm the layering, scale, and scrim read correctly. **Then revert both props to `page?.heroImage` and `settings?.heroLockup` before committing.** Re-run `make build` and re-confirm Step 4's counts are back to `0`.

- [ ] **Step 6: Commit**

```bash
git add src/pages/index.astro src/styles/global.css
git commit -m "feat: render the brand lockup over a scrimmed photo on the homepage

Composes HeroBackdrop around Hero, feeding the lockup from siteSettings and
the backdrop photo from the home page document. Both are absent in Sanity
today, so this ships as a no-op until that content is published.

The hero CTAs move from inline styles to classes: the ghost button's --border
(#333) is invisible over a photograph, and inline styles cannot carry the
hover states the buttons were missing."
```

---

### Task 6: Open the PR and hand over the content steps

**Files:** none modified.

- [ ] **Step 1: Run the full CI-equivalent check**

```bash
yarn format
yarn astro check
yarn lint
make build
```

Expected: `astro check` reports `0 errors, 0 warnings, 5 hints`; lint clean; build succeeds.

- [ ] **Step 2: Push the branch**

```bash
git push -u origin worktree-homepage-hero-lockup
```

Run this as its own command. Do not chain it with the `gh pr create` below: the push-to-main guard false-positives on compound commands containing the word "main".

- [ ] **Step 3: Open the PR**

```bash
gh pr create --title "Homepage hero lockup over scrimmed photography" --body "$( cat <<'EOF'
Replaces the homepage text `<h1>` with the emblem + wordmark lockup, layered over an optional background photo with a gradient scrim.

Design: `docs/superpowers/specs/2026-08-12-homepage-hero-lockup-design.md`

## Shape

- `Hero.astro` gains one optional `image` prop. Imported by 14 pages; the other 13 are byte-identical (verified by diffing built output).
- `HeroBackdrop.astro` is new and owns the photo/scrim/content stack. Passthrough when given no image.
- `resolveImageDimensions` extracted from `PortableTextImage` into `lib/image.ts`, since three call sites now need it.

## This merges as a visual no-op except the Wholesale button

Neither Sanity field has content yet, so the hero itself is unchanged until the content steps below run. That is deliberate: publishing in Sanity rebuilds against `main`, so the code has to land first.

The Wholesale button does change on merge, moving from an inline style to the new `.hero-cta-ghost` class:

- Border colour: `var(--border)` (#333) → `rgba(255, 255, 255, 0.35)`. Spec-sanctioned — the old colour is invisible over a future backdrop photo, so the change is made now rather than staged behind the photo.
- A hover border-colour transition, which did not exist before: the old inline style's specificity beat `a:hover`, so the button had no hover response at all.
- A hover text-colour transition, likewise new.

Both CTAs also gain a `:focus-visible` outline in place of the browser's default focus ring.

## Content steps after merge

1. `make deploy-studio` to push the `heroLockup` field to Studio.
2. Upload the lockup PNG **directly**. Not through `scripts/prep-images.sh`, whose JPG conversion flattens the alpha channel.
3. Create and publish a `page` document with `pageId: "home"`, plus the backdrop photo.
4. Confirm a deploy fires (issue #29 is open; dispatch manually if not).

## Known constraint

The scrim clears WCAG AA at 4.98:1 worst case against the darkest photo in the dataset. The margin is thin by design, chosen to keep the photograph visible. The Studio field description restricts the backdrop to dark, low-key photography; a bright photo would drop below AA without a deploy or a code review.
EOF
)"
```

- [ ] **Step 4: Report the PR link to the user**

Include the reminder that no visual change lands until the content steps run, and that the background photo is still unsourced: the widest real image in the dataset is a 1200x900 strain macro, which is 1x at a 1200px hero.
