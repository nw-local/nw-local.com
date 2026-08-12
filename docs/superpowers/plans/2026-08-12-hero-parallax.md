# Homepage Hero Parallax Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the homepage hero photograph drift vertically as the page scrolls, and sit flush against the nav.

**Architecture:** Pure CSS. A scroll-driven animation translates `.hero-backdrop-image` inside its clipping parent, driven by document scroll progress. No JavaScript, no new dependencies, no component changes — every edit is in one stylesheet.

**Tech Stack:** Astro 6 (SSG), plain CSS with custom properties, CSS scroll-driven animations (`animation-timeline: scroll()`). Package manager is yarn.

**Spec:** `docs/superpowers/specs/2026-08-12-hero-parallax-design.md`

## Global Constraints

- **No test framework exists in this project.** `yarn astro check` (what CI runs, `ci.yml:23`) must hold at **0 errors, 0 warnings, 5 pre-existing hints**. Plus `make build`. Do not add a test framework.
- **This feature cannot be verified from built output alone.** Every failure mode here renders as a silent, perfectly static element with no error, warning, or console message. Task 3 drives a real browser and is mandatory.
- **Never start the Astro dev server.** `yarn dev` / `make dev` are hook-blocked. Task 3 uses a throwaway static file server for `dist/`, which is a different thing — see that task for the exact constraint.
- **Longhand animation properties only.** The `animation` shorthand resets `animation-duration` to `0s`, which silently kills a scroll-driven animation.
- **Whitespace inside parens** is house style: `function name( argument )`, `if( condition )`. ESLint enforces it.
- **No `as` assertions, no `eslint-disable`, no single-character identifiers.**
- **Run `yarn format` before every commit.**
- **No Claude attribution** in commit messages or PR bodies.
- **Only `src/styles/global.css` changes.** If a task seems to need a component or config edit, stop and report — that is a sign the plan is wrong.

---

### Task 1: Sit the hero flush under the nav, and switch the clip mode

Two prerequisites in one commit, because both are single-property changes to the same rule and a reviewer would accept or reject them together.

`main` has `padding: 2rem 1.5rem`; the top 2rem leaves a visible dead band between the nav and the full-bleed hero. And `.hero-backdrop` uses `overflow: hidden`, which **makes the element a scroll container** — Task 2's timeline would resolve against that box, which never scrolls, and never advance.

**Files:**
- Modify: `src/styles/global.css:53-57` (the `main` rule), `:1-25` (`:root`), `:431-437` (`.hero-backdrop`)

**Interfaces:**
- Produces: `--page-padding-block: 2rem` on `:root`, consumed by `main` and by `.hero-backdrop`'s negative top margin.
- Produces: `.hero-backdrop` with `overflow: clip`, which Task 2 depends on absolutely.

- [ ] **Step 1: Confirm the baseline**

Run: `yarn astro check`
Expected: `0 errors, 0 warnings, 5 hints`. If it differs, stop and report before changing anything.

- [ ] **Step 2: Extract the page block padding to a custom property**

In `src/styles/global.css`, add to the `:root` block, directly below `--content-width: 720px;`:

```css
  /* main's vertical padding, extracted so the full-bleed hero can cancel it
     with a negative margin without duplicating the literal. */
  --page-padding-block: 2rem;
```

Then change the `main` rule to consume it:

```css
main {
  width: 100%;
  max-width: var(--max-width);
  margin: 0 auto;
  padding: var(--page-padding-block) 1.5rem;
}
```

- [ ] **Step 3: Make the backdrop flush and switch it to `clip`**

Replace the `.hero-backdrop` rule:

```css
.hero-backdrop {
  position: relative;
  /* clip, not hidden. `hidden` makes an element a scroll container, which
     would leave the parallax timeline in Task 2 resolving against a box that
     never scrolls — the animation would attach, report as running, and never
     advance a single frame. `clip` clips identically without creating one.
     Same distinction as the `overflow-x: clip` on html near the top of this
     file, for the same underlying reason. */
  overflow: clip;
  isolation: isolate;
  width: 100vw;
  margin-inline: calc(50% - 50vw);
  /* Cancel main's top padding so the photograph meets the nav with no band
     of page background between them. */
  margin-top: calc(-1 * var(--page-padding-block));
}
```

- [ ] **Step 4: Verify the type check and build**

Run: `yarn format && yarn astro check`
Expected: `0 errors, 0 warnings, 5 hints`.

Run: `make build`
Expected: succeeds.

- [ ] **Step 5: Confirm the rules reached the bundle**

```bash
grep -o '\.hero-backdrop{[^}]*}' dist/_astro/*.css
grep -o 'main{[^}]*}' dist/_astro/*.css
```

Expected: `.hero-backdrop` contains `overflow:clip` and `margin-top:calc(-1 * var(--page-padding-block))`; `main` contains `padding:var(--page-padding-block) 1.5rem`. If `overflow:hidden` is still present, Task 2 cannot work.

- [ ] **Step 6: Commit**

```bash
git add src/styles/global.css
git commit -m "fix: sit the hero flush under the nav, and clip rather than hide

main's 2rem top padding left a band of page background between the nav
and the full-bleed hero. The padding moves into --page-padding-block so
the hero can cancel it without duplicating the value.

overflow also changes from hidden to clip. They clip identically, but
hidden makes the element a scroll container, which would break the
scroll-driven parallax that lands next: its timeline would resolve
against a box that never scrolls."
```

---

### Task 2: The parallax animation

**Files:**
- Modify: `src/styles/global.css:439-446` (`.hero-backdrop-image`), plus a new `@supports` block after it, plus the `prefers-reduced-motion` block near the end of the file

**Interfaces:**
- Consumes: `.hero-backdrop { overflow: clip }` from Task 1. Without it this task produces no visible motion whatsoever.
- Produces: `@keyframes hero-parallax` and an animated `.hero-backdrop-image`, verified in Task 3.

- [ ] **Step 1: Add the animation, guarded**

In `src/styles/global.css`, immediately after the existing `.hero-backdrop-image` rule (which ends at the line before the flat-scrim comment), add:

```css
/* The photograph drifts as the page scrolls while the lockup and copy stay
   put. Three details here are load-bearing, and every one of them fails
   silently — no error, no warning, just a static image:

   1. scroll(), not view(). view() measures an element's progress through the
      viewport, starting when it enters from the bottom edge. A hero at the top
      of the page never enters from below, so a view() timeline starts at a
      negative position and stays pinned to its first keyframe for most of the
      hero's time on screen.
   2. Longhand properties. The `animation` shorthand resets animation-duration
      to 0s, and a scroll-driven animation needs `auto` to fill its timeline.
   3. The @supports guard. Without it, a browser lacking scroll-timeline
      support drops animation-timeline and animation-duration: auto, leaving a
      0s animation whose `both` fill mode applies the END keyframe forever —
      a permanent 10% offset rather than no effect.

   The overhang and the travel are coupled: the image is 40% taller than its
   box and travels +/-10%, so its edge never slides into view. Changing either
   number without the other is a bug. */
@supports (animation-timeline: scroll()) {
  .hero-backdrop-image {
    /* The base rule sets `inset: 0`. Setting top and height while bottom
       stays 0 over-constrains the box, leaving the outcome to the browser's
       tie-breaking rule instead of to intent. Release bottom explicitly. */
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
    to { transform: translateY(10%); }
  }
}
```

- [ ] **Step 2: Extend the reduced-motion block**

Find the `@media (prefers-reduced-motion: reduce)` block near the end of `src/styles/global.css`. It already contains a rule listing `.hero-accent`, `.nav-logo-image` and `.portable-text p` with `animation: none`. Add a separate rule inside the same block:

```css
  .hero-backdrop-image {
    animation-name: none;
    transform: none;
  }
```

Use `animation-name: none` rather than the `animation` shorthand, for the same reason as above.

- [ ] **Step 3: Verify the type check and build**

Run: `yarn format && yarn astro check`
Expected: `0 errors, 0 warnings, 5 hints`.

Run: `make build`
Expected: succeeds.

- [ ] **Step 4: Confirm the animation survived minification**

The minifier strips whitespace, so match loosely rather than against the
source formatting:

```bash
grep -c 'animation-timeline' dist/_astro/*.css
grep -c 'hero-parallax' dist/_astro/*.css
grep -o 'animation-duration:auto' dist/_astro/*.css
grep -o '@supports[^{]*animation-timeline[^{]*{' dist/_astro/*.css
```

Expected: the first two counts are non-zero, and both remaining greps
produce output.

`animation-duration:auto` appearing as its own declaration is the specific
thing to confirm: if the minifier collapsed the longhand properties into the
`animation` shorthand, the duration would become `0s` and the animation would
silently do nothing. If that grep comes back empty while the others match,
stop and report it rather than proceeding — it means the build pipeline is
rewriting the feature out from under us.

- [ ] **Step 5: Commit**

```bash
git add src/styles/global.css
git commit -m "feat: parallax the homepage hero photograph on scroll

CSS scroll-driven animation, no JavaScript, so it runs on the compositor
and cannot cause scroll jank. The photograph travels -10% to 10% over the
first viewport height of scrolling while the lockup and copy stay put.

Uses scroll(root block) rather than view(): a hero at the top of the page
never enters the viewport from below, so a view() timeline starts at a
negative position and sits pinned to its first keyframe for most of the
hero's time on screen.

Guarded by @supports, because without it an unsupporting browser drops
the timeline and applies the end keyframe as a permanent static offset.
Reduced motion disables it alongside the other animations."
```

---

### Task 3: Verify in a real browser, then open the PR

Static verification cannot catch this feature's failure modes. Every one of them produces a valid stylesheet and a motionless element.

**Files:** none modified.

**Interfaces:**
- Consumes: the built `dist/` from Task 2.

- [ ] **Step 1: Serve the built output**

The Astro dev server is hook-blocked and must not be started. This is a throwaway static file server for the already-built `dist/` directory — no watching, no HMR, no relation to the user's running dev server. Use a high port to avoid any collision, and shut it down in Step 5.

```bash
make build
python3 -m http.server 8931 --directory dist
```

Run it in the background so the session can continue.

- [ ] **Step 2: Drive the page and sample the transform**

Using the Playwright MCP tools, navigate to `http://localhost:8931/` and evaluate:

```js
async () => {
  const image = document.querySelector('.hero-backdrop-image');
  const nextFrame = () => new Promise(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const sample = async (scrollY) => {
    window.scrollTo(0, scrollY);
    await nextFrame();
    const matrix = new DOMMatrix(getComputedStyle(image).transform);
    return { scrollY, translateY: Math.round(matrix.m42 * 10) / 10 };
  };
  const samples = [];
  for (const scrollY of [0, 100, 300, 600, 900]) samples.push(await sample(scrollY));
  window.scrollTo(0, 0);
  await nextFrame();
  const hero = document.querySelector('.hero-backdrop').getBoundingClientRect();
  const header = document.querySelector('header').getBoundingClientRect();
  return {
    samples,
    movesFromFirstPixel: samples[0].translateY !== samples[1].translateY,
    monotonic: samples.every((sample, index) =>
      index === 0 || sample.translateY > samples[index - 1].translateY),
    gapUnderNav: Math.round(hero.top - header.bottom),
    heroSpansViewport:
      Math.round(hero.width) === Math.round(document.documentElement.clientWidth),
  };
}
```

**Two animation frames of settle time are required.** Scroll-driven animations are committed on the compositor, so reading `getComputedStyle` immediately after `scrollTo` returns a stale frame and makes a working animation look frozen. This exact mistake produced a false negative while designing the feature.

- [ ] **Step 3: Assert the results**

Required:
- `movesFromFirstPixel: true` — motion begins immediately. `false` means the `view()` bug has recurred.
- `monotonic: true` — the transform progresses steadily rather than jumping or clamping.
- `gapUnderNav: 0` — the hero meets the nav.
- `heroSpansViewport: true` — full bleed intact.
- The spread between the first and last `translateY` should be roughly 90-100px on a desktop viewport.

If `movesFromFirstPixel` is `false`, do not adjust numbers hoping it resolves. Check in order: is `overflow: clip` actually in the bundle; is `animation-duration:auto` present as a longhand; did the `@supports` block survive.

- [ ] **Step 4: Confirm the unsupported-browser fallback**

Still in the browser, evaluate:

```js
() => ({
  supportsScrollTimeline: CSS.supports('animation-timeline', 'scroll()'),
  computedAnimationName: getComputedStyle(
    document.querySelector('.hero-backdrop-image')).animationName,
})
```

If `supportsScrollTimeline` is `true`, `computedAnimationName` should be `hero-parallax`. Note in the report that the unsupported path is guarded by `@supports` and therefore cannot apply a stray end-keyframe offset — that is the property the guard exists to provide.

- [ ] **Step 5: Stop the server**

Kill the background `http.server` process. Confirm nothing is still listening on 8931.

- [ ] **Step 6: Run the full CI-equivalent check**

```bash
yarn format
yarn astro check
yarn lint
make build
```

Expected: `astro check` at `0 errors, 0 warnings, 5 hints`; lint clean; build succeeds.

- [ ] **Step 7: Push the branch**

```bash
git push -u origin hero-parallax
```

Run this as its own command. Do not chain it with `gh pr create`: the push-to-main guard false-positives on compound commands containing the word "main".

- [ ] **Step 8: Open the PR**

```bash
gh pr create --base main --title "Parallax the homepage hero photograph on scroll" --body "$( cat <<'EOF'
The hero photograph now drifts as the page scrolls while the lockup and copy stay put. Pure CSS, no JavaScript, running on the compositor so it cannot cause scroll jank.

Design: `docs/superpowers/specs/2026-08-12-hero-parallax-design.md`

## Also in this PR

The hero now sits flush under the nav. `main`'s 2rem top padding was leaving a band of page background above the full-bleed image; that padding moved into `--page-padding-block` so the hero can cancel it without duplicating the literal.

## Three silent failure modes, for whoever touches this next

Every one of these produces a valid stylesheet and a completely static image — no error, no warning, nothing in the console.

- **`scroll()`, not `view()`.** `view()` measures an element's progress through the viewport starting from when it enters at the bottom edge. A hero at the top of the page never enters from below, so its timeline starts at a negative position and stays pinned to the first keyframe for most of the hero's time on screen. Measured: at scroll 0 and scroll 600 the transform was identical.
- **`overflow: clip`, not `hidden`.** `hidden` makes an element a scroll container, so the timeline resolves against a box that never scrolls. Same distinction as the `overflow-x: clip` already on `html`.
- **Longhand animation properties.** The `animation` shorthand resets `animation-duration` to `0s`, and a scroll-driven animation needs `auto` to fill its timeline.

The `@supports` guard is also not optional: without it, an unsupporting browser drops the timeline and applies the *end* keyframe permanently, leaving a static 10% offset rather than no effect.

## Firefox

Scroll-driven animations are behind a flag there, so Firefox visitors get today's static hero. Deliberate: no JavaScript fallback for roughly 2-3% of traffic.

## Verification

`yarn astro check` 0 errors / 0 warnings / 5 pre-existing hints, `yarn lint` clean, `make build`. Because static checks cannot catch any of the failure modes above, the built page was also driven in a real browser: the transform was sampled at five scroll offsets with two animation frames of settle time, confirming motion begins at the first pixel and progresses monotonically, and that the gap under the nav is 0 with the hero spanning the viewport.
EOF
)"
```

- [ ] **Step 9: Report the PR link**

Include the measured `translateY` samples so the reviewer can see the motion was verified rather than assumed, and note that merging changes the live homepage immediately since the hero content is already published.
