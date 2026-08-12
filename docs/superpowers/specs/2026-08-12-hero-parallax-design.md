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

### `overflow: clip` on the backdrop

`.hero-backdrop` is currently `overflow: hidden`. It must clip something either
way, because the image is 140% of the box height and would otherwise paint over
the content below. `clip` is preferred over `hidden` because it clips
identically without making the element a scroll container, and there is no
reason for the hero to be one.

**A correction, because an earlier draft of this spec got it wrong and the
wrong version reached a shipped comment.** That draft claimed `hidden` would
break the parallax by making the timeline resolve against a box that never
scrolls. That is true of `scroll(nearest)`, which walks the ancestor chain. It
is *not* true of `scroll(root block)`, which is what this design uses:
`root` names the document scroller explicitly and ignores ancestors entirely.
`hidden` would have clipped correctly and the animation would have worked.

The distinction is still worth knowing — it is the same one documented near the
top of `global.css`, where `overflow-x: clip` keeps the root from becoming a
scroll container and breaking `position: sticky` — but it is not what makes this
rule necessary.

### The overhang and the travel are coupled

The image is `top: -20%; height: 140%`, so it overhangs its box by 20% at the
top and 20% at the bottom.

**The two percentages are measured against different things, and comparing them
directly is wrong.** The overhang is a share of the box. The travel is a share
of the *image*, because `translateY` percentages resolve against the transformed
element's own height — and the image is 140% of the box. So a +/-10% translate
is really **+/-14% of the box**, against 20% of overhang per side. The margin is
6%, not 10%.

**That margin must stay positive**, or the image's edge slides into view
mid-scroll. Raising the travel to +/-15% looks safe against 20% of overhang and
is not: it is 21% of the box, and the edge appears. Changing either number
without the other is a bug, so both values and this arithmetic belong in one
comment beside them.

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
