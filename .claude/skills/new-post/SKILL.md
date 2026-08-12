---
name: new-post
description: Create and publish a blog post in Sanity CMS
---

# /new-post

Create and publish a blog post for Northwest Local Cannabis.

## Usage

- `/new-post` — brainstorm mode, collaboratively draft the post
- `/new-post "Post Title"` — start with a title pre-filled

## Workflow

1. **Determine mode:**
   - **Brainstorm** — help the user develop the topic, draft content collaboratively
   - **Assembly** — user provides content, we format and publish

2. **Gather post details:**
   - Title (required)
   - Description / SEO excerpt (required, max 160 chars)
   - Body content (Portable Text)
   - Tags (array of strings)
   - Publish date (defaults to now)
   - Author (required) — query `*[_type == "author"]{ _id, name, slug }` and let the user pick one.
     If no `author` documents exist, **stop and tell the user to create an author first** — do not
     create the post without one, and do not invent a placeholder.

3. **Confirm with user** — show summary before creating

4. **Create in Sanity** — use MCP tools to create and publish the blog post. Set `author` as a
   reference to the chosen document: `{ "_type": "reference", "_ref": "<author document _id>" }`.

5. **Report** — show the created document ID and URL
