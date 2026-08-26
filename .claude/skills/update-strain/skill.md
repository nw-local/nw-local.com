---
name: update-strain
description: Update an existing strain's images, content, or fields in Sanity CMS
---

# /update-strain

Update an existing cannabis strain in the Northwest Local Cannabis catalog via Sanity MCP.

## Usage

- `/update-strain` — lists all strains, pick one to update
- `/update-strain "Donny Burger"` — jump straight to that strain

## Important

- **Workspace name**: Always use `workspaceName: "nw-local"` for all Sanity MCP calls.
- **SANITY_WRITE_TOKEN**: Image uploads use `make upload-image`, which requires `SANITY_WRITE_TOKEN` in `.env` (separate from the read-only `SANITY_API_TOKEN`).
- **Never use `source .env`**: Always run scripts via their `make` targets (e.g., `make upload-image`, `make prep-images`) — the Makefile loads `.env` automatically.

## Workflow

1. **Select strain:**
   - If a name was provided, query Sanity for that strain by name
   - If no name, query all strains: `*[_type == "strain"] | order(name asc){_id, name, strainType, featured, available}` and present the list
   - Fetch the full strain document once selected

2. **Show current state** — render a readable summary:
   - Name, strain type, THC/CBD ranges
   - Effects and terpenes
   - Featured and available status
   - Hero image: show the Sanity CDN URL as a thumbnail link
   - Gallery: count of images with thumbnail URLs
   - Description: first ~150 characters as a preview
   - Link to edit in Sanity Studio: `https://nw-local.sanity.studio/structure/strain;{_id}`

3. **Ask what to update:**
   - **Images** — hero, gallery, or both
   - **Content** — description, effects, terpenes, THC/CBD, etc.
   - **Both**

4. **If updating images:**
   - Ask the user for a directory path containing the new images
   - The user should pre-name their hero image with a descriptive filename (e.g., `hero.heic`)
   - **Look at the remaining images** (Claude is multimodal) and generate SEO-friendly descriptive stems for each
   - Run `make prep-images DIR="<path>" STRAIN="<name>" RENAME="<mappings>"` with the rename mappings
   - Show the output (conversion results + dedup check)
   - For each **NEW** file in `_processed/`, upload via `make upload-image` with:
     - `LABEL` — a short descriptive label
     - `DESCRIPTION` — SEO-friendly alt text describing the image content. **Always require a description** — do not upload without one.
   - For each **RENAME** file (same image, different filename), patch the existing Sanity asset using `patch_document_from_json` to update `originalFilename` and `label`
   - For **UPLOADED** files, no action needed
   - **Replace the strain's image fields** — use `patch_document_from_json` to set:
     - `heroImage` — the image with "hero" in its filename (or ask user which is the hero if ambiguous)
     - `gallery` — all non-hero images from `_processed/`
   - Show a preview of the updated image references before applying
   - The `_processed/` directory is the canonical reference — it should contain the complete set of images used on the strain page

5. **If updating content — ask:** "Want me to re-research this strain from multiple sources, or just make specific edits?"

6. **If re-research:**
   - Search for the strain on Leafly, Allbud, Weedmaps, SeedFinder, and similar databases (minimum 3 sources)
   - **Read user reviews** for real consumer language about aroma, flavor, appearance, and effects
   - Extract: strain type, effects, terpenes, THC range, CBD range
   - Research lineage, genetics, and breeder
   - Validate all links via `WebFetch`
   - **Show a diff** of current vs proposed values for each field
   - **Write original descriptions** — never copy phrases directly from any single source. Synthesize information from multiple sources and user reviews into NW Local's own voice.
   - Include lineage and breeder info in the description as rich text with inline links
   - **Add a "Learn More" section** at the end with bulleted links to authoritative sources
   - User approves which changes to apply — they can accept all, reject all, or cherry-pick individual fields

7. **If manual edit:**
   - Show current values for all editable fields:
     - `name`, `strainType`, `thcRange`, `cbdRange`
     - `effects` (array of strings)
     - `terpenes` (array of strings)
     - `description` (block content)
     - `featured`, `available`
     - `nextHarvestDate`
   - Ask which fields to change
   - For description changes, follow the same writing guidelines as `/new-strain`: original voice, inline links, Learn More section
   - Apply only the requested changes

7a. **If the change is a rename** — `name` is never the only field that carries the old name. Work the full list before publishing:
   - `name` and `slug.current` on the strain
   - The `description` prose, and the *link text* of any Learn More bullet. Ask whether external links naming the old strain should stay: when a rename is requested by the genetics provider, links to the old name's Leafly/SeedFinder/seed-shop pages re-establish exactly the association the rename was meant to break, and that is the user's call rather than a default
   - `heroImage.alt` and every `gallery[].alt` — **these are what the page renders**, and they are separate from the asset's `description`. Patching only the asset changes what the Studio shows and leaves the visitor-facing alt untouched. See the alt-text invariant in the repo's `CLAUDE.md`
   - `originalFilename`, `label`, and `description` on each `sanity.imageAsset`. Safe to rename: the CDN URL is built from the asset `_id` (the file's SHA-1), so no image URL changes and `prep-images` dedup is unaffected
   - Any `product` referencing the strain, and any `blogPost`, `page`, or `glossaryTerm` mentioning it. Use `count(string::split(lower(field), "oldname")) > 1`, never `match` — `match` tokenizes and returns everything
   - **Verify by grepping built `dist/` HTML for the old name, not by trusting a GROQ result.** The build flattens every field onto one surface; a projection that looks exhaustive routinely misses sibling fields like `alt` and `caption`
   - The slug change 404s the old URL. Offer a `redirects` entry in `astro.config.mjs`, and **publish the Sanity rename before that PR merges** — the reverse order breaks both URLs. See the redirect invariant in `CLAUDE.md`

8. **Ask if featured** — show current featured status and ask if it should be changed. Default to current value if the user declines.

9. **Preview and publish:**
   - Patch the strain document as a draft using `patch_document_from_json`
   - Show the updated document as readable markdown for confirmation
   - On approval, publish using `publish_documents`

10. **Create missing terpene documents** — if the update introduces terpenes that don't yet have a `terpene` document in Sanity:
   - Research the terpene (aroma, effects, where it's found in nature)
   - Create the document with name, slug, tagline, aroma, effects, foundIn, and description
   - **Generate a hero image** using `mcp__Sanity__generate_image` with this exact style prompt template:
     `"Stylized flat illustration of [natural sources] in a modern animated style. Bold colors, clean lines, minimal shading, dark background. Digital art, no text, no photorealism."`
   - Always use `workspaceName: "nw-local"` for the generate_image call
   - Publish the terpene document after the image generates

11. **Report** — show what was updated and a link to view in Sanity Studio
