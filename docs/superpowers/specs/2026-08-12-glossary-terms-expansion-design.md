# Glossary terms expansion — design

**Date:** 2026-08-12
**Status:** approved
**Builds on:** [2026-08-04-glossary-design.md](./2026-08-04-glossary-design.md)

## Problem

The glossary shipped on 2026-08-04 with 8 terms, all drawn from
[Why Cannabis Turns Purple](https://www.nw-local.com/blog/why-cannabis-turns-purple). That article
uses considerably more unexplained vocabulary than 8 terms' worth. `DIF` appears exactly once, in
protocol step 2, never expanded. `EC` is used twice and never spelled out. `cannabinoid` carries the
article's central contrast (anthocyanins and cannabinoids are unrelated pathways) while only the
anthocyanin half is defined.

A second problem surfaced while drafting. Several of the original 8 definitions were written *at*
the purple article rather than as standalone definitions, so a reader arriving from a search engine
gets a sentence that only parses if they have already read the post.

## Scope

Pure content change. `/glossary`, `/glossary/[slug]` and `GlossaryTerm.astro` are driven by
`getGlossaryTerms()` and the existing `glossaryRef` annotation, so 17 new documents require no code.
No schema change either: `term`, `slug` and `shortDefinition` already cover it.

- **17 new `glossaryTerm` documents.** Glossary goes 8 to 25.
- **4 existing definitions rewritten** to meet the standalone rule below.
- **17 new `glossaryRef` marks** on the purple post, one per new term.

## Authoring conventions

These govern every future glossary entry, not just this batch. Both were established by user
correction during this design. They are now canonicalized in
[2026-08-04-glossary-design.md](./2026-08-04-glossary-design.md#authoring-conventions); this section
is kept as the historical record of where and why they originated.

### 1. Definitions must stand alone

A definition explains the term as it exists in the world. It may state a general fact about the term
(calcium moves almost entirely by transpirational flow; anthocyanins are a flavonoid subclass). It
may not reference the argument, conclusions or framing of whatever article prompted it.

The failure mode is subtle, because an article-specific clause still reads as true. `Chlorophyll`
ended on "which is why purpling can look sudden", which is accurate, useful inside the purple post,
and meaningless to a reader who arrived from a search for "what is chlorophyll".

### 2. No em dashes in published copy

`shortDefinition` is published copy and renders in three places, so the site-wide copy rule applies:
no em dashes, no constructed aphorisms, no restating the same fact twice in different words. Use
commas, periods or parentheses. Em dashes at density read as AI-written and undermine the
credibility the copy exists to build.

This rule governs published copy only. It does not apply to code comments, commit messages or these
design docs.

## The 17 new terms

| Term | Slug | Short definition |
|---|---|---|
| DIF | `dif` | Day temperature minus night temperature. A large positive DIF promotes stem elongation and a small or negative one suppresses it, making it a lever for plant height and finish. |
| Cola | `cola` | A cluster of cannabis flowers packed along a stem. The largest sits at the top of the plant, with smaller ones on lateral branches. Airflow inside a cola is close to zero. |
| Electrical conductivity (EC) | `ec` | A measure of dissolved salts in nutrient solution, used as the working proxy for feed strength. Runoff EC tells you what the root zone is actually holding. |
| Lockout | `lockout` | When nutrients are present but chemically unavailable to the plant, usually from off-target pH or salt buildup. The plant shows a deficiency you cannot feed away. |
| Phenohunting | `phenohunting` | Growing out a seed population and selecting the individual plants worth keeping. It is how a breeder finds the one phenotype that becomes a named cultivar. |
| Coco coir | `coco-coir` | A coconut-husk growing substrate. It holds little nutrient charge of its own, so it is fed every irrigation and reacts fast to changes in temperature or EC. |
| Drain-to-waste | `drain-to-waste` | An irrigation strategy where runoff is discarded rather than recirculated. Runoff readings become the main window into what the root zone is doing. |
| Cannabinoid | `cannabinoid` | The class of compounds including THC, CBD and CBG, produced in the glandular trichomes of cannabis flower and responsible for its psychoactive and medicinal effects. |
| Flavonoid | `flavonoid` | A large class of plant compounds covering pigments, UV protectants and antioxidants, found throughout the plant kingdom. Anthocyanins are one flavonoid subclass. |
| Inflorescence | `inflorescence` | The botanical term for a flower cluster, what the trade calls a bud. Research reports cannabis yield as inflorescence dry weight. |
| Vacuole | `vacuole` | The large fluid-filled compartment inside a plant cell, used for storage and to maintain turgor pressure. Water-soluble pigments such as anthocyanins are held here. |
| Genotype | `genotype` | The genetic makeup an organism carries, as distinct from the phenotype (the observable traits that result from a genotype interacting with its environment). |
| Transpiration | `transpiration` | Water moving up through the plant and evaporating out through the stomata. It drives nutrient uptake, and carries calcium, which moves almost entirely by that flow. |
| Relative humidity | `relative-humidity` | The share of moisture air is holding against the most it could hold at that temperature. Because it moves with temperature, cooling air raises RH with no water added. |
| Powdery mildew | `powdery-mildew` | A fungal disease that coats leaf and stem surfaces in white powdery growth. Unlike most fungal pathogens it needs no free water to infect, only high humidity. |
| Guttation | `guttation` | Droplets a plant pushes out at its leaf margins when root pressure keeps working but transpiration has stalled. Free water sitting on tissue is an infection route. |
| Translocation | `translocation` | The movement of sugars and nutrients through a plant's phloem, from where they are made or stored to where they are needed. |

### Naming decisions

- **`DIF` stays abbreviated.** It is not an initialism that expands cleanly, so the definition
  carries the expansion instead. This differs from `Vapor pressure deficit`, which does expand.
- **`Electrical conductivity (EC)` is spelled out** so it sorts and reads sensibly in the A-Z index.
  The article only ever writes "EC", so the mark sits on the abbreviation while the entry carries
  the full name. Its slug is **hand-set to `ec`**, not the `electrical-conductivity-ec` that
  Sanity's slugifier produces from a parenthesized title. `slug` has `options: { source: 'term' }`,
  which only prefills the field in Studio, so a written-in value is preserved. This is the first
  glossary slug that does not match its term, and it is deliberate: slugs are the one part of an
  entry that is awkward to change once published.
- **`Coco coir` and `Drain-to-waste` are two entries.** A substrate and an irrigation strategy are
  different concepts and each recurs independently.
- **`Bag appeal` and `Veg` were considered and cut.** `Bag appeal` is trade vernacular rather than
  science. `Veg` is too basic for a reader who is already deep enough to be reading about
  anthocyanin biosynthesis. Either is worth adding if a future post needs it for a less specialised
  audience.

## Rewrites to the existing 8

Four of the original entries violate the standalone rule. The other four (`Cultivar`, `Dew point`,
`Senescence`, `Vapor pressure deficit`) pass and are untouched.

| Term | Offending clause | Replacement |
|---|---|---|
| Chlorophyll | "As it degrades in late flower, anthocyanins underneath become visible, which is why purpling can look sudden." | The green pigment that captures light for photosynthesis. It dominates the color of healthy plant tissue and breaks down as a plant senesces. |
| Botrytis cinerea | "in roughly the same temperature range that induces anthocyanin" | The fungus behind bud rot, also called gray mold. Its spores germinate in prolonged leaf wetness at high humidity, at roughly 13 to 24 °C (55 to 75 °F). |
| Trichome | "a far better visual proxy for potency than color" | The resin gland on cannabis flower where cannabinoids and terpenes are produced. Trichome density is the usual visual proxy for potency. |
| Anthocyanin | "and are unrelated to cannabinoids" | Water-soluble flavonoid pigments stored in plant cell vacuoles. They produce purple, red and blue tones in cannabis and in many fruits and vegetables. |

`Botrytis cinerea` keeps its temperature range. That is a general fact about the fungus, not the
article's argument about it.

## Annotation plan

One `glossaryRef` mark per new term, at first occurrence, matching how the original 8 were placed.

| Term | Anchor text | Location |
|---|---|---|
| Flavonoid | `flavonoid` | Opening paragraph of "The pigment" |
| Vacuole | `vacuoles` | Opening paragraph of "The pigment" |
| Cannabinoid | `cannabinoids` | "The key structural point" paragraph |
| Cola | `cola` | "The key structural point" paragraph |
| Genotype | `Genotype` | Chinese cabbage paragraph |
| Phenohunting | `phenohunting` | Closing line of "Genetics is the gate" |
| Inflorescence | `inflorescence` | Kim et al. study setup |
| Translocation | `translocation` | Cold-shock myth |
| Lockout | `lockout` | Feed pH myth |
| Coco coir | `coco` | Feed pH myth |
| Transpiration | `transpiration` | Dew point paragraph |
| Relative humidity | `Relative humidity` | Bolded sentence in "The dew point problem" |
| Guttation | `Guttation` | VPD collapse |
| Powdery mildew | `powdery mildew` | VPD collapse |
| Drain-to-waste | `drain-to-waste` | "Root zone lag in coco" |
| Electrical conductivity (EC) | `EC` | "Root zone lag in coco" |
| DIF | `DIF` | Protocol step 2 |

### Three deviations from strict first-occurrence

1. **`Drain-to-waste`** first appears in "in coco drain-to-waste especially", immediately after where
   `coco` is marked. Two adjacent dotted underlines read as a single broken link, so the mark moves
   to the later occurrence in "Root zone lag in coco".
2. **`Relative humidity`** is first spelled out inside the Buirs citation. The mark goes on the
   bolded "Relative humidity is a function of temperature" instead, where the concept is being
   taught rather than quoted.
3. **`Cannabinoid`** first appears in the h2 heading "The pigment: anthocyanins, not cannabinoids",
   before the marked occurrence in the "key structural point" paragraph. Headings are not marked, so
   the mark sits on the later occurrence, where the term is used in running prose rather than in a
   title.

## Verification

- `make build` against real published content, then grep `dist/` for the rendered markup. A fixture
  using the wrong shape is what shipped the broken `_ref` build on 2026-08-04, so a fixture does not
  count as verification here.
- `/glossary` lists 25 entries.
- Each new `/glossary/<slug>` page generates, and its backlink to the purple post resolves.
  `/glossary/ec` in particular, since it is the one hand-set slug.
- The purple post renders 25 glossary links with no unresolved-reference build error.
- Confirm a deploy actually fires after publish. Per open issue #29 the Sanity webhook is
  unreliable, so fall back to a manual `workflow_dispatch` if no run appears.

## Out of scope

- The purple article's own prose uses em dashes heavily. It is pre-existing published copy and the
  copy rule presumably applies, but rewriting it is a separate piece of work.
- Backfilling glossary marks into any other post.
- The `body` field. No glossary term uses it yet, and nothing concrete wants it.
