# Homepage Hero Lockup and Background Photo

**Date:** 2026-08-12
**Status:** Approved, ready for implementation

## Context

The homepage hero currently renders the brand name as text: a 3.5rem uppercase
`<h1>` in `index.astro:22`, falling back through `page?.title` to
`settings?.siteTitle`. There is a brand lockup (formline emblem plus the block
wordmark "NW LOCAL CANNABIS", white on transparent, 2400x1000 PNG) that has
never been on the site.

Two pieces of prior state matter:

1. **The nav logo is not text.** `Nav.astro:26` renders `settings.logo` as an
   image whenever it is set, and it is set, to a completely different mark: a
   script "Northwest local" with no emblem and no "cannabis". The two marks
   coexist. This work does not touch the nav.
2. **There is no `home` page document in Sanity.** The dataset holds exactly one
   `page` doc, `pageId: "about"`. `getPage( "home" )` has been returning null
   since launch, and the homepage has been silently falling through to
   `siteSettings` for its title and description.

## Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| Where does the lockup go? | Homepage hero only | Nav keeps the script mark. The hero is the one surface with room for the emblem's detail. |
| Where is the lockup stored? | New `siteSettings.heroLockup` field | Brand marks live together in Studio, beside the existing `logo`, editable without a deploy. |
| How large? | 900px wide max (75% of the 1200px content column) | Chosen from rendered mockups at 480 / 640 / 900. |
| Background photo? | Yes, in scope | |
| Where is the photo stored? | `page.heroImage` on a new `home` doc | The field already exists and is built for photographic page banners. Zero schema change. |
| Contrast treatment | Vertical gradient scrim, photo left sharp | Chosen from four rendered treatments over the hardest real photo in the library. |

### Scrim values

```
linear-gradient( 180deg,
  rgba( var(--bg-rgb), 0.55 ) 0%,
  rgba( var(--bg-rgb), 0.75 ) 60%,
  rgba( var(--bg-rgb), 0.92 ) 100% )
```

Measured worst-case WCAG contrast for white artwork over this scrim, sampling
actual photo pixels across the region the lockup covers:

| Photo | Worst pixel | 5th percentile |
|-------|-------------|----------------|
| Glitter Bomb macro | 4.98:1 | 8.02:1 |
| Permanent Marker macro | 5.35:1 | 7.85:1 |

Both clear AA (4.5:1). The margin on the first is 0.48, which is thin. Two
alternatives with 7.6:1 and 8.5:1 were rendered and rejected in favour of
keeping more of the photograph visible.

**Consequence, accepted deliberately:** this treatment is only safe for dark,
low-key photography. A sunlit outdoor shot or a white-background product photo
would drop below AA, and because the field is CMS-editable that can happen
without a deploy or a code review. The mitigation is a description on the Studio
field, not a change to the gradient.

## Architecture

Three units, each with one job.

### `Hero.astro` (modified)

Gains one optional prop:

```ts
interface Props {
  title: string
  subtitle?: string
  titleClass?: string
  image?: SanityImage   // new
}
```

When `image?.asset` is present it renders `<h1><img ...></h1>`; otherwise
`<h1>{title}</h1>`. `title` supplies the alt text in both branches, so the
accessible output is identical either way.

The guard must be `image?.asset`, not `image`. A Sanity image field that has
been touched and then cleared in Studio leaves `{}` behind, which is truthy.
This matches how `Nav.astro:26` and `about-us.astro:17` both test `?.asset`.

**The heading stretch must be neutralized.** `global.css:55-64` applies
`transform: scaleX( var(--heading-stretch-x) )` (1.0385) plus a compensating
`max-width: calc( 100% / var(--heading-stretch-x) )` and a
`-webkit-text-stroke` to every `h1` and `h2`. Those exist to stretch display
type, and they apply to an `<img>` child just as readily as to text: the lockup
would render 3.85% too wide, distorting the emblem and breaking the aspect
ratio the `width`/`height` attributes declare.

Hero therefore applies a modifier class to the `h1` itself whenever it is
rendering an image, rather than leaving it to the caller:

```css
.hero h1.hero-title-lockup {
  transform: none;
  max-width: 100%;
  letter-spacing: normal;
  -webkit-text-stroke: 0;
}
```

Hero is imported by 14 pages. The change is purely additive: the other 13 call
`<Hero title=... />` unchanged and must render byte-identically.

### `HeroBackdrop.astro` (new)

Owns the layered background. Takes `image?: SanityImage` and renders
`<slot />`. Knows nothing about headlines. With no image it is a plain
passthrough, so it never imposes layering on a caller that does not want it.

Three layers inside a local stacking context:

```
.hero-backdrop          position: relative; overflow: hidden; isolation: isolate
  .hero-backdrop-image  position: absolute; inset: 0; object-fit: cover; z-index: 0
  .hero-backdrop-scrim  position: absolute; inset: 0; z-index: 1
  <slot />              position: relative; z-index: 2
```

`isolation: isolate` is load-bearing. Without a local stacking context the
scrim's z-indexes compete page-wide, and `AgeGate` (which sits above everything
on its own z-index) can interleave with hero layers.

Two details the layering forces:

- **Horizontal padding.** `.hero` is `padding: 4rem 0`, which is correct against
  a page background but puts text flush against the photo edge inside a
  backdrop. The backdrop supplies it contextually:
  `.hero-backdrop .hero { padding-inline: 2rem; }`. This selector cannot match
  on any other page, since no other page nests `.hero` inside a backdrop.
- **`border-radius: 8px`** on `.hero-backdrop`, matching the treatment
  `about-us.astro:23` already uses for its hero image. `overflow: hidden` makes
  the corner clip the absolutely positioned photo.

No explicit height is set. The content defines the box and `object-fit: cover`
fills whatever height results.

### `index.astro` (modified)

Composes the two:

```astro
<HeroBackdrop image={page?.heroImage}>
  <Hero
    title={...}
    subtitle={...}
    image={settings?.heroLockup}
  >
    ...CTAs...
  </Hero>
</HeroBackdrop>
```

## Data model

| Asset | Field | Schema work |
|-------|-------|-------------|
| Lockup (transparent PNG) | `siteSettings.heroLockup` | New field |
| Background photo | `page.heroImage` on a new `home` doc | None |

The two assets have different change cadences and different owners. A brand
lockup changes every few years and applies everywhere; a hero photo may change
seasonally and applies to one page. Keeping them in separate documents stops a
routine photo swap from putting the brand mark one click away.

### `studio/schemaTypes/siteSettings.ts`

Add after `logo`:

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
})
```

No `options: { hotspot: true }`. Hotspot governs cropping, and this image is
never cropped.

### `src/lib/sanity.ts`

Add `heroLockup?: SanityImage` to the `SiteSettings` interface, and
`heroLockup { asset->, alt }` to the `getSiteSettings()` projection.
`getPage()` already projects `heroImage`. No change there.

## Rendering

### Shared mechanic, extracted first

`PortableTextImage.astro:30,44-50` already solves "given a Sanity image, resolve
its true intrinsic dimensions": accept `_ref ?? _id` (because an `asset->`
projection dereferences and drops `_ref`), prefer `metadata.dimensions` when
present, fall back to parsing the id.

Both new render paths need exactly that. Move it into `src/lib/image.ts` as
`resolveImageDimensions( asset )` and make `PortableTextImage` a consumer. This
also lets `SanityImage.metadata` take a real type instead of `unknown`.

This extraction lands before the feature work, as its own commit, so the
refactor and the feature stay separable in review.

### Lockup

- `urlFor( heroLockup ).width( 1800 ).format( "webp" ).url()`, twice the 900px
  display box. The source is 2400 wide, so this is a genuine downscale.
- **No `.height()`.** Cropping a logo is never correct.
- `width` / `height` attributes from `resolveImageDimensions()` to reserve
  layout space and avoid a shift on load.
- `fetchpriority="high"`. This is the LCP element.
- `alt={ heroLockup.alt ?? siteTitle }`.

### Background

- `urlFor( heroImage ).width( Math.min( 2400, intrinsicWidth ) ).format( "webp" )`.
  The clamp matters: Sanity will upscale a 1200px source to 2400 and return
  double the bytes for no extra detail.
- `object-fit: cover`, absolutely positioned, `alt=""` (decorative: it carries
  no information the text does not).

### Sizing

```css
.hero-lockup { display: block; width: 100%; max-width: 900px; height: auto; }
```

At the 1200px column that resolves to 900px, the chosen scale. On anything
narrower it goes fluid. No media query is needed; the mobile behaviour falls out
of the geometry.

### `src/styles/global.css`

Add `--bg-rgb: 17, 17, 17;` beside `--bg`. The scrim needs an alpha-composed
version of the background colour, and hardcoding `rgba(17,17,17,...)` would
duplicate a value `--bg` already owns.

## Knock-on changes

1. **Hero CTAs move from inline styles to classes.** The "Wholesale" button's
   `1px solid var(--border)` (#333) is invisible over a photograph and has to
   become `rgba(255,255,255,0.35)`. Both CTAs are inline-styled at
   `index.astro:26-31`, duplicating six declarations between them, and inline
   styles cannot carry hover or media queries. They become
   `.hero-cta-primary` and `.hero-cta-ghost`. Scope is the homepage only.

2. **`--bg-rgb` added** to `global.css` (see above).

## Fallback matrix

Every combination renders something sane. The last row is what makes the
rollout safe.

| `heroLockup` | `home.heroImage` | Result |
|---|---|---|
| set | set | Full design: lockup over scrimmed photo |
| set | unset | Lockup on plain dark background |
| unset | set | Text `<h1>` over scrimmed photo (same contrast) |
| unset | unset | Exactly today's homepage, unchanged |

## Rollout order

Publishing in Sanity triggers a rebuild against `main`, so code must land
first or the rebuild will run against a template that ignores the new fields.

1. Merge the code PR. The live site is unchanged, because neither field has
   content yet (row 4 of the matrix).
2. `make deploy-studio` to push the `heroLockup` field to Studio.
3. Upload the lockup PNG **directly**. Do not route it through
   `scripts/prep-images.sh`: its `sips -s format jpeg` conversion at line 111
   flattens the alpha channel and would produce a white slab.
4. Create and publish the `home` page document with `pageId: "home"`, a title,
   an SEO description, and the background photo.
5. Confirm a deploy actually fires. Issue #29 is open; manually dispatch the
   workflow if the publish does not trigger one.

## Verification

No test framework is configured, so verification is:

- `yarn astro check` (this is what CI runs, `ci.yml:23`). Baseline before this
  work: 0 errors, 0 warnings, 5 pre-existing hints.
- `make build` against real Sanity content.
- Visual confirmation on the already-running local dev server. Do not start a
  second one.
- Spot-check the fallback matrix by building before the Sanity content exists
  (rows 2 and 4 are reachable that way).

## Out of scope

- The nav logo. The script mark stays.
- Any emblem-only crop of the lockup. No vector source exists for this artwork;
  the Brand folder holds only the 2400x1000 raster plus PDFs of two unrelated
  marks. An emblem-only variant would need the original vector from the
  designer.
- Sourcing a hero photograph. The widest real image in the dataset is a 1200x900
  strain macro, which at a 1200px hero is exactly 1x and will be soft on retina
  displays. Steps 1 to 3 of the rollout stand alone, so the lockup can ship
  before a suitable photo (roughly 2400px wide, dark and low-key) exists.
