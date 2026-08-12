# Crossfading Hero Backdrop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cycle the homepage hero backdrop slowly through three photographs, dissolving between them, with no client JavaScript.

**Architecture:** Each photograph gets an absolutely positioned `.hero-backdrop-slide` wrapper that owns opacity, while the existing `.hero-backdrop-image` inside it keeps owning the scroll-driven parallax transform. The first slide never animates and acts as the opaque base; later slides fade in above it, and the last fades back out to reveal it. Keyframe percentages depend on how many photographs an editor added, so `HeroBackdrop.astro` generates them into a `<style is:inline>` at build time.

**Tech Stack:** Astro 6 (SSG), Sanity CMS, plain CSS in `src/styles/global.css`, yarn.

**Spec:** `docs/superpowers/specs/2026-08-12-hero-crossfade-design.md`

## Global Constraints

- **No client JavaScript.** The rotation is CSS-only. The site ships no runtime JS except the age gate.
- **Whitespace inside parens.** House style is `function name( arg )` and `if( condition )`. ESLint enforces it; `make format` rewrites tight-paren code.
- **Astro preserves template whitespace, unlike JSX.** Hug expression braces tightly against surrounding tags. Spreading an expression across lines emits stray text nodes into the HTML.
- **`studio/` is a separate project with its own style.** No semicolons, single quotes, `bracketSpacing: false`, tight parens. The root ESLint config ignores `studio/**`, so `make format` never touches it. Lint it with `cd studio && npx eslint .` and `npx tsc --noEmit`.
- **No TypeScript `as` assertions.**
- **Descriptive variable names.** No single-character identifiers, including callback parameters.
- **Never boot a dev server.** Verification is `yarn astro check`, `make build`, and inspection of `dist/`. The user has a dev server running for visual checks.
- **No test framework is configured.** "Test" steps in this plan are build-output assertions, which are runnable and do fail loudly.
- **`make build` needs `.env`.** This worktree has it. A fresh worktree would not, and the failure reads like a build-system fault rather than a missing file.

---

### Task 1: Extract the backdrop source builder

A pure refactor with no output change, done first so three slides share one mechanic instead of copying it.

**Files:**
- Modify: `src/lib/image.ts` (append after `resolveImageDimensions`)
- Modify: `src/components/HeroBackdrop.astro:1-44` (frontmatter)

**Interfaces:**
- Consumes: `urlFor`, `resolveImageDimensions` (both already in `src/lib/image.ts`); `SanityImage` from `src/lib/sanity.ts`
- Produces: `heroBackdropSources( image: SanityImage, context: string ): BackdropSources` where `BackdropSources` is `{ src: string; srcset: string; width: number }`. Task 4 calls this once per slide.

- [ ] **Step 1: Capture the current output as a baseline**

```bash
make build
python3 -c "
import re
html = open( 'dist/index.html' ).read()
print( '\n'.join( re.findall( r'<img class=\"hero-backdrop-image\".*?>', html, re.S ) ) )
" > /tmp/hero-baseline.txt
cat /tmp/hero-baseline.txt
```

Expected: one match containing `src=`, `srcset=`, `sizes="100vw"`, `alt=""`, `fetchpriority="high"`. This file is the assertion for Step 5.

The regex needs `re.S` because the `<img>` is authored across several lines and Astro's HTML compression is not something to bet the assertion on. A plain `grep -o '<img[^>]*>'` can silently match nothing here, which would make Step 5 pass by comparing two empty files.

- [ ] **Step 2: Add the helper to `src/lib/image.ts`**

Add the `SanityImage` type to the existing import at the top of the file:

```ts
import { sanityClient, type SanityImage } from "./sanity";
```

Append at the end of the file:

```ts
// Full-bleed backdrop candidates. Sanity will happily upscale a small source
// and return double the bytes for no extra detail, so cap every request at the
// asset's own width. The ceiling is a retina-density common desktop width
// rather than anything derived from the content column, because the backdrop
// spans the viewport rather than sitting inside `main`.
const BACKDROP_CEILING_WIDTH = 3000;
const BACKDROP_CANDIDATE_WIDTHS = [ 480, 800, 1200, 1600, 2000, 2400 ];

export interface BackdropSources {
  src: string;
  srcset: string;
  width: number;
}

export function heroBackdropSources( image: SanityImage, context: string ): BackdropSources {
  const width = Math.min(
    BACKDROP_CEILING_WIDTH,
    resolveImageDimensions( image.asset, context ).width,
  );
  const candidateWidths = [ ...new Set(
    [ ...BACKDROP_CANDIDATE_WIDTHS, width ].filter( candidate => candidate <= width ),
  ) ];
  return {
    src: urlFor( image ).width( width ).format( "webp" ).url(),
    srcset: candidateWidths
      .map( candidate => `${urlFor( image ).width( candidate ).format( "webp" ).url()} ${candidate}w` )
      .join( ", " ),
    width,
  };
}
```

- [ ] **Step 3: Rewrite `src/components/HeroBackdrop.astro`**

Replace the whole file with this. Note the template guard now tests `sources` rather than `backdrop`, so TypeScript narrows it and no non-null assertion is needed — `!` is an assertion in spirit and this codebase forbids that class of escape hatch. Both existing comment blocks are preserved; the `sizes` explanation moves down next to the attribute it describes, since the srcset math it used to sit above now lives in `image.ts`.

```astro
---
import type { SanityImage } from "../lib/sanity";
import { heroBackdropSources } from "../lib/image";

interface Props {
  image?: SanityImage
}

const { image } = Astro.props;

// Same empty-object guard as Hero: a cleared Sanity image field is truthy.
const backdrop = image?.asset ? image : undefined;
const sources = backdrop ? heroBackdropSources( backdrop, "Hero backdrop image" ) : undefined;
---

{sources ? (
  <div class="hero-backdrop">
    {/* fetchpriority="high" is deliberate here and on Hero's lockup img: which
        image is the LCP element depends on fallback state (this photo when
        present, the lockup when it is not), so one hint cannot cover both
        without conditional plumbing.

        sizes is 100vw because the backdrop breaks out of main and spans the
        viewport. Treat that as a floor rather than an exact figure: the
        parallax makes the image 140% of the box height, which can flip
        `object-fit: cover` from scaling by width to scaling by height, and a
        height-scaled image is wider than the viewport. On a 1280px-wide desktop
        hero the image renders at roughly 1440 CSS px, so the browser can select
        one candidate lower than it ideally would. Candidate rounding absorbs
        most of that on desktop; the gap is larger on narrow screens, where the
        box is tall relative to its width. Correcting it properly needs
        breakpointed sizes, which is a bandwidth tradeoff rather than a straight
        win — see PR #45's review. */}
    <img
      class="hero-backdrop-image"
      src={sources.src}
      srcset={sources.srcset}
      sizes="100vw"
      alt=""
      fetchpriority="high"
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

- [ ] **Step 4: Type-check and lint**

```bash
yarn astro check
make format
yarn lint
```

Expected: `astro check` reports 0 errors, 0 warnings. `yarn lint` clean.

- [ ] **Step 5: Rebuild and assert the output is unchanged**

```bash
make build
python3 -c "
import re
html = open( 'dist/index.html' ).read()
print( '\n'.join( re.findall( r'<img class=\"hero-backdrop-image\".*?>', html, re.S ) ) )
" > /tmp/hero-after.txt
test -s /tmp/hero-after.txt && diff /tmp/hero-baseline.txt /tmp/hero-after.txt && echo "IDENTICAL"
```

Expected: `IDENTICAL`. The `test -s` guard is there because two empty files also diff clean. Any difference means the refactor changed behaviour and must be fixed before committing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/image.ts src/components/HeroBackdrop.astro
git commit -m "refactor: extract heroBackdropSources so slides share one source builder"
```

---

### Task 2: Add `heroImages` to the schema and data layer

**Files:**
- Modify: `studio/schemaTypes/page.ts:36-43` (after the `heroImage` field)
- Modify: `src/lib/sanity.ts:433-451` (the `Page` interface and `getPage` projection)

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: `Page.heroImages?: SanityImage[]`, populated by `getPage`. Task 3 writes to this Sanity field; Task 4 reads it in `index.astro`.

- [ ] **Step 1: Add the field to the Studio schema**

In `studio/schemaTypes/page.ts`, insert directly after the `heroImage` `defineField({...})` block and before the `body` field. Studio style: no semicolons, single quotes, `bracketSpacing: false`, tight parens.

```ts
    defineField({
      name: 'heroImages',
      title: 'Hero Images',
      type: 'array',
      of: [
        {
          type: 'image',
          options: {hotspot: true},
          fields: [defineField({name: 'alt', title: 'Alternative Text', type: 'string'})],
        },
      ],
      description:
        'Backdrop photographs for the homepage hero, crossfaded in order. The first loads immediately and is what most visitors see; the rest fade in behind it. Leave empty to fall back to the single Hero Image above.',
    }),
```

- [ ] **Step 2: Lint and type-check the studio project separately**

```bash
cd studio && npx eslint . && npx tsc --noEmit && cd ..
```

Expected: no output from either command. The root `make format` and `yarn lint` ignore `studio/**`, so this is the only check that covers it.

- [ ] **Step 3: Add the field to the `Page` interface**

In `src/lib/sanity.ts`, in the `Page` interface, add directly after `heroImage?: SanityImage;`:

```ts
  heroImages?: SanityImage[];
```

- [ ] **Step 4: Add the field to the `getPage` projection**

In the same file, in `getPage`'s GROQ string, add directly after the `heroImage { ... },` line:

```
      heroImages[] { asset->, alt, crop, hotspot },
```

- [ ] **Step 5: Verify the projection against real content**

```bash
yarn astro check
make build
```

Expected: both succeed. `heroImages` is absent from every page document at this point, so GROQ returns `undefined` for it and nothing renders differently. This step is confirming the query still parses and the site still builds, not that the field has data.

- [ ] **Step 6: Deploy the Studio so editors see the field**

```bash
make deploy-studio
```

Expected: deploy succeeds and reports the https://nw-local.sanity.studio/ URL. This is what makes `heroImages` editable by a human; the API writes in Task 3 do not need it, because Studio validation and Studio schema are not enforced by the Content Lake.

- [ ] **Step 7: Commit**

```bash
git add studio/schemaTypes/page.ts src/lib/sanity.ts
git commit -m "feat: add heroImages array to the page schema and data layer"
```

---

### Task 3: Upload the two new photographs and populate the home document

Content work, done before the rendering task so Task 4 can be verified against real GROQ output rather than a stub. Publishing this is safe for production: `main` does not yet select `heroImages`, so the webhook rebuild it triggers renders exactly what the homepage renders today.

**Files:** none in the repo. This task writes to Sanity.

**Interfaces:**
- Consumes: `heroImages` on the `page` schema (Task 2)
- Produces: the `home` page document has `heroImages` with three entries, in order: the existing greenhouse canopy (`IMG_0228`, asset `image-f5a211b0081237982f079f2fd4e215dd0b7a8bf0-4898x3265-jpg`), then the bokeh-lit bud, then the golden canopy.

- [ ] **Step 1: Copy the two source files to a scratch directory**

```bash
mkdir -p /tmp/hero-prep
cp "/Users/benny/Library/CloudStorage/Dropbox/Northwest Local Cannabis/Gallery/IMG_0226.JPG" /tmp/hero-prep/
cp "/Users/benny/Library/CloudStorage/Dropbox/Northwest Local Cannabis/Gallery/19D34CBF-257C-4180-83A6-ADDF2958CE36.jpg" /tmp/hero-prep/
ls /tmp/hero-prep
```

Expected: exactly two files. The copy is required — `prep-images.sh` converts every image at `maxdepth 1` of the directory it is given, and the Dropbox gallery holds far more than these two.

- [ ] **Step 2: Convert and check for duplicates**

```bash
make prep-images DIR=/tmp/hero-prep STRAIN="Hero" \
  RENAME="IMG_0226.JPG:greenhouse-bud-bokeh,19D34CBF-257C-4180-83A6-ADDF2958CE36.jpg:canopy-golden"
```

Expected: two files written to `/tmp/hero-prep/_processed/` named `hero-greenhouse-bud-bokeh.jpg` and `hero-canopy-golden.jpg`, and a summary reporting both as `NEW`. If either reports `UPLOADED`, it is already in Sanity — skip its upload in Step 3 and use the asset id the script printed.

- [ ] **Step 3: Upload both**

```bash
make upload-image FILE=/tmp/hero-prep/_processed/hero-greenhouse-bud-bokeh.jpg \
  LABEL="Hero backdrop — bokeh" \
  DESCRIPTION="A single flowering cannabis cola in sharp focus against rows of blurred plants and warm overhead grow lamps inside the Northwest Local Cannabis greenhouse"

make upload-image FILE=/tmp/hero-prep/_processed/hero-canopy-golden.jpg \
  LABEL="Hero backdrop — golden canopy" \
  DESCRIPTION="A dense canopy of flowering cannabis plants bathed in warm orange HPS light inside the Northwest Local Cannabis grow room"
```

Expected: each prints the created asset document as JSON. Record both `_id` values — they have the form `image-<sha>-<width>x<height>-jpg` and are needed in Step 4.

The `description` is not optional bookkeeping: the slides render `alt=""` because they are decorative, but `/describe-assets` and the content audit both check `description` on the asset, and an asset without one shows up as a defect.

- [ ] **Step 4: Patch the home document**

Using the Sanity MCP tools against project `nyd3p2n0`, dataset `production`, patch the document whose `_type == "page"` and `pageId == "home"`, setting `heroImages` to three entries in this order:

1. `image-f5a211b0081237982f079f2fd4e215dd0b7a8bf0-4898x3265-jpg` (the existing hero, unchanged)
2. the asset id from `hero-greenhouse-bud-bokeh.jpg`
3. the asset id from `hero-canopy-golden.jpg`

Each entry has the shape:

```json
[
  { "_type": "image", "_key": "heroCanopy", "asset": { "_type": "reference", "_ref": "image-f5a211b0081237982f079f2fd4e215dd0b7a8bf0-4898x3265-jpg" } },
  { "_type": "image", "_key": "heroBokeh",  "asset": { "_type": "reference", "_ref": "<asset id from hero-greenhouse-bud-bokeh.jpg>" } },
  { "_type": "image", "_key": "heroGolden", "asset": { "_type": "reference", "_ref": "<asset id from hero-canopy-golden.jpg>" } }
]
```

`_key` is required on every array item in Sanity; omitting it produces items the Studio cannot reorder or edit.

Leave `heroImage` set to its current value. `about-us.astro` does not use the home document, but the fallback in Task 4 depends on `heroImage` staying populated.

- [ ] **Step 5: Publish and verify against real GROQ output**

Publish the document, then query it exactly the way the site does:

```
*[_type == "page" && pageId == "home"][0]{ heroImages[]{ asset->{ _id, "w": metadata.dimensions.width } } }
```

Expected: three entries, each with a resolved `_id` and a width. An entry with a null asset means the `_ref` is wrong. Note that `asset->` projections drop `_ref` and expose `_id` — `resolveImageDimensions` accepts either shape, which is why this works.

- [ ] **Step 6: Confirm production is unaffected**

```bash
gh run list --workflow=deploy.yml --limit 3
```

Expected: the publish triggered a `workflow_dispatch` rebuild of `main`. It should succeed and change nothing visible, because `main`'s `getPage` does not select `heroImages` yet. If it fails, stop and investigate before continuing.

---

### Task 4: Render the crossfade

**Files:**
- Modify: `src/components/HeroBackdrop.astro` (whole file)
- Modify: `src/styles/global.css` (insert after the `.hero-backdrop` block, before `.hero-backdrop-image`; and the `prefers-reduced-motion` block near line 1027)
- Modify: `src/pages/index.astro:10-22`

**Interfaces:**
- Consumes: `heroBackdropSources( image, context )` from Task 1; `Page.heroImages` from Task 2; three-entry `heroImages` content from Task 3
- Produces: `HeroBackdrop`'s prop changes from `image?: SanityImage` to `images?: SanityImage[]`. No later task consumes it.

- [ ] **Step 1: Rewrite `src/components/HeroBackdrop.astro`**

```astro
---
import type { SanityImage } from "../lib/sanity";
import { heroBackdropSources } from "../lib/image";

interface Props {
  images?: SanityImage[]
}

const { images = [] } = Astro.props;

// Same empty-object guard as Hero: a Sanity image field that has been touched
// and then cleared in Studio leaves an empty object behind, so test the asset
// rather than the wrapper.
const slides = images.filter( image => image?.asset );

// Seconds each photograph holds still, and seconds spent dissolving into the
// next. One photograph's full turn is a period; the whole rotation is a cycle.
const HOLD_SECONDS = 8;
const FADE_SECONDS = 2;
const PERIOD_SECONDS = HOLD_SECONDS + FADE_SECONDS;
const cycleSeconds = slides.length * PERIOD_SECONDS;

const cyclePercent = ( seconds: number ) => `${( ( seconds / cycleSeconds ) * 100 ).toFixed( 4 )}%`;

// One keyframe block per slide after the first. The first slide never animates:
// it is the opaque base that every other slide dissolves over. That asymmetry
// is the whole trick. The obvious version — every slide fading in and out on a
// shared keyframe with staggered delays — puts two layers at 0.5 opacity
// mid-transition, and compositing gives 0.5 + 0.5 * 0.5 = 0.75 coverage, so a
// quarter of the dark page background flashes through on every dissolve. Here
// exactly one layer is ever in motion, always over an opaque layer beneath.
//
// Slide i fades in while slide i-1 is still fully opaque. It then either snaps
// off underneath slide i+1 — invisible, because slide i+1 covers it — or, if it
// is the last slide, fades back out to reveal slide 0 and close the loop.
// `animation-timing-function: step-end` on a keyframe holds that segment's
// start value and jumps at its end, which is how the snap happens without two
// keyframes a thousandth of a percent apart.
//
// The percentages depend on how many photographs an editor added, and keyframe
// selectors cannot read CSS custom properties, so they are generated here
// rather than living in global.css with the structural rules. Hardcoding three
// blocks there and validating the count in Studio was rejected: rule
// validation is Studio-side only, so an API write of a fourth image would
// break the rotation silently.
//
// See docs/superpowers/specs/2026-08-12-hero-crossfade-design.md.
const crossfadeKeyframes = slides.slice( 1 ).map( ( _slide, offset ) => {
  const index = offset + 1;
  const fadeInStart = index * PERIOD_SECONDS - FADE_SECONDS;
  const fadeInEnd = index * PERIOD_SECONDS;
  const isLast = index === slides.length - 1;

  const stops = [
    "0% { opacity: 0; }",
    `${cyclePercent( fadeInStart )} { opacity: 0; }`,
    isLast
      ? `${cyclePercent( fadeInEnd )} { opacity: 1; }`
      : `${cyclePercent( fadeInEnd )} { opacity: 1; animation-timing-function: step-end; }`,
    isLast
      ? `${cyclePercent( cycleSeconds - FADE_SECONDS )} { opacity: 1; }`
      : `${cyclePercent( ( index + 1 ) * PERIOD_SECONDS )} { opacity: 0; }`,
    "100% { opacity: 0; }",
  ];

  return `@keyframes hero-crossfade-${index} {\n  ${stops.join( "\n  " )}\n}`;
} ).join( "\n" );
---

{slides.length === 0 ? (
  <slot />
) : (
  <Fragment>
    {crossfadeKeyframes && <style is:inline set:html={crossfadeKeyframes}></style>}
    <div class="hero-backdrop" style={crossfadeKeyframes ? `--hero-crossfade-cycle: ${cycleSeconds}s;` : undefined}>
      {slides.map( ( slide, index ) => {
        const sources = heroBackdropSources( slide, `Hero backdrop image ${index + 1}` );
        return (
          <div
            class="hero-backdrop-slide"
            style={index > 0 ? `animation-name: hero-crossfade-${index};` : undefined}
          >
            {/* fetchpriority="high" on the first slide is deliberate, and Hero's
                lockup img carries it too: which image is the LCP element
                depends on fallback state (this photo when present, the lockup
                when it is not), so one hint cannot cover both without
                conditional plumbing. Later slides are explicitly deprioritised
                so they never compete with it. loading="lazy" is deliberately
                absent — it keys off viewport intersection, not visibility, and
                every slide is inside the hero band, so it would defer nothing.

                sizes is 100vw because the backdrop breaks out of main and spans
                the viewport. Treat that as a floor rather than an exact figure:
                the parallax makes the image 140% of the box height, which can
                flip `object-fit: cover` from scaling by width to scaling by
                height, and a height-scaled image is wider than the viewport. On
                a 1280px-wide desktop hero the image renders at roughly 1440 CSS
                px, so the browser can select one candidate lower than it ideally
                would. Candidate rounding absorbs most of that on desktop; the
                gap is larger on narrow screens, where the box is tall relative
                to its width. Correcting it properly needs breakpointed sizes,
                which is a bandwidth tradeoff rather than a straight win — see
                PR #45's review. */}
            <img
              class="hero-backdrop-image"
              src={sources.src}
              srcset={sources.srcset}
              sizes="100vw"
              alt=""
              fetchpriority={index === 0 ? "high" : "low"}
              decoding={index === 0 ? undefined : "async"}
            />
          </div>
        );
      } )}
      <div class="hero-backdrop-scrim"></div>
      <div class="hero-backdrop-content">
        <slot />
      </div>
    </div>
  </Fragment>
)}
```

`is:inline` is Astro's instruction to render a `<style>` exactly as authored — not scoped, bundled, or processed. Without it the generated keyframes would be rewritten and the `animation-name` references would not resolve.

- [ ] **Step 2: Add the slide rules to `src/styles/global.css`**

Insert between the closing brace of the `.hero-backdrop` block and the `.hero-backdrop-image` rule:

```css
/* One wrapper per photograph. The wrapper owns opacity; the image inside owns
   the parallax transform. Keeping the two animations on separate elements is
   what lets the scroll-driven timeline below stay exactly as it was: combining
   them would mean a comma-separated animation-* list whose every longhand the
   @supports guard has to restate.

   Because the wrapper is absolutely positioned it is the containing block for
   the image, so the image's `top: -20%` / `height: 140%` resolve against the
   same box they always did.

   Painting order comes from DOM order, so the slides need no z-index relative
   to each other and all of them stay below the scrim.

   Every slide but the first starts transparent. If the generated keyframes
   never arrive, that leaves the first photograph showing and nothing else —
   which is exactly the pre-rotation homepage. The cycle duration is set inline
   by HeroBackdrop, because it depends on how many photographs there are. */
.hero-backdrop-slide {
  position: absolute;
  inset: 0;
  opacity: 0;
  animation-duration: var(--hero-crossfade-cycle, 0s);
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  animation-fill-mode: both;
}

.hero-backdrop-slide:first-child {
  opacity: 1;
}
```

- [ ] **Step 3: Stop the rotation under reduced motion**

In the `@media (prefers-reduced-motion: reduce)` block, directly above the existing `.hero-backdrop-image` rule, add:

```css
  /* Falls back to the base rules above: first slide opaque, the rest
     transparent. One still photograph, no rotation. */
  .hero-backdrop-slide {
    animation-name: none;
  }
```

- [ ] **Step 4: Pass the array from `src/pages/index.astro`**

In the frontmatter, after the `latestPost` line, add:

```ts
// heroImages is the crossfade rotation; heroImage is the single-photograph
// field about-us also renders. Falling back to it keeps the homepage backdrop
// alive in the window between this shipping and an editor filling in the
// array, since Sanity publishes rebuild against main.
const heroImages = page?.heroImages?.length
  ? page.heroImages
  : ( page?.heroImage ? [ page.heroImage ] : [] );
```

Change the component usage from `<HeroBackdrop image={page?.heroImage}>` to:

```astro
  <HeroBackdrop images={heroImages}>
```

- [ ] **Step 5: Type-check, format, lint**

```bash
yarn astro check
make format
yarn lint
```

Expected: 0 errors, 0 warnings from `astro check`; `yarn lint` clean.

- [ ] **Step 6: Build and assert the rendered structure**

```bash
make build
echo "slides:    $(grep -c 'class="hero-backdrop-slide"' dist/index.html)"
echo "keyframes: $(grep -o '@keyframes hero-crossfade-[0-9]*' dist/index.html | sort -u | tr '\n' ' ')"
grep -o 'fetchpriority="[a-z]*"' dist/index.html
grep -o -- '--hero-crossfade-cycle: [0-9]*s' dist/index.html
```

Expected, with the three photographs from Task 3:
- `slides: 3`
- `keyframes: @keyframes hero-crossfade-1 @keyframes hero-crossfade-2`
- `fetchpriority` values in document order: `high`, `low`, `low`, then `high` again. The first three are the slides; the trailing `high` is the hero lockup from `Hero.astro`, which renders inside this component's slot and therefore comes *after* the slides in the DOM. If `siteSettings.heroLockup` is unset there will be only three values.
- `--hero-crossfade-cycle: 30s`

If `keyframes` is empty, Astro processed the `<style>` despite `is:inline` — check that the attribute is present and spelled exactly `is:inline`.

- [ ] **Step 7: Assert the generated percentages**

```bash
python3 -c "
import re
html = open( 'dist/index.html' ).read()
for block in re.findall( r'<style[^>]*>(.*?)</style>', html, re.S ):
    if 'hero-crossfade' in block:
        print( block.strip() )
"
```

Expected, exactly (ignoring whitespace, which Astro's HTML compression may collapse):

```css
@keyframes hero-crossfade-1 {
  0% { opacity: 0; }
  26.6667% { opacity: 0; }
  33.3333% { opacity: 1; animation-timing-function: step-end; }
  66.6667% { opacity: 0; }
  100% { opacity: 0; }
}
@keyframes hero-crossfade-2 {
  0% { opacity: 0; }
  60.0000% { opacity: 0; }
  66.6667% { opacity: 1; }
  93.3333% { opacity: 1; }
  100% { opacity: 0; }
}
```

Read against the 30s cycle: slide 2 fades in over 8-10s and vanishes at 20s beneath slide 3; slide 3 fades in over 18-20s, holds to 28s, and fades out by 30s to reveal slide 1. Wrong numbers here mean the arithmetic in Step 1 is wrong, and no amount of looking at the page will make that obvious — a dissolve that is off by a second still looks like a dissolve.

- [ ] **Step 8: Verify the parallax survived**

```bash
grep -r -o 'hero-parallax' dist/ | wc -l
```

Expected: 2 or more — the `@keyframes hero-parallax` definition plus the `animation-name` that references it. The `@supports` block is untouched by this task; this confirms nothing in `global.css` was disturbed while editing around it.

- [ ] **Step 9: Commit**

```bash
git add src/components/HeroBackdrop.astro src/styles/global.css src/pages/index.astro
git commit -m "feat: crossfade the homepage hero through a set of photographs"
```

- [ ] **Step 10: Ask the user for visual confirmation**

The remaining failure mode is a sub-second flash mid-dissolve, which no build assertion and no screenshot at an arbitrary moment will catch. Ask the user to watch the homepage in the dev server they already have running, for at least one full 30s cycle, and confirm:

- each dissolve is smooth, with no darkening or flash at its midpoint
- the wrap from the third photograph back to the first is a dissolve, not a cut
- the lockup and copy stay put while the photographs drift with the parallax
- nothing shifts layout when a slide changes

Do not boot a dev server to check this.

---

### Task 5: Update the docs and open the PR

**Files:**
- Modify: `docs/content-model.md:14` (the `page` row)
- Modify: `docs/images.md:36` (hero image guidance)

- [ ] **Step 1: Update the content model doc**

Change the `page` row of the document types table to:

```
| `page` | Singleton pages (home, about, contact) with flexible body content. The home page's `heroImages` array is the crossfaded hero backdrop |
```

- [ ] **Step 2: Update the images doc**

Append to the paragraph at line 36:

```
Homepage hero backdrops (`heroImages` on the home page document) have an extra constraint: they are crossfaded into each other, so pick photographs that share a colour temperature — a warm-to-cool dissolve passes through a muddy midpoint. Avoid blown highlights where the wordmark sits, since the scrim over them is a flat 42% wash rather than a gradient.
```

- [ ] **Step 3: Commit**

```bash
git add docs/content-model.md docs/images.md
git commit -m "docs: record the homepage hero rotation in the content and image docs"
```

- [ ] **Step 4: Run the full local check that mirrors CI**

```bash
yarn astro check
yarn lint
make build
cd studio && npx eslint . && npx tsc --noEmit && cd ..
```

Expected: all clean. Locally green must equal CI green before the PR opens.

- [ ] **Step 5: Push and open the PR**

Push and create the PR as separate commands, not chained — the push-to-main guard false-positives on compound commands containing "main".

```bash
git push -u origin hero-crossfade
```

```bash
gh pr create --title "Crossfade the homepage hero through a set of photographs" --body "$( cat <<'EOF'
Cycles the homepage hero backdrop through three photographs on a 30s loop: 8s hold, 2s dissolve, no client JavaScript.

## What changed

- `page.heroImages` — a new array on the page document, falling back to the existing single `heroImage` when empty
- `heroBackdropSources()` in `src/lib/image.ts` — the srcset math three slides now share
- `HeroBackdrop.astro` renders one `.hero-backdrop-slide` per photograph and generates the crossfade keyframes at build time

## The one non-obvious bit

The first slide never animates. It is the opaque base every other slide dissolves over. The symmetric version — every slide fading in and out on a shared keyframe with staggered delays — puts two layers at 0.5 opacity mid-transition, and compositing gives 0.75 total coverage, so a quarter of the dark page background flashes through on every dissolve. Only one layer is ever in motion here, always over an opaque layer beneath.

Keyframe percentages depend on the photograph count and keyframe selectors cannot read custom properties, so they are generated rather than hardcoded. Hardcoding three blocks and validating the count in Studio was rejected: `rule` validation is Studio-side only, so an API write of a fourth image would break the rotation silently.

## Verification

`yarn astro check`, `yarn lint`, `make build`, studio `eslint` + `tsc` all clean. Build output asserted for slide count, generated keyframe percentages, priority hints, and cycle duration. Visual confirmation of dissolve smoothness done in the dev server.

Spec: `docs/superpowers/specs/2026-08-12-hero-crossfade-design.md`
Plan: `docs/superpowers/plans/2026-08-12-hero-crossfade.md`
EOF
)"
```

- [ ] **Step 6: Finish the branch**

Use the `superpowers:finishing-a-development-branch` skill once CI is green.
