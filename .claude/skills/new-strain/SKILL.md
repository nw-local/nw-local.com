---
name: new-strain
description: Add a new strain to the Sanity CMS catalog
---

# /new-strain

Add a new cannabis strain to the Northwest Local Cannabis catalog via Sanity MCP.

## Usage

- `/new-strain` — interactive mode, walk through all fields
- `/new-strain "Blue Dream"` — start with a name pre-filled

## Important

- **Workspace name**: Always use `workspaceName: "nw-local"` for all Sanity MCP calls.
- **SANITY_WRITE_TOKEN**: Image uploads use `make upload-image`, which requires `SANITY_WRITE_TOKEN` in `.env` (separate from the read-only `SANITY_API_TOKEN`).
- **Never use `source .env`**: Always run scripts via their `make` targets (e.g., `make upload-image`, `make prep-images`) — the Makefile loads `.env` automatically.

## Workflow

1. **Get strain name** (required) — strain type is determined via research in the next step, not asked from the user

2. **Research from multiple sources** (minimum 3 distinct sources):
   - Search for the strain name on Leafly, Allbud, Weedmaps, SeedFinder, and similar databases
   - **Read user reviews** on Leafly and other platforms — look for real consumer language about aroma, flavor, appearance, and effects. This is critical for writing original descriptions.
   - Extract: **strain type** (indica, sativa, hybrid), effects, terpenes, THC range, CBD range from factual sources
   - **Always research lineage, genetics, and breeder** — identify the breeder/seed company, parent strains, and genetic lineage
   - Find the breeder's official website and verify the link loads successfully
   - Cross-reference facts across sources — if only one source mentions something, note the uncertainty

3. **Validate all links:**
   - Use `WebFetch` to confirm every external URL (breeder sites, etc.) returns a valid response
   - Do not include any link that fails validation

4. **Present a readable markdown preview** — before any Sanity mutations, show the user a formatted preview:
   - Full description text rendered as markdown with inline links visible
   - A summary table of all fields (effects, terpenes, THC/CBD, available, etc.)
   - Image file names and proposed alt text
   - List of all links with validation status (✓ / ✗)
   - Wait for explicit user approval before proceeding

5. **Prompt for images:**
   - Ask if the user has a **directory** of images or **individual file paths**
   - **If directory:**
     - The user should pre-name their hero image with a descriptive filename (e.g., `hero.heic`, `donny-burger-hero.jpg`)
     - **Look at the remaining images** (Claude is multimodal) and generate SEO-friendly descriptive stems for each (e.g., `bud-closeup`, `trichome-detail`, `dense-frosty-nug`)
     - Run `make prep-images DIR="<path>" STRAIN="<name>" RENAME="IMG_3559.HEIC:bud-closeup,IMG_3561.HEIC:trichome-detail"` with the rename mappings
     - Show the output (conversion results + dedup check)
     - For each NEW (non-duplicate) file in `_processed/`, proceed to upload via `make upload-image`
     - Skip any files flagged as duplicates
   - **If individual files:** proceed directly to upload
   - Hero image (optional — ask user for a file path)
     - **Clearly state the recommended dimensions: landscape 4:3, minimum 1200×900**
     - Explain that portrait images will be cropped on the strain page
   - Gallery images (optional — ask user for file paths, any aspect ratio is fine)

6. **Upload images** — if the user provided images, upload them via `make upload-image` with:
   - `FILE` — the image file path
   - `LABEL` — a short descriptive label (e.g., "Gastro Pop hero image")
   - `DESCRIPTION` — SEO-friendly alt text describing the image content (e.g., "Gastro Pop cannabis flower held in a gloved hand, showing dense purple buds coated in frosty trichomes with orange pistils, grown at Northwest Local Cannabis indoor facility"). **Always require a description** — do not upload without one.
   - The script will warn if the image is portrait orientation — relay this warning to the user and ask if they want to proceed or provide a different image
   - Parse the returned JSON to extract the asset `_id` for the document reference.

7. **Create in Sanity** — use MCP tools (`workspaceName: "nw-local"`) to create the strain document:
   - **Write original descriptions** — never copy phrases directly from any single source. Synthesize information from multiple sources and user reviews into NW Local's own voice. Descriptions should feel like they were written by someone who has smoked the strain, not pulled from a database. Use specific sensory details from user reviews (aroma, flavor, appearance, experience) rather than generic marketing language.
   - Include lineage and breeder info in the description as rich text with inline links (using Sanity block content `markDefs` for links)
   - **Add a "Learn More" section** at the end of the description with bulleted links (`listItem: "bullet"`) to authoritative sources used during research (e.g., Leafly strain page, breeder site, awards/recognition). This helps SEO by linking to high-authority domains and signals well-researched content to search engines. Only include links that passed validation in step 3.
   - Attach uploaded image asset references to `heroImage` and `gallery` fields
   - Create as draft first

8. **Homepage placement is automatic** — the homepage shows the six newest strains by creation date. Do not ask about or write a `featured` field.

9. **Show final preview** — render the draft content as readable markdown one more time for confirmation before publishing

10. **Publish** — use `publish_documents` to make the strain live

11. **Create missing terpene documents** — if the strain introduces terpenes that don't yet have a `terpene` document in Sanity, create them:
    - Research the terpene (aroma, effects, where it's found in nature)
    - Create the document with name, slug, tagline, aroma, effects, foundIn, and description
    - **Generate a hero image** using `mcp__Sanity__generate_image` with this exact style prompt template:
      `"Stylized flat illustration of [natural sources] in a modern animated style. Bold colors, clean lines, minimal shading, dark background. Digital art, no text, no photorealism."`
      Replace `[natural sources]` with the terpene's `foundIn` items (e.g., "mangoes and hops" for myrcene, "lavender sprigs and sweet basil" for linalool). This maintains visual consistency across all terpene pages.
    - Always use `workspaceName: "nw-local"` for the generate_image call
    - Publish the terpene document after the image generates

12. **Report** — show the created document ID and a link to edit in Sanity Studio
