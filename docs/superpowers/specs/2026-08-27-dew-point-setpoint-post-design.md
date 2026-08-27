# Dew Point Is the Setpoint: VPD by Stage

Design for a third cultivation-science post, plus the surgery it implies on the
two that already exist.

Date: 2026-08-27
Status: approved, not yet drafted

## Problem

The CO2 post is 107 blocks and roughly 3,900 words across 11 tables. Five of
those tables are not about CO2:

| Block | Table | Actually about |
|-------|-------|----------------|
| 44 | Relative humidity implied by canopy temperature and VPD target | VPD math |
| 51 | Humidity that holds the dry end of the VPD band | VPD and disease |
| 52 | The two pathogens respond differently | Disease thresholds |
| 77 | Highest dew point that still holds humidity under the threshold | Dew point |
| 80 | What to measure, and where | Sensor placement |

Two more are hybrids: block 6 (ambient room against enriched room) and block 73
(cool finish night setpoints), the latter being a purple-post idea living in the
CO2 post. The section `Running the humidity numbers yourself` (blocks 35 to 45)
derives the Magnus equation and `RH = 1 - (VPD / SVP)` from scratch, which is a
general climate primer sitting inside an article about a gas.

The purple post leaks the same way in miniature. `The bud rot problem` (blocks
22 to 26) and four of the six protocol steps are environmental-control content
phrased for a cool finish.

Both posts independently grew a dew-point-threshold table because both needed
one. That duplication is the missing third article announcing itself.

## Thesis

VPD is a number you calculate, not a number you control. Dew point is what you
actually hold, disease risk is what sets its ceiling, and the dark period is
what sizes your equipment.

Both existing posts already gesture at this without stating it. The CO2 post
says "alarm on dew point, not on a percentage." The purple post says "the dark
period, not the day, sets the equipment you need." Same argument, made twice, by
accident.

## Decisions

Each of these was chosen against alternatives during brainstorming.

### Shape: explainer with a cheat-sheet head

Tables in the first screen with no preamble, full derivation below. Rejected: a
strict tables-only cheat sheet, which would make this the one shallow article on
a site whose readers arrive from two posts that showed their math; and a plain
long-form explainer, which would repeat the burial problem this post exists to
fix.

### Enriched rooms: ambient baseline plus one delta table

Stage tables stay narrow and ambient. A dedicated `If the room is enriched`
section carries the deltas. Rejected: paired ambient/enriched columns throughout,
which doubles table width and makes the reader subtract by hand; and ambient-only
with a pointer, which leaves the delta in the other article.

The delta is the unit of information a grower carries between rooms, so it gets
stated as a delta (`+6 °F (3 °C)`, `+6 to 8 points RH`) rather than as two absolutes.

The CO2 post keeps its own absolutes table, because that is its argument. These
are deliberately two different tables rather than one duplicated, so they cannot
drift apart later.

### Sourcing: house practice, stated as house practice

Setpoints are published as "these are the numbers we run, here is the reasoning,
here is the literature where it exists." Rejected: published-only with unbacked
rows labeled as convention, which hedges a cheat sheet into uselessness; and two
parallel tables, which makes the reader reconcile them.

Most stage-by-stage VPD guidance in circulation traces to greenhouse convention
and vendor blog posts, not to cannabis trials. Clone and veg are the thin rows.
As a licensed producer, our own operating numbers are a legitimate primary
source and a more honest one than repackaging convention as science.

**This inverts the failure mode.** In the other two posts, citations carry the
claims and the risk is an uncited assertion. Here citations corroborate, and the
risk is a cited paper that does not say what the row implies. Every reference
gets read, not recalled.

### Scope: living plant only

Clone through finish. Drying, curing and finishing are explicitly out of scope
and named as a future post.

VPD is the organizing concept, and it stops being the right lens the moment the
plant is cut. A living plant is a transpiration problem. A drying plant is a
water-activity and terpene-retention problem, where a setpoint of 60 °F (16 °C)
at 60 percent means something else entirely. Rejected: a whole-facility article, which
is two articles; and a short dry-room section, which is too brief to run a room
off and long enough to imply it could be.

### Title

`Dew Point Is the Setpoint: VPD by Stage`, slug
`dew-point-is-the-setpoint-vpd-by-stage`.

The phrase before the colon states the thesis and is the part a reader repeats.
The phrase after it carries the search terms, since `post.title` feeds both the
`<h1>` and the `<title>` tag (`src/pages/blog/[...slug].astro:53,59`) and the
thesis phrase alone contains none of the words anyone types. House convention is
slug mirrors title, which both existing posts follow.

Slug choice is sticky: per the `redirects` invariant, renaming a published slug
later requires publishing Sanity first or both URLs break.

## Structure

### Part 1: the first screen, no preamble

| H2 | Contains |
|----|----------|
| Setpoints by stage | Two tables, see width constraint below |
| If the room is enriched | Delta table |
| What to measure, and where | Sensor placement, from CO2 block 80 |

### Part 2: the receipts

| H2 | Source | Argument beat |
|----|--------|---------------|
| VPD is a derived number | CO2 35 to 45 | the math |
| Leaf temperature is not room temperature | CO2 33 | why the math is approximate |
| Disease sets the ceiling, not yield | CO2 46 to 55, purple 23 to 24 | the constraint |
| Why dew point is the setpoint you hold | CO2 75 to 81 | the answer, and the payload |
| The dark period sets your equipment | purple 25 to 26 | the bill |
| Airflow, and why 0.3 to 0.5 m/s | purple 32 | changes effective VPD without changing setpoints |
| Substrate temperature | purple 33 | coco below 60 °F (16 °C) stalls uptake |
| What this doesn't cover | new | names the drying post and the thin rows |
| References | | |

The ordering is an argument, not a list: here is the math, here is why it is
approximate, here is the constraint it has to respect, here is the number that
respects it, here is what that costs, here are two things setpoints do not
capture.

The disease section sits before dew point because dew point is the answer and
the pathogen thresholds are the question. Because the title promises an argument,
`Why dew point is the setpoint you hold` is the payload rather than one beat
among eight, and sits ahead of the airflow and substrate sections.

Roughly 3,000 to 3,500 words. Shorter than the CO2 post despite absorbing a
third of it, because the enriched-room hedging comes out.

### Table width constraint

The widest table currently published on the site is 5 columns. Verified across
the whole dataset, not just the blog: 14 `tableBlock` entries across all 30
documents with a body, and exactly one of them reaches 5 columns (CO2 block 44).
An 8-column stage table would be 60 percent wider than anything shipped.
`.pt-table-scroll` would handle it, since `global.css:1033` sets `overflow-x:
auto` with a font-size drop at line 1113, so nothing would break.

But a wide table is legible and not comparable: you cannot see the veg row and
the late-flower row's dew point in one glance. The value of a stage table is the
diff between rows, and horizontal scroll destroys exactly that.

So the stage table splits in two, which is the correct grouping anyway. Temp,
RH, VPD and dew point are four expressions of one measurement. PPFD, DLI and
airflow are inputs set independently.

```
Climate by stage        Stage | Temp (day/night) | RH | VPD | Dew point ceiling   -> 5 cols
Light and air by stage  Stage | PPFD | DLI | Canopy airflow                        -> 4 cols
```

### Figures

Three, matching the two existing posts, which each run three. Each is tied to an
argument beat rather than a topic.

| Fig | Subject | Section |
|-----|---------|---------|
| 1 | RH curves against temperature at constant VPD | VPD is a derived number |
| 2 | Temp x RH plane with Botrytis and powdery mildew regions, and the box that clears both | Disease sets the ceiling |
| 3 | Two rooms at different temp and RH holding the same dew point, with the condensation line | Why dew point is the setpoint |

Figure 1 shows the curvature, which the table cannot: five points versus an
exponential, and that exponential is the whole reason a fixed VPD means very
different RH at 68 °F (20 °C) than at 85 °F (29 °C).

A leaf-boundary-layer diagram was considered and dropped. Airflow is a short
section and does not carry a figure's weight.

**Risk on figure 2.** Under the house-practice framing, a chart drawing a "safe
box" is the strongest claim in the article, and its boundaries must come from
Mahmoud et al. and Buirs et al. rather than from us. If the citations do not
support a boundary cleanly, the box gets a soft edge or the figure does not ship.

## Surgery

The extraction is not symmetric. The CO2 post has a structural problem. The
purple post mostly has a linking opportunity.

The test for what moves is not "is this on topic." It is whether the content is
*referential* (exists so you can look up a number, migrates cleanly to a hub) or
*argumentative* (exists to prove a point, should stay where the argument is).

### CO2 post: 107 blocks to roughly 78

| Blocks | Section | Action |
|--------|---------|--------|
| 5 to 8 | Climate that goes with those setpoints | Keep table 6, it is the post's own thesis as absolutes. Block 8's note becomes a link. |
| 29 to 34 | Relative humidity: disease sets the ceiling | Mostly keep. Blocks 31, 32, 34 are CO2-specific: why humidity must rise, what too dry costs, why dehumidification load falls. Only block 33 moves. |
| 35 to 45 | Running the humidity numbers yourself | Remove entirely. Two sentences and a link replace 11 blocks. Table 44 moves. |
| 46 to 55 | Powdery mildew and bud rot | Condense hard. Keep 47 and 50, the enriched-room answer. Tables 51 and 52 move with blocks 48, 49, 53 to 55. Retitle to `What the warmer room does to disease risk`. |
| 75 to 81 | Setting the dew point target | Remove. Tables 77 and 80 move. |

Five of eleven tables leave. The six that stay are all about gas: CO2 by stage,
ambient against enriched, injection through the photoperiod, the taper, cool
finish nights, Chandra. Roughly 1,000 words lighter.

Blocks 73 and 74 stay. That table is taper-specific even though it is the
clearest purple crossover in either article.

### Purple post: 49 blocks to roughly 46

Keep blocks 22, 23, 25. The 8 to 12 hour leaf wetness window and the cold-night
dehumidification load are the cost of the color, which is the post's honest core
and should not be outsourced. Blocks 24 and 26 condense to pointers.

Keep all four protocol steps at 30 to 33. Add a link on the dehumidify step and
the airflow step.

Loses roughly 250 words, gains two links.

### Link graph

Hub and spoke, new post as hub. Every removal gets a pointer at the removal site,
so there are no holes.

- CO2 to new, at three wounds: where the math was, where the disease tables
  were, where dew point was
- Purple to new, at two: the bud rot section, the protocol
- New to CO2, from `If the room is enriched`
- New to purple, from `The dark period sets your equipment`

Because headings carry anchor ids (a25c06d), the CO2 post's dead
`#running-the-humidity-numbers-yourself` deep link degrades to "landed on the
post, section moved" rather than "section gone," provided the pointer sits where
the section was.

## Mechanics

**No code changes.** Everything needed already exists:

- `tableBlock` takes `caption`, `headers`, `rows[].cells`, with ragged-row
  validation in the schema
- Portable Text `image` blocks carry `alt` and `caption`
- Heading anchor ids ship, so pointers can deep-link into specific sections
- `check-content-style.py` enforces Fahrenheit-first and US spelling, blocking in
  both `deploy.yml` and `audit.yml`

Content-side constraints, all from existing invariants:

- **Alt text is stored twice.** Each figure needs the inline `alt` on the image
  object and the asset `description`, seeded together. The page renders the
  inline one.
- **Every ceiling rounds down.** The dew point column and the RH ceilings get
  computed with directional rounding and checked against their own captions. The
  existing block 77 table shipped five of ten cells over its own stated
  threshold; moving it forward without recomputing would make the bug canonical.
- **Both units, Fahrenheit first**, including figures converted from papers that
  reported Celsius.
- **No em dashes** in any visitor-facing string, captions and alt text included.
- **Print matters more here than for any other post.** A stage-setpoint reference
  is the most printable page on the site. Nothing in the build catches a print
  regression, so the printed output gets checked by hand.

## Sequencing

Order matters in one direction only. If the CO2 edits land before the new post
exists, that post has five holes and three links to a 404. The reverse is
harmless: a window of duplicated content.

Publish all three documents in a single **Sanity release**, so one webhook fires
one rebuild with no intermediate broken state. Fallback if releases prove awkward
on this dataset: publish the new post first, verify it is live, then the two
edits.

**Verification constraint.** `src/lib/sanity.ts` sets no `perspective`, so the
client fetches published documents only and drafts do not render in a local
build. Pre-publish rendering verification requires temporarily pointing a local
build at the drafts perspective and reverting it.

### Order of work

1. Draft the new post in Sanity, body first, stage tables last. Clone and veg
   rows are thinnest and should not set the tone.
2. Verify every number while it is still a draft. Read the citations.
3. Recompute the dew point and RH ceilings with directional rounding.
4. Generate the three figures, seeding inline `alt` and asset `description`
   together.
5. Draft the CO2 and purple edits.
6. Local build against the drafts perspective, verify rendering, revert.
7. Publish the release.
8. Verify the live site.

### Verification checklist

| Check | How |
|-------|-----|
| Page count | `make build`, should rise by exactly 1 |
| Content style | `make check-content-style` |
| Em dashes | `grep -o` piped to `wc -l` on all three built pages, occurrences not lines |
| Internal links | Every pointer from CO2 and purple resolves, anchors included |
| Alt text | Grep built HTML for each figure's alt, the inline copy not the asset description |
| Threshold tables | Recomputed by hand against each caption's stated limit |
| Print | Load the new post, check printed output |
| RSS | New post in the feed with `<dc:creator>` |
| Types | `yarn astro check` clean |

## Deferred

- A CLAUDE.md invariant for the 5-column table ceiling. Real, but this is the
  first time it has bitten, and the project rule is to promote at the second
  occurrence.
- The drying, curing and finishing post, which this one's out-of-scope line
  promises.
