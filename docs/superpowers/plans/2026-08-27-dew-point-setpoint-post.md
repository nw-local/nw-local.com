# Dew Point Is the Setpoint: VPD by Stage. Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a third cultivation-science post that owns the environmental-control material currently scattered across the CO2 and purple posts, and slim those two down to their own arguments.

**Architecture:** Pure Sanity content work. One new `blogPost` document plus edits to two existing ones, all published together in a single Sanity release so no intermediate state exists where the CO2 post links to a page that is not there yet. Three figures authored as committed SVG under `figures/dew-point-is-the-setpoint/`, rasterized to PNG, uploaded as Sanity assets. No application code changes.

**Tech Stack:** Sanity Content Lake (Portable Text, `tableBlock`, `image` blocks), Sanity MCP tools, Astro 6 static build for verification, `scripts/render-figures.sh` and `scripts/upload-image.sh`.

**Spec:** `docs/superpowers/specs/2026-08-27-dew-point-setpoint-post-design.md`

## Global Constraints

Every task's requirements implicitly include all of these.

- **Sanity workspace is `nw-local`**, not `default`. Project `nyd3p2n0`, dataset `production`.
- **No em dashes** in any visitor-facing string: body prose, table cells, table captions, figure `alt`, figure `caption`, the post `description`. Use a colon, a comma pair, parentheses, or a full stop.
- **US spelling everywhere a reader can see it**, including figure `alt` and the asset `description`. `color` not `colour`, `gray` not `grey`, `mold` not `mould`, `analyze` not `analyse`, `labeled` not `labelled`, `fiber` not `fibre`, `liter` not `litre`, `favor` not `favour`.
- **Every temperature carries both units, Fahrenheit first**: `82 to 85 °F (28 to 29 °C)`. Temperature *differences* pair too: `about 6 °F (3 °C) higher`. En dashes in numeric ranges are correct typography and are left alone. In figure `alt`, spell the units out as words, matching the existing convention in the CO2 post's `figWarmer` alt: `83 degrees Fahrenheit (28 degrees Celsius)`.
- **Ceilings round down, minimums round up.** Never round a threshold cell to nearest. See Task 3.
- **`rule.required()` is Studio-side only.** The Content Lake does not enforce it on API writes, so every document created here must carry `title`, `slug`, `description` (max 160 chars), `publishedAt`, and an `author` reference explicitly.
- **The only `author` document is `author-ben-petty`** (Ben Petty, Co-Founder). Reference it as `{"_type": "reference", "_ref": "author-ben-petty"}`.
- **Alt text is stored twice.** The rendered page uses the inline `alt` on the image object. The asset `description` is what the Studio browser and `/describe-assets` show. Seed both with the same sentence; patching only the asset is a silent no-op.
- **Astro preserves template whitespace**, unlike JSX. No task here edits `.astro` files, but if one becomes necessary, hug expression braces tightly against their tags.
- **`grep -c` against built HTML always returns 1**, because Astro minifies each page onto a single line. Use `grep -o pattern file | wc -l` to count occurrences.
- **Never start the dev server.** Verification is by `make build` against `./dist/`.

---

## File Structure

| Path | Responsibility | Tracked |
|------|----------------|---------|
| `figures/dew-point-is-the-setpoint/fig1-vpd-curves.svg` | Figure 1 source: RH against temperature at constant VPD | yes |
| `figures/dew-point-is-the-setpoint/fig2-disease-box.svg` | Figure 2 source: temp x RH plane with pathogen regions | yes |
| `figures/dew-point-is-the-setpoint/fig3-dew-point-hold.svg` | Figure 3 source: two rooms, one dew point | yes |
| `figures/dew-point-is-the-setpoint/*.png` | Render artifacts for upload | no, gitignored |
| `scratch/psychro.py` | Magnus helpers used to compute every derived cell | no, scratchpad only |
| Sanity `blogPost` (new) | The post | Content Lake |
| Sanity `blogPost` CO2 | Surgery target | Content Lake |
| Sanity `blogPost` purple | Surgery target | Content Lake |

Existing SVG figures carry a leading XML comment naming the post slug, the section, and the provenance of any reused material. Match that convention. See `figures/co2-enrichment/calcium-symptoms.svg`.

---

### Task 1: Create the draft document scaffold

Creates the document with every required field populated, and an empty body. Everything later patches into `body`.

**Files:**
- Create: Sanity `blogPost` draft
- Read: `studio/schemaTypes/blogPost.ts` for the field list

**Interfaces:**
- Produces: draft document id `drafts.dewPointIsTheSetpoint`, referenced by every later task.

- [ ] **Step 1: Confirm the author document still exists**

```bash
curl -s "https://nyd3p2n0.api.sanity.io/v2024-01-01/data/query/production?query=%2A%5B_type%3D%3D%22author%22%5D%7B_id%2Cname%7D"
```

Expected: a result array containing `{"_id": "author-ben-petty", "name": "Ben Petty"}`. If the array is empty, STOP. Do not invent a placeholder author, and do not create the post without one. A post published with no author renders no byline, emits no `<dc:creator>` in the feed, and silently falls back to the Organization in `Article.author`.

- [ ] **Step 2: Confirm the slug is free**

```bash
curl -s "https://nyd3p2n0.api.sanity.io/v2024-01-01/data/query/production?query=%2A%5Bslug.current%3D%3D%22dew-point-is-the-setpoint-vpd-by-stage%22%5D%7B_id%7D"
```

Expected: `"result": []`. A non-empty result means the slug collides and Task 1 must stop for a decision, because renaming a published slug later requires the Sanity publish to land before any `astro.config.mjs` redirect merges or both URLs break.

- [ ] **Step 3: Create the draft**

Use the Sanity MCP `create_documents` tool against workspace `nw-local` with this document. The `description` is 144 characters, inside the 160 limit enforced by the schema.

```json
{
  "_id": "drafts.dewPointIsTheSetpoint",
  "_type": "blogPost",
  "title": "Dew Point Is the Setpoint: VPD by Stage",
  "slug": { "_type": "slug", "current": "dew-point-is-the-setpoint-vpd-by-stage" },
  "description": "VPD is a number you calculate, not one you control. Setpoints by stage, the math underneath them, and why dew point is the number worth holding.",
  "publishedAt": "2026-08-27T17:00:00Z",
  "author": { "_type": "reference", "_ref": "author-ben-petty" },
  "tags": ["Cultivation", "Science", "Operations"],
  "body": []
}
```

`heroImage` is deliberately absent at this step. It is added in Task 5 alongside the figures, because it needs an uploaded asset reference.

- [ ] **Step 4: Verify the draft exists with every required field**

```bash
curl -s "https://nyd3p2n0.api.sanity.io/v2024-01-01/data/query/production?query=%2A%5B_id%3D%3D%22drafts.dewPointIsTheSetpoint%22%5D%7Btitle%2C%22slug%22%3Aslug.current%2C%22descLen%22%3Alength(description)%2C%22author%22%3Aauthor._ref%2CpublishedAt%7D" \
  -H "Authorization: Bearer $SANITY_API_TOKEN"
```

Expected: one result. `descLen` at or under 160. `author` exactly `author-ben-petty`. `slug` exactly `dew-point-is-the-setpoint-vpd-by-stage`.

Note: drafts are NOT world-readable even though the dataset is public, so this query needs the token. Published documents do not.

- [ ] **Step 5: No commit**

Nothing in this task touches the repo. Content lives in the Content Lake. The first repo commit happens in Task 5 with the figure sources.

---

### Task 2: Write Part 2, the derivation

Part 2's nine `h2` sections in full, plus Part 1's three headings as empty shells. Written before the tables, because the tables are what the argument justifies and the clone and veg rows should not set the tone.

**Files:**
- Modify: Sanity draft `drafts.dewPointIsTheSetpoint`, field `body`

**Interfaces:**
- Consumes: `drafts.dewPointIsTheSetpoint` from Task 1.
- Produces: all twelve `h2` blocks, in document order. Part 1: `h2Setpoints`, `h2Enriched`, `h2MeasureWhere`. Part 2: `h2Derived`, `h2LeafTemp`, `h2Disease`, `h2DewPoint`, `h2DarkPeriod`, `h2Airflow`, `h2Substrate`, `h2NotCovered`, `h2References`.

This task writes Part 2's prose in full and creates Part 1's three headings as empty sections. Tasks 3 and 4 insert tables under headings that already exist, so no later task has to get heading placement right a second time. Task 5 inserts figures the same way.

- [ ] **Step 1: Pull the source blocks from both existing posts**

```bash
curl -s "https://nyd3p2n0.api.sanity.io/v2024-01-01/data/query/production?query=%2A%5Bslug.current%3D%3D%22co2-enrichment-in-commercial-cannabis%22%5D%5B0%5D%7Bbody%7D" > /tmp/co2.json
curl -s "https://nyd3p2n0.api.sanity.io/v2024-01-01/data/query/production?query=%2A%5Bslug.current%3D%3D%22why-cannabis-turns-purple%22%5D%5B0%5D%7Bbody%7D" > /tmp/purple.json
```

- [ ] **Step 2: Print the outline so block indices are unambiguous**

```bash
python3 - <<'PY'
import json
for name in ("co2", "purple"):
    print(f"=== {name} ===")
    for index, block in enumerate(json.load(open(f"/tmp/{name}.json"))["result"]["body"]):
        kind = block.get("_type")
        if kind == "block":
            style = block.get("style", "normal")
            text = "".join(child.get("text", "") for child in block.get("children", []))
            print(f"{index:3} [{style:6}] {text[:95]}")
        else:
            print(f"{index:3} <<{kind}>> {str(block.get('caption') or block.get('alt'))[:70]}")
PY
```

Source blocks to draw from, per the spec:

| New section | Source |
|-------------|--------|
| VPD is a derived number | CO2 blocks 35 to 45 |
| Leaf temperature is not room temperature | CO2 block 33 |
| Disease sets the ceiling, not yield | CO2 blocks 46 to 55, purple blocks 23 to 24 |
| Why dew point is the setpoint you hold | CO2 blocks 75 to 81 |
| The dark period sets your equipment | purple blocks 25 to 26 |
| Airflow, and why 0.3 to 0.5 m/s | purple block 32 |
| Substrate temperature | purple block 33 |

- [ ] **Step 3: Rewrite rather than transplant**

These blocks were written to sit inside an argument about a gas, or an argument about color. Sentences that open with "The temperature change works in your favor here" or "A cool finish pulls the opposite direction" carry a context that no longer exists. Rewrite each into the new post's frame. Do not paste.

The section ordering is an argument, not a list, and must be preserved: the math, then why the math is approximate, then the constraint the math must respect, then the number that respects it, then what that costs, then the two things setpoints do not capture.

`Why dew point is the setpoint you hold` is the payload, because the title promises it. It sits ahead of the airflow and substrate sections, not buried after them.

- [ ] **Step 4: Patch the body**

Use the Sanity MCP `patch_documents` tool, setting `body` to the array of blocks. Block `_key` values must be the stable names listed under **Interfaces** above, because later tasks locate insertion points by key.

Formula blocks are normal blocks whose text uses the `code` decorator, matching CO2 blocks 38 and 40:

```
SVP = 0.61094 × exp(17.625 × T / (T + 243.04))
RH = 1 - (VPD / SVP)
```

`T is in °C` is the one legitimate single-unit temperature in this post. `scripts/check-content-style.py` allowlists that exact phrasing. Do not write it any other way.

- [ ] **Step 5: Verify block count and heading keys**

```bash
curl -s -H "Authorization: Bearer $SANITY_API_TOKEN" \
  "https://nyd3p2n0.api.sanity.io/v2024-01-01/data/query/production?query=%2A%5B_id%3D%3D%22drafts.dewPointIsTheSetpoint%22%5D%5B0%5D%7B%22keys%22%3Abody%5Bstyle%3D%3D%22h2%22%5D._key%7D"
```

Expected: exactly the twelve keys from **Interfaces**, in document order, with the three Part 1 keys first.

- [ ] **Step 6: Check for em dashes in the draft body**

```bash
python3 - <<'PY'
import json, subprocess, urllib.parse, os
query = '*[_id=="drafts.dewPointIsTheSetpoint"][0]{body}'
url = ("https://nyd3p2n0.api.sanity.io/v2024-01-01/data/query/production?query="
       + urllib.parse.quote(query))
raw = subprocess.run(
    ["curl", "-s", "-H", f"Authorization: Bearer {os.environ['SANITY_API_TOKEN']}", url],
    capture_output=True, text=True).stdout
body = json.loads(raw)["result"]["body"]
found = []
for block in body:
    for child in block.get("children", []):
        if "—" in child.get("text", ""):
            found.append(child["text"][:80])
    for field in ("alt", "caption"):
        if "—" in str(block.get(field, "")):
            found.append(f"{field}: {block[field][:80]}")
print(f"em dashes found: {len(found)}")
for item in found:
    print("  ", item)
PY
```

Expected: `em dashes found: 0`.

This walks image `alt` and `caption` alongside `children`, because Portable Text image blocks store those fields as siblings of `children`, not inside it. A span-only walk reads as exhaustive and silently misses every figure caption.

- [ ] **Step 7: No commit**

Content only.

---

### Task 3: Recompute the carried-forward threshold tables

CO2 block 77 shipped five of ten cells above the threshold its own caption promised. It is being carried into this post, so it gets recomputed rather than moved. Same for block 44 and block 51.

**Files:**
- Create: `scratch/psychro.py` (scratchpad, not committed)
- Create: `scratch/check_rounding.py` (scratchpad, not committed)
- Modify: Sanity draft `body`

**Interfaces:**
- Consumes: heading keys from Task 2.
- Produces: `tableBlock` blocks keyed `tblRhByVpd` (under `h2Derived`), `tblVpdBand` and `tblPathogens` (under `h2Disease`), `tblDewCeiling` (under `h2DewPoint`), `tblMeasureWhere` (under `h2MeasureWhere`).

`tblMeasureWhere` carries no computed cells, so it is a straight rewrite of CO2 block 80 rather than a recompute. It is built here with the other tables so all five land in one patch.

- [ ] **Step 1: Write the Magnus helpers**

Save as `scratch/psychro.py`. These are verified working, not illustrative.

```python
"""Magnus-equation helpers. Ceilings round DOWN, minimums round UP."""
import math


def f_to_c(fahrenheit):
    return (fahrenheit - 32.0) * 5.0 / 9.0


def c_to_f(celsius):
    return celsius * 9.0 / 5.0 + 32.0


def svp_kpa(temp_c):
    """Saturation vapor pressure, Magnus equation. temp_c in Celsius."""
    return 0.61094 * math.exp(17.625 * temp_c / (temp_c + 243.04))


def rh_from_vpd(temp_c, vpd_kpa):
    return 1.0 - vpd_kpa / svp_kpa(temp_c)


def vpd_from_rh(temp_c, rh):
    return svp_kpa(temp_c) * (1.0 - rh)


def dew_point_c(temp_c, rh):
    gamma = math.log(rh) + 17.625 * temp_c / (243.04 + temp_c)
    return 243.04 * gamma / (17.625 - gamma)


def rh_at_dew_point(dew_f, room_f):
    """RH that a given dew point produces in a room at room_f."""
    return svp_kpa(f_to_c(dew_f)) / svp_kpa(f_to_c(room_f))


def floor_to(value, step=1.0):
    """Ceiling cell: never publish a number above the true value."""
    return math.floor(value / step) * step


def ceil_to(value, step=1.0):
    """Minimum cell: never publish a number below the true value."""
    return math.ceil(value / step) * step
```

- [ ] **Step 2: Write the failing check that reproduces the shipped bug**

Save as `scratch/check_rounding.py`.

```python
"""Reproduce the PR #73 rounding bug and show the fix."""
from psychro import f_to_c, dew_point_c, c_to_f, rh_at_dew_point, floor_to

THRESHOLD = 0.70
NIGHTS = (62, 66, 70, 74, 78)

print("Dew point ceiling that holds RH under 70 percent")
print(f"{'Night F':>8} {'true Td':>8} {'nearest':>8} {'RH@near':>9} "
      f"{'floor':>6} {'RH@floor':>9} {'verdict':>10}")
for night_f in NIGHTS:
    td_true = c_to_f(dew_point_c(f_to_c(night_f), THRESHOLD))
    nearest = round(td_true)
    floored = int(floor_to(td_true))
    rh_near = rh_at_dew_point(nearest, night_f) * 100
    rh_floor = rh_at_dew_point(floored, night_f) * 100
    verdict = "OVER" if rh_near > THRESHOLD * 100 else "ok"
    print(f"{night_f:8} {td_true:8.2f} {nearest:8} {rh_near:8.2f}% "
          f"{floored:6} {rh_floor:8.2f}% {verdict:>10}")
```

- [ ] **Step 3: Run it and confirm the bug reproduces**

Run: `cd scratch && python3 check_rounding.py`

Expected output, exactly:

```
Dew point ceiling that holds RH under 70 percent
 Night F  true Td  nearest   RH@near  floor  RH@floor    verdict
      62    52.11       52    69.73%     52    69.73%         ok
      66    55.94       56    70.16%     55    67.66%       OVER
      70    59.77       60    70.58%     59    68.11%       OVER
      74    63.60       64    71.00%     63    68.55%       OVER
      78    67.42       67    68.98%     67    68.98%         ok
```

The 74 °F (23 °C) row reading exactly `71.00%` under round-to-nearest is the figure recorded in CLAUDE.md for the shipped bug. If it does not appear, the helpers are wrong. Stop and fix them before computing any published cell.

- [ ] **Step 4: Compute every threshold cell with floor rounding**

Every cell in `tblDewCeiling` and every RH ceiling in `tblVpdBand` uses `floor_to`. Any cell that is a stated minimum rather than a ceiling uses `ceil_to`. Print each cell alongside the value it implies and assert the implied value sits on the correct side of the caption's threshold.

- [ ] **Step 5: Verify no published cell breaches its caption**

Extend `check_rounding.py` to loop over the actual cells being published and assert. Expected: `0 breaches` across all threshold tables.

A caption that names a threshold makes rounding directional. `check-content-style.py` asserts that a temperature carries both units, not that it is correct, so a wrong figure passes every automated check this repo has. This assertion is the only thing standing between a wrong number and publication.

- [ ] **Step 6: Patch all five tables into the body**

`tblRhByVpd`, `tblVpdBand`, `tblPathogens` and `tblDewCeiling` use the cells computed in Steps 4 and 5. `tblMeasureWhere` is a rewrite of CO2 block 80 with no computed cells. All five land in one patch, each inserted under the heading named in **Interfaces**.

`tableBlock` shape, from `studio/schemaTypes/tableBlock.ts`. Cells are plain strings, not nested Portable Text. Every row must have exactly as many cells as there are headers, which the schema validates.

```json
{
  "_key": "tblDewCeiling",
  "_type": "tableBlock",
  "caption": "Highest dew point that still holds humidity under the threshold",
  "headers": ["Night temperature", "Ceiling at 65 percent", "Ceiling at 70 percent"],
  "rows": [
    { "_key": "row62", "_type": "tableRow", "cells": ["62 °F (17 °C)", "…", "52 °F (11 °C)"] }
  ]
}
```

- [ ] **Step 7: Verify every table is within the 5-column ceiling**

```bash
python3 - <<'PY'
import json, subprocess, urllib.parse, os
query = '*[_id=="drafts.dewPointIsTheSetpoint"][0]{body}'
url = ("https://nyd3p2n0.api.sanity.io/v2024-01-01/data/query/production?query="
       + urllib.parse.quote(query))
raw = subprocess.run(
    ["curl", "-s", "-H", f"Authorization: Bearer {os.environ['SANITY_API_TOKEN']}", url],
    capture_output=True, text=True).stdout
for block in json.loads(raw)["result"]["body"]:
    if block.get("_type") != "tableBlock":
        continue
    headers = block.get("headers", [])
    ragged = [r for r in block.get("rows", []) if len(r.get("cells", [])) != len(headers)]
    flag = "TOO WIDE" if len(headers) > 5 else "ok"
    print(f"{block['_key']:18} cols={len(headers)} ragged={len(ragged)} {flag}")
PY
```

Expected: every row `cols=5` or fewer, `ragged=0`.

The widest table published on this site is 5 columns, verified across all 30 documents with a body. `.pt-table-scroll` is `overflow-x: auto` so a wider table would not break, but it would scroll, and a scrolling stage table destroys the row-to-row comparison that is the only reason the table exists.

- [ ] **Step 8: No commit**

Scratchpad files are not tracked.

---

### Task 4: Build the stage tables

The reason the article exists. Neither existing post has a clone-through-finish reference.

**Files:**
- Modify: Sanity draft `body`

**Interfaces:**
- Consumes: `scratch/psychro.py` from Task 3, heading keys from Task 2.
- Produces: `tableBlock` blocks keyed `tblClimateByStage`, `tblLightAirByStage`, `tblEnrichedDelta`, and `h2` blocks `h2Setpoints`, `h2Enriched`.

- [ ] **Step 1: Collect the house setpoints from the user**

STOP and ask. These are house practice, not literature, and cannot be derived, looked up, or inferred. Ask for day and night temperature, target RH, and PPFD or DLI for each of: clone and propagation, vegetative, transition and stretch, early flower, late flower, finish.

Do not proceed on assumed values. The article's entire credibility rests on these being the numbers actually run.

- [ ] **Step 2: Compute the derived columns**

VPD and dew point are derived, never asked for. Given the user's temperature and RH:

```python
from psychro import f_to_c, vpd_from_rh, dew_point_c, c_to_f, floor_to

def derive(day_f, night_f, rh):
    vpd = vpd_from_rh(f_to_c(day_f), rh)
    dew_ceiling_f = floor_to(c_to_f(dew_point_c(f_to_c(night_f), rh)))
    return round(vpd, 2), int(dew_ceiling_f)
```

The dew point ceiling is computed at the NIGHT temperature, not the day temperature. Every dark-period number in this post is a dark-period number; daytime readings say almost nothing about the risk window.

- [ ] **Step 3: Split into two tables**

```
tblClimateByStage    Stage | Temp (day/night) | RH | VPD | Dew point ceiling   -> 5 cols
tblLightAirByStage   Stage | PPFD | DLI | Canopy airflow                        -> 4 cols
```

Do not build one 8-column table. See Task 3 Step 7 for why.

- [ ] **Step 4: Build the enriched delta table**

Deltas stated as deltas, not as two absolute columns:

```json
{
  "_key": "tblEnrichedDelta",
  "_type": "tableBlock",
  "caption": "What changes when the gas goes on",
  "headers": ["Setpoint", "Change", "Why"],
  "rows": [
    { "_key": "rowTemp", "_type": "tableRow",
      "cells": ["Canopy temperature", "+6 °F (3 °C)", "Photorespiration falls as carbon rises, moving the optimum up"] }
  ]
}
```

The CO2 post keeps its own absolutes table. These are deliberately two different tables so they cannot drift apart. Do not copy one into the other.

- [ ] **Step 5: Write the clone and veg rows last, with real reasoning underneath**

These are the thinnest rows and the ones a cheat-sheet reader trusts most uncritically. Most stage-by-stage VPD guidance in circulation traces to greenhouse convention and vendor blog posts rather than cannabis trials. Under house-practice framing that is fine, but the prose beneath the table must give an actual reason for each number, not restate it in words.

- [ ] **Step 6: Verify column counts and rounding**

Re-run the verification from Task 3 Step 7. Expected: `cols=5` or fewer, `ragged=0` for every table including the two new ones.

Re-run the threshold assertion from Task 3 Step 5 over the stage tables' dew point column. Expected: `0 breaches`.

- [ ] **Step 7: No commit**

---

### Task 5: Author, render, upload and wire the three figures

**Files:**
- Create: `figures/dew-point-is-the-setpoint/fig1-vpd-curves.svg`
- Create: `figures/dew-point-is-the-setpoint/fig2-disease-box.svg`
- Create: `figures/dew-point-is-the-setpoint/fig3-dew-point-hold.svg`
- Modify: Sanity draft `body`
- Read: `figures/co2-enrichment/calcium-symptoms.svg` for conventions

**Interfaces:**
- Consumes: heading keys from Task 2.
- Produces: `image` blocks keyed `figVpdCurves`, `figDiseaseBox`, `figDewPointHold`, plus `heroImage` on the draft.

- [ ] **Step 1: Read the existing figure for conventions**

```bash
head -30 figures/co2-enrichment/calcium-symptoms.svg
```

Note the leading XML comment naming the post slug, the section, the block range, and the provenance of any reused material. Match it. Note also that figures render on a light plate (`background: #f8f6f9` on `.portable-text figure img` in `global.css`), so figure interiors are light, not dark like the site.

- [ ] **Step 2: Author the three SVGs**

| File | Content | Section |
|------|---------|---------|
| `fig1-vpd-curves.svg` | RH against temperature, one curve per VPD target. Shows the exponential curvature that the table's five points cannot. | VPD is a derived number |
| `fig2-disease-box.svg` | Temp x RH plane, Botrytis region, powdery mildew region, and the operating box that clears both. | Disease sets the ceiling |
| `fig3-dew-point-hold.svg` | Two rooms at different temperature and RH holding one dew point, with the condensation line marked. | Why dew point is the setpoint |

Compute every plotted value with `scratch/psychro.py`. Do not eyeball a curve.

- [ ] **Step 3: Verify figure 2's boundaries are supported**

STOP if they are not. Under house-practice framing this chart is the strongest claim in the article, and a drawn "safe box" asserts more than a table of numbers does. Its edges must come from Mahmoud et al. (2023) and Buirs et al. (2025), which are already cited in both existing posts. Read them, do not recall them.

If a boundary is not cleanly supported, give the box a soft edge or drop the figure. A figure that overstates is worse than no figure.

- [ ] **Step 4: Render to PNG**

```bash
make render-figures FIGURE=fig1-vpd-curves
make render-figures FIGURE=fig2-disease-box
make render-figures FIGURE=fig3-dew-point-hold
```

This shells out to headless Chrome. If it errors with `Chrome not found`, set `CHROME=/path/to/chrome`. The PNGs are build artifacts and are not tracked; the SVG sources are, so the figure stays regenerable when a number in it changes.

- [ ] **Step 5: Upload each PNG as a Sanity asset**

```bash
make upload-image FILE=figures/dew-point-is-the-setpoint/fig1-vpd-curves.png \
  LABEL="Fig. 1: RH against temperature at constant VPD" \
  DESCRIPTION="<the same sentence that will become the inline alt>"
```

This needs `SANITY_WRITE_TOKEN` in `.env`, which is a different variable from the read-only `SANITY_API_TOKEN` the build uses. If it is missing, stop and ask rather than working around it.

Record each returned asset `_id`. Task 5 Step 6 needs them.

- [ ] **Step 6: Wire the figures into the body with alt set in both places**

```json
{
  "_key": "figVpdCurves",
  "_type": "image",
  "alt": "Relative humidity plotted against canopy temperature, one curve for each VPD target. Every curve falls as temperature rises, and the spacing between them widens, because saturation vapor pressure grows exponentially with temperature.",
  "caption": "Fig. 1: The same VPD target means a very different relative humidity at 68 degrees Fahrenheit (20 degrees Celsius) than at 85 degrees Fahrenheit (29 degrees Celsius).",
  "asset": { "_type": "reference", "_ref": "<asset id from Step 5>" }
}
```

The `DESCRIPTION` passed in Step 5 sets the asset `description`. This `alt` sets the inline copy. **The page renders the inline one.** Setting only the asset is a silent no-op with a convincing confirmation message. Seed both.

In `alt` and `caption`, spell temperature units out as words, matching the CO2 post's `figWarmer`.

- [ ] **Step 7: Set the hero image**

Patch `heroImage` on the draft as an image object with `alt`, using whichever uploaded asset works as a lead. `heroImage` declares `options: { hotspot: true }`, and every `heroImage` projection in `src/lib/sanity.ts` already selects `crop, hotspot`, so an editor-set crop will be honored on this document type.

- [ ] **Step 8: Verify the figures resolve and carry alt**

```bash
curl -s -H "Authorization: Bearer $SANITY_API_TOKEN" \
  "https://nyd3p2n0.api.sanity.io/v2024-01-01/data/query/production?query=%2A%5B_id%3D%3D%22drafts.dewPointIsTheSetpoint%22%5D%5B0%5D%7B%22figs%22%3Abody%5B_type%3D%3D%22image%22%5D%7B_key%2Calt%2Ccaption%2C%22asset%22%3Aasset._ref%7D%7D"
```

Expected: three entries, each with a non-null `alt`, `caption`, and `asset`.

- [ ] **Step 9: Commit the SVG sources**

```bash
git add figures/dew-point-is-the-setpoint/
git commit -m "feat: add the three figures for the dew point post"
```

Only the `.svg` files should be staged. If a `.png` appears in `git status`, it is not gitignored and that needs fixing before committing.

---

### Task 6: CO2 post surgery

107 blocks down to roughly 78. Five of eleven tables leave.

**Files:**
- Modify: Sanity `blogPost` with slug `co2-enrichment-in-commercial-cannabis`, as a draft version

**Interfaces:**
- Consumes: the new post's heading keys from Task 2, for deep links.

- [ ] **Step 1: Create a draft version of the published CO2 post**

Use the Sanity MCP `create_version` tool. Do not patch the published document directly; the surgery must land in the same release as everything else.

- [ ] **Step 2: Apply the removals**

| Blocks | Section | Action |
|--------|---------|--------|
| 5 to 8 | Climate that goes with those setpoints | Keep table 6, it is the post's own thesis as absolutes. Block 8's note becomes a link. |
| 29 to 34 | Relative humidity: disease sets the ceiling | Mostly keep. Blocks 31, 32, 34 are CO2-specific. Only block 33 moves out. |
| 35 to 45 | Running the humidity numbers yourself | Remove entirely. Two sentences and a link replace 11 blocks. |
| 46 to 55 | Powdery mildew and bud rot | Condense hard. Keep 47 and 50. Retitle to `What the warmer room does to disease risk`. |
| 75 to 81 | Setting the dew point target | Remove. |

Blocks 73 and 74 STAY. That table is taper-specific even though it is the clearest purple crossover in either article.

- [ ] **Step 3: Put a pointer at every removal site**

Three wounds, three pointers. Each links into a specific section of the new post, not just to the post.

The heading `Running the humidity numbers yourself` currently has an anchor id that a reader may have deep-linked. Deleting the section kills that target. A pointer sitting where the section was degrades an existing deep link to "landed on the post, section moved" instead of "section gone."

- [ ] **Step 4: Verify the six surviving tables are the right six**

The draft id is resolved by query rather than hardcoded, because `create_version` assigns it.

```bash
python3 - <<'PY'
import json, subprocess, urllib.parse, os

token = os.environ["SANITY_API_TOKEN"]

def query(groq):
    url = ("https://nyd3p2n0.api.sanity.io/v2024-01-01/data/query/production?query="
           + urllib.parse.quote(groq))
    raw = subprocess.run(
        ["curl", "-s", "-H", f"Authorization: Bearer {token}", url],
        capture_output=True, text=True).stdout
    return json.loads(raw)["result"]

draft = query('*[_type=="blogPost" && slug.current=="co2-enrichment-in-commercial-cannabis"'
              ' && _id in path("drafts.**")][0]{_id, body}')
if not draft:
    raise SystemExit("No draft version of the CO2 post. Run Step 1 first.")

print("draft id:", draft["_id"])
tables = [b["caption"] for b in draft["body"] if b.get("_type") == "tableBlock"]
print(f"{len(tables)} tables remain:")
for caption in tables:
    print("  ", caption)
PY
```

Expected: exactly 6. Setpoints by stage, Ambient room against enriched room, Injection through the photoperiod, Tapering injection out, Cool finish night setpoints, Chandra et al. 2008.

If `Relative humidity implied by...`, `Humidity that holds the dry end...`, `The two pathogens...`, `Highest dew point...`, or `What to measure, and where` still appear, the removal is incomplete.

- [ ] **Step 5: No commit**

---

### Task 7: Purple post surgery

Barely surgery. Roughly 250 words out, two links in.

**Files:**
- Modify: Sanity `blogPost` with slug `why-cannabis-turns-purple`, as a draft version

- [ ] **Step 1: Create a draft version**

Sanity MCP `create_version`, same as Task 6.

- [ ] **Step 2: Condense two blocks, keep the rest**

Keep blocks 22, 23, 25. The 8 to 12 hour leaf wetness window and the cold-night dehumidification load are the cost of the color, which is this post's honest core and must not be outsourced to the new one.

Condense blocks 24 and 26 into pointers.

- [ ] **Step 3: Add links to two protocol steps**

Keep all four protocol steps at 30 to 33. Add a link on the dehumidify step and on the airflow step.

- [ ] **Step 4: Verify all three tables survive**

The purple post's three tables are all argumentative, not referential, and none of them move. Expected: 3 tables remain.

- [ ] **Step 5: No commit**

---

### Task 8: Verify rendering before publishing

`src/lib/sanity.ts` sets no `perspective`, so the client fetches published documents only and drafts do not render. This task makes the temporary change explicit and reverts it.

**Files:**
- Modify then revert: `src/lib/sanity.ts`

- [ ] **Step 1: Capture a baseline page count**

```bash
make build 2>&1 | tail -20
```

Record the page count. Do NOT use `git stash` to capture a before/after baseline: worktrees share one stash stack with the main checkout, so a concurrent session can pop between your two halves. Copy the artifact instead if you need it: `cp -R dist /tmp/before-dewpoint`.

- [ ] **Step 2: Point the client at drafts, temporarily**

Add `perspective: "drafts"` to the client config in `src/lib/sanity.ts`. This is a throwaway edit reverted in Step 6.

- [ ] **Step 3: Build and confirm the page count rose by exactly one**

```bash
make build 2>&1 | tail -20
```

Expected: baseline + 1. A count that did not move means the draft is not being picked up. A count that moved by more than one means something else changed.

- [ ] **Step 4: Run every content check against the built output**

```bash
make check-content-style
make check-anchors
make check-analytics
```

Expected: all pass. `check-content-style` blocks the deploy, so a failure here is a failure that would silently keep published content off the site.

- [ ] **Step 5: Count em dashes as occurrences, not lines**

```bash
for page in dist/blog/dew-point-is-the-setpoint-vpd-by-stage/index.html \
            dist/blog/co2-enrichment-in-commercial-cannabis/index.html \
            dist/blog/why-cannabis-turns-purple/index.html; do
  echo "$page: $(grep -o '—' "$page" | wc -l)"
done
```

Expected: `0` for all three. `grep -c` would return `1` regardless, because Astro minifies each page onto a single line.

- [ ] **Step 6: Verify alt text reached the rendered attribute**

```bash
grep -o 'alt="[^"]*"' dist/blog/dew-point-is-the-setpoint-vpd-by-stage/index.html | head -10
```

Expected: the three figure alt sentences appear. The rendered page uses the inline `alt`, so this is the check that distinguishes a real fix from an asset-only patch.

- [ ] **Step 7: Check the printed output by hand**

Open the built page and print to PDF. Expected: the post title appears, the tables are legible, and no section is missing.

Nothing in the build, `astro check`, lint, the link checker, or Lighthouse executes a `@media print` rule. A page that prints as a blank sheet is byte-identical on screen. This post is the most printable page on the site, so this check matters here more than anywhere else. The verification recipe is in `docs/testing.md`.

- [ ] **Step 8: Revert the perspective change**

```bash
git checkout src/lib/sanity.ts
git status --porcelain
```

Expected: `src/lib/sanity.ts` no longer listed. Shipping `perspective: "drafts"` would publish unpublished content to the live site.

- [ ] **Step 9: Commit nothing**

The only repo change in this task is reverted. If `git status` is not clean apart from Task 5's figures, stop and investigate.

---

### Task 9: Publish as one release and verify live

**Files:**
- Modify: three Sanity documents, published together

- [ ] **Step 1: Create the release**

Sanity MCP `create_release`. Add all three document versions: the new post, the CO2 draft version, the purple draft version.

Order matters in one direction only. If the CO2 edits land before the new post exists, that post has five holes and three links to a 404. The reverse is harmless. A release removes the question by making it atomic.

- [ ] **Step 2: Confirm the release holds exactly three documents**

Sanity MCP `list_releases`. Expected: three. Two is a missing surgery; four means something unrelated got swept in.

- [ ] **Step 3: Publish**

Sanity MCP publish on the release. This fires the webhook to the `deploy.yml` `workflow_dispatch` endpoint and triggers one rebuild, roughly 1 to 2 minutes.

- [ ] **Step 4: Watch the deploy**

```bash
gh run list --workflow=deploy.yml --limit 3
```

Wait for completion. A failure in the `check-content-style` step means published content is live in Sanity but absent from the site.

- [ ] **Step 5: Verify the live pages**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://nw-local.com/blog/dew-point-is-the-setpoint-vpd-by-stage/
curl -s https://nw-local.com/blog/co2-enrichment-in-commercial-cannabis/ | grep -o 'dew-point-is-the-setpoint[^"]*' | sort -u
curl -s https://nw-local.com/blog/why-cannabis-turns-purple/ | grep -o 'dew-point-is-the-setpoint[^"]*' | sort -u
```

Expected: `200` for the new page. Three distinct deep links from the CO2 post, two from the purple post, every one of them resolving.

- [ ] **Step 6: Verify the feed**

```bash
curl -s https://nw-local.com/rss.xml | grep -A3 "Dew Point Is the Setpoint"
```

Expected: the post appears with a `<dc:creator>` naming Ben Petty. A missing creator means the author reference did not survive, which is exactly the failure `rule.required()` does not catch on API writes.

- [ ] **Step 7: Verify analytics still fire on the new page**

Load the page in a real browser and watch for a request to `google-analytics.com/g/collect`. The markup looking correct proves nothing here: the only symptom of a broken snippet is the absence of that request.

- [ ] **Step 8: Final repo state**

```bash
git status --porcelain
git log --oneline -3
```

Expected: clean tree, one commit from Task 5 adding the figure sources.

---

## Deferred, decide before starting

**Promote the rounding checker to a tracked script.** `scratch/check_rounding.py` catches the PR #73 class of bug. That bug has now bitten twice: once when it shipped, and once more here where the table is being carried into a second post. The project rule is to capture a cross-cutting lesson at the second occurrence, which this is.

Promoting it would mean `scripts/check-threshold-tables.py` plus a job in `audit.yml`, and it would be a code change that the approved spec does not cover. It is deliberately NOT a task above rather than silently added. Raise it before Task 3 and get a decision.

If it is promoted, note that a check living only in `audit.yml` covers pull requests and the nightly cron, and covers no content path at all. Publishing a document fires a webhook straight at `deploy.yml`, so a content-validating check has to be duplicated as a blocking step there, the way `check-content-style.py` already is.

**The drying, curing and finishing post.** The new post's out-of-scope line promises it. Not in this plan.
