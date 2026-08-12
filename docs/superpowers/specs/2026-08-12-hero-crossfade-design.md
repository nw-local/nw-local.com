# Crossfading hero backdrop — design

**Date:** 2026-08-12
**Status:** Implemented. Shipped with two photographs rather than the three below — the intended third photograph's source was too low-resolution and the library had no suitable replacement.

## Problem

The homepage hero backdrop shows one photograph. We want it to cycle slowly
through a set of photographs, dissolving between them, without turning into a
carousel: no arrows, no dots, no user control, no layout movement. The
photography is the point; the mechanism should be invisible.

## Decisions

| Decision | Choice |
|---|---|
| Where the set lives | New `heroImages[]` array on the `page` document |
| Images in the rotation | Current hero (`IMG_0228`), plus `IMG_0226` and `19D34CBF-…` |
| Pacing | 8s hold, 2s dissolve, 30s cycle for three images |
| Loading | All slides eager; priority hints keep slide 1 the LCP image |
| Client JS | None |

### Rejected candidates

`IMG_9650` (purple bud macro on black) is a hard tonal jump from the warm
greenhouse shots, and a gold-to-purple dissolve passes through a muddy
midpoint. `IMG_4534` (portrait of a person in the grow) is 3:4 with a centred
subject; cropped into a wide, short band it becomes a torso, and a face under
the wordmark with a 42% scrim over it reads badly. Both are good photographs
for other slots.

## Content model

`studio/schemaTypes/page.ts` gains:

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
    'Backdrop photographs, crossfaded on the homepage. The first loads ' +
    'immediately and is what most visitors see; the rest fade in behind it.',
})
```

`heroImage` is untouched. `about-us.astro` renders it as an inline banner, so
it is not a homepage-only field and cannot be repurposed.

`src/lib/sanity.ts`: `Page` gains `heroImages?: SanityImage[]`, and `getPage`'s
projection gains `heroImages[] { asset->, alt, crop, hotspot }`.

`index.astro` prefers `heroImages` and falls back to `[ heroImage ]` when the
array is empty. The fallback is load-bearing rather than defensive: the home
document has `heroImage` set and no `heroImages` today, and Sanity publishes
rebuild against `main`, so the array cannot be populated until this merges.
Without the fallback the homepage loses its backdrop in that window.

## Component structure

`HeroBackdrop.astro`'s prop becomes `images: SanityImage[]`. The existing
"a cleared Sanity image field leaves an empty object behind" guard applies per
item. Zero usable images renders the bare `<slot />`, as today. One renders a
single static image with no animation, also as today.

Markup gains one wrapper per image:

```html
<div class="hero-backdrop">
  <div class="hero-backdrop-slide"><img class="hero-backdrop-image" …></div>
  <div class="hero-backdrop-slide"><img class="hero-backdrop-image" …></div>
  <div class="hero-backdrop-slide"><img class="hero-backdrop-image" …></div>
  <div class="hero-backdrop-scrim"></div>
  <div class="hero-backdrop-content"><slot /></div>
</div>
```

The slide wrapper is `position: absolute; inset: 0`, which makes it the
containing block for the image. The parallax rules — `top: -20%`,
`height: 140%`, the ±10% translate, the whole `@supports` block — therefore
resolve against exactly the same box they resolve against today and need no
change. **The wrapper owns opacity; the image owns transform.** Keeping the two
animations on separate elements avoids interleaving a scroll-driven timeline
and a document timeline in one comma-separated `animation-*` list, where the
existing `@supports` guard would have to restate every longhand.

Painting order comes from DOM order, so the slides need no `z-index` relative
to each other, and all of them stay below the existing scrim.

The `srcset` construction currently inlined in `HeroBackdrop` moves to
`heroBackdropSources( image )` in `src/lib/image.ts`, returning
`{ src, srcset, width }`. Three slides need identical source-width clamping and
candidate lists; that is one mechanic, not three.

## Crossfade

With `hold = 8s`, `fade = 2s`, `period = hold + fade = 10s`, and
`cycle = N × period`:

```
t=0 ──────8──10────────18──20────────28──30
img1 ████████▓▓                        ▒▒████   static, opacity 1, no animation
img2         ▒▒████████▓▓  ← snaps off at t=20, hidden beneath img3
img3                 ▒▒████████▓▓  ← fades OUT, revealing img1
     ▒▒ fading in    ▓▓ covered or fading out
```

Image 1 never animates. Each later image fades in *above* an already-opaque
layer. The last image fades back out to reveal image 1, closing the loop.

### Why not the symmetric version

The obvious implementation — every slide fading in and out on one shared
keyframe with staggered negative delays — has a **dip**. Mid-transition both
layers sit at 0.5 opacity, and compositing gives `0.5 + 0.5 × 0.5 = 0.75` total
coverage, so 25% of the dark page background flashes through on every
transition. Avoiding it requires that only one layer is ever in motion, over an
opaque layer beneath. That constraint is what forces the asymmetry: a static
first slide, fade-ins in the middle, and a fade-out on the last.

A useful side effect is that the LCP image is the one layer with no animation,
no compositor promotion, and no dependency on the generated CSS below.

### Keyframe generation

For slide `i` in `1 … N-1` (0-indexed; slide 0 is static):

| Point | Time | Meaning |
|---|---|---|
| fade-in start | `i × period − fade` | previous slide is still fully opaque |
| fade-in end | `i × period` | this slide is now the visible one |
| off (i < N−1) | `(i + 1) × period` | snap to 0, hidden beneath slide `i+1` |
| fade-out (i = N−1) | `cycle − fade` → `cycle` | dissolve back to slide 0 |

For N=3 that yields:

```css
@keyframes hero-crossfade-1 {
  0%, 26.6667% { opacity: 0 }
  33.3333%     { opacity: 1; animation-timing-function: step-end }
  66.6667%     { opacity: 0 }
  100%         { opacity: 0 }
}
@keyframes hero-crossfade-2 {
  0%, 60%             { opacity: 0 }
  66.6667%, 93.3333%  { opacity: 1 }
  100%                { opacity: 0 }
}
```

`animation-timing-function: step-end` on a keyframe holds that segment's start
value and jumps at its end, which is how slide 2 turns off instantly at t=20
while covered. The alternative is two keyframes a thousandth of a percent
apart.

Keyframe selectors cannot be CSS custom properties, and the percentages depend
on the image count, so `HeroBackdrop.astro` computes them and emits the blocks
in a `<style is:inline>`. `is:inline` is Astro's documented instruction to
leave a style tag unscoped and unbundled. Structural rules — `position`,
`opacity`, `animation-duration`, `linear`, `infinite` — live in `global.css`;
only the count-dependent percentages are generated.

Per-slide keyframes are deliberate over one shared keyframe with staggered
negative delays. The delay arithmetic is exactly where this pattern goes
subtly wrong, and generated output that can be read straight off the page is
worth more here than terseness.

Hardcoding three keyframe blocks in `global.css` and validating exactly three
images in Studio was considered and rejected. `rule.length()` is Studio-side
only — the Content Lake does not enforce it, as `blogPost.author` proved in
[#34](https://github.com/nw-local/nw-local.com/pull/34) — so an API write of a
fourth image would silently break the rotation. Generating from
`images.length` is correct for any N.

## Loading

Slide 1 keeps `fetchpriority="high"`; it remains the LCP element. Slides 2 and
3 get `fetchpriority="low"` and `decoding="async"`, so the browser commits to
slide 1 first and backfills the rest from spare capacity.

`loading="lazy"` is not used and would not help. Lazy-loading keys off viewport
intersection, not visibility, and all slides are stacked inside the hero band —
the browser fetches them immediately regardless of `opacity: 0`.

Cost: the current hero is 212 KB at 1600w webp, so three slides is roughly
640 KB on a desktop first load, up from 212 KB. LCP is unaffected.

## Accessibility and failure modes

Slides after the first get `opacity: 0` in `global.css`. If the generated
keyframes never arrive, the homepage shows image 1 and nothing else — exactly
today's behaviour.

The existing `prefers-reduced-motion` block gains `animation: none` on
`.hero-backdrop-slide`, landing on that same state: one still photograph.

WCAG 2.2.2 asks for a pause mechanism on content that updates automatically for
more than five seconds. Honouring `prefers-reduced-motion` is the pragmatic
answer here rather than a literal satisfaction of that criterion; a visible
pause control on a decorative backdrop was judged worse than the problem it
solves. Recorded so the tradeoff is visible rather than assumed.

All slides keep `alt=""`. They are decorative; the hero's meaning is carried by
the lockup and copy above them.

`will-change: transform` on three images means three compositor layers instead
of one, plus the opacity animations. Acceptable, and it only applies while the
hero is on screen.

## Image preparation

Neither `IMG_0226.JPG` nor `19D34CBF-257C-4180-83A6-ADDF2958CE36.jpg` is in
Sanity yet. Both come from the Dropbox gallery directory. Prepare and upload
with the existing targets:

```
mkdir -p <scratch>/hero && cp <the two source files> <scratch>/hero/
make prep-images DIR=<scratch>/hero STRAIN="Hero"
make upload-image FILE=<scratch>/hero/_processed/<file>.jpg LABEL=… DESCRIPTION=…
```

The copy step matters: `prep-images` converts every image at `maxdepth 1` of
the directory it is given, and the Dropbox gallery holds far more than these
two. Point it at a scratch directory containing only the intended files.

`prep-images` deduplicates against `sha1hash` on Sanity's image assets, so
re-running it is safe. Every asset needs a `description` for alt-text tooling
even though the slides render `alt=""` — the descriptions are what
`/describe-assets` and the content audit check.

## Verification

No test framework is configured, so verification is:

1. `yarn astro check` — types, including the new `heroImages` projection
2. `make build` — against real Sanity content, catching GROQ and env issues
3. Inspect `dist/index.html` for three `.hero-backdrop-slide` elements and two
   generated `@keyframes` blocks
4. Visual confirmation in the dev server the user already has running —
   dissolve smoothness, no background flash at any transition, no cut at the
   30s wrap

Step 4 cannot be delegated to a headless browser here: the failure mode is a
sub-second flash mid-dissolve, which a screenshot at an arbitrary moment will
not catch.

## Out of scope

- Applying the rotation to any page other than the homepage
- Editor control over hold and fade durations
- Randomised or per-visit ordering
- Ken Burns / scale drift on top of the existing parallax
