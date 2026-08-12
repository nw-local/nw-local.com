# Glossary Terms Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 17 glossary terms surfaced by the "Why Cannabis Turns Purple" article, rewrite 4 existing definitions that only parse if you have read that article, and annotate the post so every new term links from its first occurrence.

**Architecture:** Pure Sanity content change, executed through the Sanity MCP tools. No repo code changes. `/glossary`, `/glossary/[slug]` and `GlossaryTerm.astro` are already driven by `getGlossaryTerms()` and the existing `glossaryRef` annotation, so new documents appear on the site with no build-time work beyond a rebuild. Terms are created and published **before** the post is patched, because an unresolved `glossaryRef` throws at build time by design.

**Tech Stack:** Sanity CMS (project `nyd3p2n0`, dataset `production`, workspace `nw-local`), Sanity MCP tools, Astro 6 static build.

## Global Constraints

- **Definitions must stand alone.** A definition explains the term as it exists in the world. It may state a general fact about the term. It may not reference the argument, conclusions or framing of the article that prompted it.
- **No em dashes in `shortDefinition`.** It is published copy. Use commas, periods or parentheses. No constructed aphorisms, no restating the same fact twice.
- **`shortDefinition` is capped at 200 characters** by `rule.required().max(200)` in `studio/schemaTypes/glossaryTerm.ts`. Sanity rejects the write if exceeded.
- **Sanity resource for every MCP call:** `{"projectId": "nyd3p2n0", "dataset": "production"}`.
- **New documents use explicit readable `_id`s** of the form `glossary-<slug>`. The original 8 terms carry generated UUIDs; this batch deviates deliberately so that Task 3's `markDefs` can be written with literal IDs instead of values discovered at runtime. No dots in the IDs, since Sanity reserves the `drafts.` prefix.
- **Terms are published before the post is patched.** Reversing this order breaks the build.

---

### Task 1: Create and publish the 17 glossary terms

**Files:** None. Sanity documents only.

**Interfaces:**
- Produces: 17 published `glossaryTerm` documents with `_id`s `glossary-dif`, `glossary-cola`, `glossary-ec`, `glossary-lockout`, `glossary-phenohunting`, `glossary-coco-coir`, `glossary-drain-to-waste`, `glossary-cannabinoid`, `glossary-flavonoid`, `glossary-inflorescence`, `glossary-vacuole`, `glossary-genotype`, `glossary-transpiration`, `glossary-relative-humidity`, `glossary-powdery-mildew`, `glossary-guttation`, `glossary-translocation`. Task 3 references these `_id`s directly.

- [ ] **Step 1: Confirm the starting state is 8 terms**

Call `mcp__Sanity__query_documents`:

```groq
count(*[_type == "glossaryTerm"])
```

Expected: `8`. If it is not 8, stop and report — someone has changed the glossary since this plan was written.

- [ ] **Step 2: Create the 17 documents**

Call `mcp__Sanity__create_documents` with these 17 documents. Every one is `_type: "glossaryTerm"` with a `slug` of `{"_type": "slug", "current": "<slug>"}`.

Note that `glossary-ec` has a hand-set slug of `ec`, which deliberately does not match its term. `options: { source: 'term' }` on the schema is a Studio-side prefill only, so a written-in value is preserved.

| `_id` | `term` | `slug.current` | `shortDefinition` |
|---|---|---|---|
| `glossary-dif` | DIF | `dif` | Day temperature minus night temperature. A large positive DIF promotes stem elongation and a small or negative one suppresses it, making it a lever for plant height and finish. |
| `glossary-cola` | Cola | `cola` | A cluster of cannabis flowers packed along a stem. The largest sits at the top of the plant, with smaller ones on lateral branches. Airflow inside a cola is close to zero. |
| `glossary-ec` | Electrical conductivity (EC) | `ec` | A measure of dissolved salts in nutrient solution, used as the working proxy for feed strength. Runoff EC tells you what the root zone is actually holding. |
| `glossary-lockout` | Lockout | `lockout` | When nutrients are present but chemically unavailable to the plant, usually from off-target pH or salt buildup. The plant shows a deficiency you cannot feed away. |
| `glossary-phenohunting` | Phenohunting | `phenohunting` | Growing out a seed population and selecting the individual plants worth keeping. It is how a breeder finds the one phenotype that becomes a named cultivar. |
| `glossary-coco-coir` | Coco coir | `coco-coir` | A coconut-husk growing substrate. It holds little nutrient charge of its own, so it is fed every irrigation and reacts fast to changes in temperature or EC. |
| `glossary-drain-to-waste` | Drain-to-waste | `drain-to-waste` | An irrigation strategy where runoff is discarded rather than recirculated. Runoff readings become the main window into what the root zone is doing. |
| `glossary-cannabinoid` | Cannabinoid | `cannabinoid` | The class of compounds including THC, CBD and CBG, produced in the glandular trichomes of cannabis flower and responsible for its psychoactive and medicinal effects. |
| `glossary-flavonoid` | Flavonoid | `flavonoid` | A large class of plant compounds covering pigments, UV protectants and antioxidants, found throughout the plant kingdom. Anthocyanins are one flavonoid subclass. |
| `glossary-inflorescence` | Inflorescence | `inflorescence` | The botanical term for a flower cluster, what the trade calls a bud. Research reports cannabis yield as inflorescence dry weight. |
| `glossary-vacuole` | Vacuole | `vacuole` | The large fluid-filled compartment inside a plant cell, used for storage and to maintain turgor pressure. Water-soluble pigments such as anthocyanins are held here. |
| `glossary-genotype` | Genotype | `genotype` | The genetic makeup an organism carries, as distinct from the phenotype (the observable traits that result from a genotype interacting with its environment). |
| `glossary-transpiration` | Transpiration | `transpiration` | Water moving up through the plant and evaporating out through the stomata. It drives nutrient uptake, and carries calcium, which moves almost entirely by that flow. |
| `glossary-relative-humidity` | Relative humidity | `relative-humidity` | The share of moisture air is holding against the most it could hold at that temperature. Because it moves with temperature, cooling air raises RH with no water added. |
| `glossary-powdery-mildew` | Powdery mildew | `powdery-mildew` | A fungal disease that coats leaf and stem surfaces in white powdery growth. Unlike most fungal pathogens it needs no free water to infect, only high humidity. |
| `glossary-guttation` | Guttation | `guttation` | Droplets a plant pushes out at its leaf margins when root pressure keeps working but transpiration has stalled. Free water sitting on tissue is an infection route. |
| `glossary-translocation` | Translocation | `translocation` | The movement of sugars and nutrients through a plant's phloem, from where they are made or stored to where they are needed. |

- [ ] **Step 3: Publish all 17**

Call `mcp__Sanity__publish_documents` with the 17 `_id`s listed in the Interfaces block above.

- [ ] **Step 4: Verify count, slugs and copy rules**

Call `mcp__Sanity__query_documents` with `perspective: "published"`:

```groq
{
  "total": count(*[_type == "glossaryTerm"]),
  "overLength": *[_type == "glossaryTerm" && length(shortDefinition) > 200].term,
  "emDashes": *[_type == "glossaryTerm" && count(string::split(shortDefinition, "—")) > 1].term,
  "missingSlug": *[_type == "glossaryTerm" && !defined(slug.current)].term,
  "ecSlug": *[_id == "glossary-ec"][0].slug.current
}
```

Expected exactly:
- `total`: `25`
- `overLength`: `[]`
- `emDashes`: `["Chlorophyll"]`
- `missingSlug`: `[]`
- `ecSlug`: `"ec"`

**Do not use `shortDefinition match "*—*"` for this check.** GROQ's `match` is a full-text operator: it tokenizes both operands and discards punctuation, so the pattern collapses to a wildcard and returns every document. Verified against this dataset on 2026-08-12 — it returned all 25. Use the `string::split` form above, which is a true substring test.

`Chlorophyll` is the only pre-existing entry containing a literal em dash, and Task 2 removes it. The other three Task 2 rewrites violate the standalone rule but contain no em dash. Any *new* `glossary-*` term appearing in `emDashes` is a failure of this task.

---

### Task 2: Rewrite the 4 article-dependent definitions

**Files:** None. Sanity documents only.

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: 4 patched and published `glossaryTerm` documents. Task 3 does not depend on this task, but Task 4's verification asserts zero em dashes across the whole glossary, which requires it.

- [ ] **Step 1: Patch the 4 documents**

Call `mcp__Sanity__patch_documents`, setting `shortDefinition` on each. These are existing UUID-keyed documents:

| `_id` | `term` | New `shortDefinition` |
|---|---|---|
| `f9d52f3d-3b7a-4813-836f-70489a9b8d49` | Chlorophyll | The green pigment that captures light for photosynthesis. It dominates the color of healthy plant tissue and breaks down as a plant senesces. |
| `f9f2eac6-4402-4202-8e2c-787438c8f7e3` | Botrytis cinerea | The fungus behind bud rot, also called gray mold. Its spores germinate in prolonged leaf wetness at high humidity, at roughly 13 to 24 °C (55 to 75 °F). |
| `fea381a8-7c22-4279-a23e-80b6051164ce` | Trichome | The resin gland on cannabis flower where cannabinoids and terpenes are produced. Trichome density is the usual visual proxy for potency. |
| `ec7d053b-b805-4ce2-9dfd-d6e5a379373b` | Anthocyanin | Water-soluble flavonoid pigments stored in plant cell vacuoles. They produce purple, red and blue tones in cannabis and in many fruits and vegetables. |

Before patching, confirm each `_id` still resolves to the expected `term`. If any mismatch, stop and report.

- [ ] **Step 2: Publish the 4**

Call `mcp__Sanity__publish_documents` with those 4 `_id`s.

- [ ] **Step 3: Verify no article-dependent copy remains**

Call `mcp__Sanity__query_documents` with `perspective: "published"`:

Use `string::split` for every check. `match` is a tokenizing full-text operator and cannot test for a literal substring (see the note in Task 1 Step 4).

```groq
*[_type == "glossaryTerm" && (
  count(string::split(shortDefinition, "—")) > 1 ||
  count(string::split(shortDefinition, "purpling")) > 1 ||
  count(string::split(shortDefinition, "than color")) > 1 ||
  count(string::split(shortDefinition, "unrelated to cannabinoids")) > 1 ||
  count(string::split(shortDefinition, "that induces anthocyanin")) > 1
)]{term, shortDefinition}
```

Expected: `[]`. This asserts across all 25 terms, so it also re-confirms Task 1's output.

---

### Task 3: Annotate the purple post with 17 new marks

**Files:** None. Sanity document `4a30c75c-f328-431c-be1f-dac96d67c4fe` (`blogPost`, slug `why-cannabis-turns-purple`).

**Interfaces:**
- Consumes: the 17 `_id`s published in Task 1. Every `markDefs` entry below points at one of them.
- Produces: a patched post whose body carries 25 `glossaryRef` marks (8 existing plus 17 new).

**Background on the edit shape.** A Portable Text mark applies to a whole span, so marking a word inside a sentence means splitting that span into several and carrying the mark on the middle one. Each block below therefore replaces its entire `children` array and appends to its `markDefs` array. New spans use a `z###` key prefix to avoid colliding with the existing `s####`, `x###` and `y###` keys.

Every `markDefs` entry has the shape:

```json
{"_key": "<markKey>", "_type": "glossaryRef", "term": {"_type": "reference", "_ref": "<documentId>"}}
```

- [ ] **Step 1: Confirm the post is in the expected pre-patch state**

Call `mcp__Sanity__query_documents`:

```groq
*[_id == "4a30c75c-f328-431c-be1f-dac96d67c4fe"][0]{
  "marks": count(body[].markDefs[_type == "glossaryRef"][]),
  "targets": body[_key in ["b000a","b000p","b0011","b001e","b001v","b002t","b002w","b003i","b003k","b003q","b003u","b004f"]]{_key, "spanKeys": children[]._key}
}
```

Expected: `marks` is `8`, and all 12 target blocks are present with the span keys named in Step 2. If a span key is missing, the block has been edited since this plan was written — stop and report rather than guessing.

- [ ] **Step 2: Patch the 12 blocks**

For each block, `set` both `body[_key=="<blockKey>"].children` (full array, in order) and `body[_key=="<blockKey>"].markDefs` (existing entries plus the new ones listed). All spans are `_type: "span"`.

**Block `b000a`** — add `gFlav` → `glossary-flavonoid`, `gVacu` → `glossary-vacuole`.
Children: keep `s0007` and `s0008` unchanged, then replace `s0009` with:

| `_key` | `marks` | `text` |
|---|---|---|
| `z001` | `[]` | ` — water-soluble ` |
| `z002` | `["gFlav"]` | `flavonoid` |
| `z003` | `[]` | ` pigments stored in the ` |
| `z004` | `["gVacu"]` | `vacuoles` |
| `z005` | `[]` | ` of plant cells. They're the same class of molecule that colors blueberries, red cabbage, and Concord grapes.` |

**Block `b000p`** — add `gCann` → `glossary-cannabinoid`, `gCola` → `glossary-cola`.
Children: keep `s000n` unchanged, then replace `s000o` with:

| `_key` | `marks` | `text` |
|---|---|---|
| `z010` | `[]` | ` ` (single space) |
| `z011` | `["gCann"]` | `cannabinoids` |
| `z012` | `[]` | ` are synthesized in the glandular trichomes via a completely separate pathway (polyketide → CBGA → THCA/CBDA). Anthocyanins are synthesized in the vacuoles of the underlying plant tissue. These two systems do not feed each other. A purple ` |
| `z013` | `["gCola"]` | `cola` |
| `z014` | `[]` | ` and a high-THC cola have nothing mechanistically in common.` |

**Block `b0011`** — add `gGeno` → `glossary-genotype`.
Children: keep `s000y` and `s000z` unchanged, then replace `s0010` with:

| `_key` | `marks` | `text` |
|---|---|---|
| `z020` | `[]` | ` condition tested — 4 °C (39 °F), 24 °C (75 °F), with or without sucrose — while green-leaf seedlings stayed green even at 4 °C (39 °F), because they carried a functional repressor protein that shut down MBW complex activity. ` |
| `z021` | `["gGeno"]` | `Genotype` |
| `z022` | `[]` | ` gated the response entirely.` |

**Block `b001e`** — add `gPhen` → `glossary-phenohunting`.
Children: replace the single span `s001d` with:

| `_key` | `marks` | `text` |
|---|---|---|
| `z030` | `[]` | `Know which bucket every cultivar in your rotation falls into. That's a ` |
| `z031` | `["gPhen"]` | `phenohunting` |
| `z032` | `[]` | ` question, not a climate question.` |

**Block `b001v`** — add `gInfl` → `glossary-inflorescence`.
Children: keep `s001q`, `s001r`, `s001s`, `s001t` unchanged, then replace `s001u` with:

| `_key` | `marks` | `text` |
|---|---|---|
| `z040` | `[]` | `. They used a day-neutral inbred population with uniform purple expression and tested constant temperatures from 0.5 °C to 22 °C (33 °F to 72 °F), measuring ` |
| `z041` | `["gInfl"]` | `inflorescence` |
| `z042` | `[]` | ` dry weight, CBD percentage, and anthocyanin concentration.` |

**Block `b002t`** — add `gCoco` → `glossary-coco-coir`, `gLock` → `glossary-lockout`.
Children: keep `s002n`, `s002o`, `s002p`, `s002q`, `s002r` unchanged, then replace `s002s` with:

| `_key` | `marks` | `text` |
|---|---|---|
| `z060` | `[]` | `, which is homeostatically regulated and genetically determined. It is not meaningfully steered by your reservoir. Running your nutrient solution off-target to chase color will cost you nutrient availability long before it changes a single shade — and in ` |
| `z061` | `["gCoco"]` | `coco` |
| `z062` | `[]` | ` drain-to-waste especially, you'll create ` |
| `z063` | `["gLock"]` | `lockout` |
| `z064` | `[]` | ` problems fast.` |

**Block `b002w`** — add `gTran` → `glossary-translocation`.
Children: keep `s002u` unchanged, then replace `s002v` with:

| `_key` | `marks` | `text` |
|---|---|---|
| `z050` | `[]` | ` A hard, abrupt drop is a stress event, not a finishing technique. Anthocyanin induction is a gradual acclimation response. Sudden chilling in late flower gets you stalled ripening, reduced ` |
| `z051` | `["gTran"]` | `translocation` |
| `z052` | `[]` | `, and — as covered below — the environmental conditions that fungal pathogens are waiting for.` |

**Block `b003i`** — add `gRelh` → `glossary-relative-humidity`.
Children: keep `s003f` unchanged, replace `s003g` with the two spans below, then keep `s003h` unchanged. Note both new spans retain the `strong` mark:

| `_key` | `marks` | `text` |
|---|---|---|
| `z070` | `["strong", "gRelh"]` | `Relative humidity` |
| `z071` | `["strong"]` | ` is a function of temperature.` |

**Block `b003k`** — add `gTrsp` → `glossary-transpiration`.
Children: replace the single span `s003j` with:

| `_key` | `marks` | `text` |
|---|---|---|
| `z080` | `[]` | `Take a room at 78 °F and 55% RH. Its dew point is about 60 °F. Drop the night temp to 62 °F and you're sitting at roughly 93% RH with condensation forming on any surface at or below 60 °F. Inside a dense cola, where airflow is near zero and ` |
| `z081` | `["gTrsp"]` | `transpiration` |
| `z082` | `[]` | ` is still adding moisture, the microclimate is effectively saturated.` |

**Block `b003q`** — add `gGutt` → `glossary-guttation`, `gPowd` → `glossary-powdery-mildew`.
Children: keep `y130` unchanged, then replace `y131` with:

| `_key` | `marks` | `text` |
|---|---|---|
| `z090` | `[]` | ` falls as temperature drops and RH rises. When VPD collapses, transpiration stalls, which means calcium — moved almost entirely by transpirational flow — stops reaching developing tissue. ` |
| `z091` | `["gGutt"]` | `Guttation` |
| `z092` | `[]` | ` and condensation follow. Persistent low VPD at night is one of the more reliable ways to invite both bud rot and ` |
| `z093` | `["gPowd"]` | `powdery mildew` |
| `z094` | `[]` | `.` |

**Block `b003u`** — add `gDtw` → `glossary-drain-to-waste`, `gEc` → `glossary-ec`.
Children: replace the single span `s003t` with:

| `_key` | `marks` | `text` |
|---|---|---|
| `z100` | `[]` | `In ` |
| `z101` | `["gDtw"]` | `drain-to-waste` |
| `z102` | `[]` | ` coco, root zone temperature tracks air temperature with a lag but eventually follows it down. Below roughly 60 °F substrate temperature, water and nutrient uptake slow markedly. If you're still running a full flowering ` |
| `z103` | `["gEc"]` | `EC` |
| `z104` | `[]` | ` into a cold root zone, you'll build up salts you didn't intend to. Watch runoff EC closely any time you drop night temps.` |

**Block `b004f`** — add `gDif` → `glossary-dif`.
Children: replace `s004d` with the three spans below, then keep `s004e` unchanged. All three retain `strong`:

| `_key` | `marks` | `text` |
|---|---|---|
| `z110` | `["strong"]` | `Use a modest ` |
| `z111` | `["strong", "gDif"]` | `DIF` |
| `z112` | `["strong"]` | `, not a shock.` |

- [ ] **Step 3: Verify the text is byte-identical to before**

The split must not change a single character of prose. Call `mcp__Sanity__query_documents`:

```groq
*[_id == "4a30c75c-f328-431c-be1f-dac96d67c4fe"][0].body[
  _key in ["b000a","b000p","b0011","b001e","b001v","b002t","b002w","b003i","b003k","b003q","b003u","b004f"]
]{_key, "joined": array::join(children[].text, "")}
```

Compare each `joined` value against the original text recorded in the design doc's annotation table and in Step 2's span tables (concatenate the `text` column in order). Any difference means a typo was introduced during the split, which is the main risk in this task.

- [ ] **Step 4: Verify mark count and reference resolution**

```groq
*[_id == "4a30c75c-f328-431c-be1f-dac96d67c4fe"][0]{
  "glossaryMarks": count(body[].markDefs[_type == "glossaryRef"][]),
  "unresolved": body[].markDefs[_type == "glossaryRef"][]{
    _key, "ok": defined(term->_id)
  }[ok == false]
}
```

Expected: `glossaryMarks` is `25`, `unresolved` is `[]`.

- [ ] **Step 5: Publish the post**

Call `mcp__Sanity__publish_documents` with `4a30c75c-f328-431c-be1f-dac96d67c4fe`.

---

### Task 4: Build, verify rendering, and confirm deploy

**Files:** None committed. Build output in `dist/` only.

**Interfaces:**
- Consumes: everything published in Tasks 1 to 3.

- [ ] **Step 1: Build against real published content**

```bash
make build
```

Expected: exit 0. A `glossaryRef` whose reference did not resolve throws at build time naming the offending mark key, so a clean build is itself the reference-integrity check.

The design doc is explicit that a fixture does not count as verification here. A fixture using the wrong shape is what shipped the broken `_ref` build on 2026-08-04.

- [ ] **Step 2: Verify the glossary index has 25 entries**

```bash
grep -c 'class="glossary-index-entry"' dist/glossary/index.html
```

Expected: `25`.

- [ ] **Step 3: Verify every new term page generated**

```bash
for slug in dif cola ec lockout phenohunting coco-coir drain-to-waste \
            cannabinoid flavonoid inflorescence vacuole genotype \
            transpiration relative-humidity powdery-mildew guttation translocation; do
  test -f "dist/glossary/$slug/index.html" || echo "MISSING: $slug"
done
```

Expected: no output.

- [ ] **Step 4: Verify the post renders 25 glossary links**

```bash
grep -o 'class="glossary-term"' dist/blog/why-cannabis-turns-purple/index.html | wc -l
```

Expected: `25`.

Then confirm the two hand-placed marks landed on the right words:

```bash
grep -o 'href="/glossary/ec"[^>]*>EC<' dist/blog/why-cannabis-turns-purple/index.html
grep -o 'href="/glossary/dif"[^>]*>DIF<' dist/blog/why-cannabis-turns-purple/index.html
```

Expected: one match each.

- [ ] **Step 5: Verify backlinks resolve**

```bash
grep -l 'why-cannabis-turns-purple' dist/glossary/*/index.html | wc -l
```

Expected: `25`. Every term in the glossary is cited by this post, so every term page should backlink to it.

- [ ] **Step 6: Confirm a deploy fired**

Publishing content should trigger a `workflow_dispatch` rebuild via the Sanity webhook. Per open issue #29 that webhook is unreliable, so verify rather than assume:

```bash
gh run list --workflow=deploy.yml --limit 3
```

Expected: a run created after the Task 3 publish. If none appears within a few minutes, dispatch manually:

```bash
gh workflow run deploy.yml --ref main
```

- [ ] **Step 7: Confirm nothing in the repo changed**

```bash
git status --short
```

Expected: empty. This is a content-only change, so a dirty tree means something unintended was written. The spec and plan were committed before execution began.

---

## Notes for the implementer

**Why there are no tests.** The repo has no test framework (`CLAUDE.md`: "No test framework is configured"). The equivalent discipline here is that every write step is followed by a GROQ query that asserts the expected post-state, and the build itself is the integration test — an unresolved reference is a hard build failure by design, not a silent one.

**The highest-risk step is Task 3 Step 2.** Splitting a span means retyping prose, and a dropped space or a straight quote in place of a curly one will not fail any check except Step 3's byte-comparison. Copy the `text` values verbatim from the tables rather than retyping them. Note that the source uses curly apostrophes (`you're`, `don't`), en dashes in numeric ranges (`8–12`), em dashes in prose, `°` symbols, `→` arrows, and `≥`. The no-em-dash rule governs `shortDefinition` only, not this pre-existing article prose.

**If the build fails on an unresolved reference,** the error names the offending mark key. Cross-reference it against the `markDefs` tables in Task 3 Step 2 to find which `_ref` is wrong, most likely a typo in a `glossary-<slug>` ID.
