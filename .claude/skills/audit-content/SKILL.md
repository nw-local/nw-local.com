---
name: audit-content
description: Audit Sanity content for missing fields and quality issues
---

# /audit-content

Scan all content in Sanity CMS and report quality issues.

## Usage

- `/audit-content` — full audit of all content types
- `/audit-content strains` — audit only strains

## Checks

**Strains:**
- Missing hero image
- Missing description
- Empty effects array
- Empty terpenes array
- Missing THC/CBD range
- Missing slug

**Products:**
- Missing strain reference
- Missing category
- Missing image (and no strain hero image fallback)
- Missing slug

**Blog Posts:**
- Missing SEO description
- Description over 160 characters
- Missing hero image
- Missing body content
- Missing slug
- Missing author reference

**Retailers:**
- Missing address fields (address, city, zip)
- Missing contact info (no phone, email, or website)
- Missing slug

**Site Settings:**
- Missing site title
- Missing logo
- Missing age gate message

## Output

Report findings grouped by content type, with document names and specific missing fields. Suggest fixes where appropriate.
