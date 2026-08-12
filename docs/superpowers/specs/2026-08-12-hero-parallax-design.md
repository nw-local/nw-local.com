# Homepage Hero Parallax

**Date:** 2026-08-12
**Status:** Approved, ready for implementation

## Context

The homepage hero renders a brand lockup over a full-bleed photograph behind a
flat 42% scrim (#42, #43, #44). This adds parallax: the photograph drifts
vertically as the page scrolls while the lockup and copy stay put.

Two fixes ride along, both from looking at the shipped hero:

1. `main` has `padding: 2rem 1.5rem`, and the top 2rem leaves a dead band
   between the nav and the full-bleed hero.
2. `.hero-backdrop` uses `overflow: hidden`, which is incompatible with the
   chosen technique. See below.

## Decisions

| Question | Decision | Rationale |
|---|---|---|
| Driver | CSS scroll-driven animation, no JavaScript | Runs on the compositor, so it cannot cause scroll jank. Chrome, Edge, Safari 26+. Firefox falls back to a static hero. |
| Timeline | `scroll(root block)`, **not** `view()` | See below. This was established empirically, not from documentation. |
| Travel | `translateY(-10%)` to `translateY(10%)` | Chosen from a live demo at 10% / 20% / 36% total travel. About 94px on a 640px hero. |
| What moves | The photograph only | Moving the lockup too is a larger visual change and would destabilise the LCP element. |
| Unsupported browsers | Nothing happens | Progressive enhancement, guarded by `@supports`. |

## Why `scroll()` and not `view()`

`view()` was tried first and appeared completely dead. It was not: the animation
was live, attached to a real `ViewTimeline`, and reported `playState: running`.
It was pinned to its first keyframe.

`view()` measures an element's progress *through* the viewport, with a default
range from "starts entering at the bottom edge" to "fully exits at the top". A
hero at the very top of the page never enters from the bottom, so its timeline
starts at a **negative** position and stays clamped until the element has
scrolled well up the page. Measured at three scroll offsets:

| Scroll | Timeline position | translateY |
|---|---|---|
| 0 | -43.6% | -89.6 |
| 600 | -8.1% | -89.6 (unchanged) |
| 1200 | 27.5% | -40.4 |

Nothing moves for the first ~700px, which is most of the hero's time on screen.

`scroll(root block)` tracks document scroll progress directly, so motion begins
at the first pixel. Verified after the change:

| Scroll | translateY |
|---|---|
| 0 | -45.8 |
| 100 | -33.5 |
| 400 | +2.1 |
| 900 | +47.9 |

**The diagnostic lesson is worth keeping:** a scroll-driven animation that is
misconfigured does not error, warn, or log. It renders as a completely static
element. Confirming `getAnimations()` returns a running animation proves
nothing about whether its timeline can advance.

A second measurement trap: scroll-driven animations are committed on the
compositor, so reading `getComputedStyle` immediately after `scrollTo` returns a
stale frame and makes a working animation look frozen. Sampling must wait two
animation frames.

## Implementation

### `overflow: clip` is mandatory

`.hero-backdrop` is currently `overflow: hidden`. **`hidden` makes an element a
scroll container**, so the timeline would resolve against the backdrop, which
never scrolls, and never advance. `clip` clips identically without creating a
scroll container.

This is the same distinction already documented at `global.css:39`, where
`overflow-x: clip` is used on `html` so the root does not become a scroll
container and break `position: sticky`. Same two values, opposite direction,
both silent when wrong.

### The overhang and the travel are coupled

The image is `top: -20%; height: 140%`, so it is taller than its box by 40%. The
travel is +/-10%. **The overhang must always exceed the travel**, or the image's
edge slides into view mid-scroll. Changing one without the other is a bug, so
both values and this constraint belong in one comment.

### CSS

```css
.hero-backdrop {
  overflow: clip;                 /* was hidden — see above */
  margin-top: calc(-1 * var(--page-padding-block));
}

@supports (animation-timeline: scroll()) {
  .hero-backdrop-image {
    /* The base rule is `inset: 0`. Setting top and height while bottom stays 0
       over-constrains the box, and the result then depends on the browser's
       tie-breaking rule rather than on intent. Release bottom explicitly. */
    top: -20%;
    bottom: auto;
    height: 140%;
    will-change: transform;
    animation-name: hero-parallax;
    animation-duration: auto;
    animation-timing-function: linear;
    animation-fill-mode: both;
    animation-timeline: scroll(root block);
    animation-range: 0 100vh;
  }

  @keyframes hero-parallax {
    from { transform: translateY(-10%); }
    to   { transform: translateY(10%); }
  }
}
```

### The `@supports` guard is not optional

Without it, a browser lacking scroll-timeline support drops both
`animation-timeline` and `animation-duration: auto`, leaving a 0s animation with
`animation-fill-mode: both`. That applies the **end** keyframe permanently, so
the image sits at a static `translateY(10%)` offset forever. Guarding the whole
block means unsupported browsers get genuinely nothing.

Note also that the `animation` shorthand resets `animation-duration` to `0s`,
which silently kills a scroll-driven animation. Longhand properties only.

### Flush to the nav

Extract `main`'s block padding into a custom property so the hero's cancelling
negative margin cannot drift from it:

```css
:root { --page-padding-block: 2rem; }
main  { padding: var(--page-padding-block) 1.5rem; }
```

### Reduced motion

Extend the existing block at `global.css:944`:

```css
.hero-backdrop-image {
  animation-name: none;
  transform: none;
}
```

## Scope

Only the homepage has a `.hero-backdrop`, so nothing else is affected. The
thirteen other `Hero` pages render no backdrop at all and are untouched.

## Verification

No test framework. `yarn astro check` must hold at 0 errors / 0 warnings / 5
pre-existing hints, plus `make build`.

Because the failure mode here is silent, static verification is not sufficient.
The built page must be driven in a real browser via Playwright, sampling
`translateY` at several scroll offsets with two animation frames of settle time,
and asserting:

- the transform changes between scroll 0 and scroll 100 (motion starts
  immediately, the `view()` bug does not recur)
- the transform progresses monotonically across the range
- the gap between the nav's bottom edge and the hero's top edge is 0
- the hero's width equals the viewport width

Do not start a dev server; drive the built output from `dist/`.

## Out of scope

- Moving the lockup or copy. Photograph only.
- A JavaScript fallback for Firefox. A static hero there is the accepted
  outcome, at roughly 2-3% of traffic.
- Any change to the scrim, which was settled in #43.
