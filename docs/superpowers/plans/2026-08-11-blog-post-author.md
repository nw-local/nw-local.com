# Blog Post Author Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Attribute blog posts to a real person, surfaced as a byline, an author page, `Person` JSON-LD, and an RSS `dc:creator` element.

**Architecture:** A new Sanity `author` document type is referenced from `blogPost`. The data layer projects a compact author summary into both blog queries and adds three author queries. Templates render a byline component in the post header and plain-text author names on cards. A new `/authors/<slug>/` page carries the bio and that author's posts. `buildArticle()` swaps its hardcoded Organization author for a `Person` when one exists.

**Tech Stack:** Astro 6 (SSG, strict TypeScript), Sanity CMS + GROQ, `@astrojs/rss`, yarn, `make` targets.

## Global Constraints

- **Two style regimes, split by directory. Do not apply one to the other.**
  - **`src/`, `scripts/`, root config** — spaced parens (`function name( arg )`, `if( condition )`), double quotes, semicolons, trailing commas. Enforced by the root ESLint config; `make format` rewrites it automatically.
  - **`studio/`** — its own Prettier config in `studio/package.json`: **no semicolons, single quotes, `bracketSpacing: false`**, and tight parens (`(rule) => rule.required()`). The root ESLint config **explicitly ignores `studio/**`** (`eslint.config.mjs:7`), so `make format` and `yarn lint` never touch these files. Match the surrounding studio files exactly; never reformat them toward the root style.
- **Descriptive variable names:** no single-character identifiers anywhere, including callback parameters (`post` not `p`, `index` not `i`).
- **No TypeScript `as` assertions.** Use type guards, narrowing, or `satisfies`.
- **No `eslint-disable` comments.**
- **Central data types:** card components import their `Props` from `src/lib/sanity.ts` rather than redeclaring inline shapes.
- **Accent green (`--accent`, #00ff88) is for emphasis, not surface** — CTAs, links, interactive states. Never a background for large areas.
- **No test framework is configured.** Verification is `yarn astro check`, `make build`, and reading real built output from `dist/`. Never claim a step passed without running its command and seeing the output.
- **`author` is required in Sanity validation but optional in the TypeScript type.** Code deploys before the content backfill, so there is a build window where the one existing post has no author. Every byline surface must render conditionally.
- **Run `make format` before every commit that touches `src/` or `scripts/`.** It is a no-op for `studio/` (ignored by the root ESLint config), so a studio-only task skips it.
- **Never boot the dev server.** The user keeps one running. Browser-level checks are requested from the user, not performed here.

---

### Task 1: Sanity author schema and Studio structure

**Files:**
- Create: `studio/schemaTypes/author.ts`
- Modify: `studio/schemaTypes/index.ts`
- Modify: `studio/schemaTypes/blogPost.ts:43` (insert after the `publishedAt` field)
- Modify: `studio/sanity.config.ts:28` (structure list)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: a Sanity document type named `author` with fields `name` (string), `slug` (slug), `role` (string), `photo` (image with `alt`), `bio` (blockContent), `sameAs` (array of url). `blogPost.author` is a required reference to it.

> **Why the structure list matters.** `studio/sanity.config.ts` uses an explicit `structureTool` list that enumerates document types one by one. Registering a type in `schemaTypes` alone makes it exist but leaves it **invisible in the Studio sidebar**. Skipping the structure edit means there is no way to create the author document in step 3 of the rollout.

- [ ] **Step 1: Create the author schema**

Create `studio/schemaTypes/author.ts`:

```ts
import { defineField, defineType } from 'sanity'

export const authorType = defineType({
  name: 'author',
  title: 'Author',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: { source: 'name', maxLength: 96 },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'role',
      title: 'Role',
      type: 'string',
      description: 'Job title shown under the byline (e.g., "Co-Founder")',
    }),
    defineField({
      name: 'photo',
      title: 'Photo',
      type: 'image',
      options: { hotspot: true },
      fields: [
        defineField({
          name: 'alt',
          title: 'Alternative Text',
          type: 'string',
          validation: (rule) => rule.required(),
        }),
      ],
    }),
    defineField({
      name: 'bio',
      title: 'Bio',
      type: 'blockContent',
      description: 'Short biography shown on the author page.',
    }),
    defineField({
      name: 'sameAs',
      title: 'Profile Links',
      type: 'array',
      of: [{ type: 'url' }],
      description:
        'External profiles that corroborate this author’s identity. Emitted as schema.org sameAs.',
    }),
  ],
  preview: {
    select: { title: 'name', subtitle: 'role', media: 'photo' },
  },
})
```

- [ ] **Step 2: Register the type**

In `studio/schemaTypes/index.ts`, add the import alphabetically (before `blockContentType`'s neighbours as the list is alphabetical) and add it to the exported array:

```ts
import { authorType } from './author'
```

Add `authorType,` as the first entry of the `schemaTypes` array, keeping alphabetical order:

```ts
export const schemaTypes = [
  authorType,
  blockContentType,
  blogPostType,
  glossaryTermType,
  pageType,
  productType,
  retailerPageType,
  retailerType,
  siteSettingsType,
  strainType,
  terpeneType,
]
```

- [ ] **Step 3: Add the author reference to blogPost**

In `studio/schemaTypes/blogPost.ts`, insert this field immediately after the `publishedAt` field (which ends at line 43) and before the `tags` field:

```ts
    defineField({
      name: 'author',
      title: 'Author',
      type: 'reference',
      to: [{ type: 'author' }],
      validation: (rule) => rule.required(),
    }),
```

- [ ] **Step 4: Expose Authors in the Studio structure**

In `studio/sanity.config.ts`, add an Authors entry to the structure list. Place it in the blog group, immediately after the Blog Posts item on line 28:

```ts
            S.documentTypeListItem('blogPost').title('Blog Posts'),
            S.documentTypeListItem('author').title('Authors'),
```

- [ ] **Step 5: Install studio dependencies**

`studio/` is **not** a yarn workspace of the root package — the root `package.json` has no
`workspaces` field, so `yarn install` at the root never installed studio's dependencies and
`studio/node_modules` does not exist. Install them once:

Use **npm**, not yarn. The root project uses yarn, but `studio/` is an npm project: `studio/package-lock.json` is tracked, and `make studio` / `make deploy-studio` invoke bare `npx sanity ...`. Running `yarn install` here creates a competing `studio/yarn.lock` alongside the tracked npm lockfile.

Run: `cd studio && npm install`
Expected: completes successfully. This is a one-time cost of roughly 1-2 minutes.

- [ ] **Step 6: Verify the studio schema lints and type-checks**

`studio/package.json` has no `lint` script, so invoke ESLint directly against studio's own config:

Run: `cd studio && npx eslint .`
Expected: exits 0 with no output.

Run: `cd studio && npx tsc --noEmit`
Expected: exits 0 with no output.

These two commands are the only gate on the studio schema before `make deploy-studio` runs during
rollout. A syntax or type error caught here is cheap; the same error caught at deploy time surfaces
after the code PR has already merged.

- [ ] **Step 7: Commit**

Do **not** run `make format` — the root ESLint config ignores `studio/**`, so it would be a no-op
here, and the studio's own style (no semicolons, single quotes) must be preserved.

```bash
git add studio/schemaTypes/author.ts studio/schemaTypes/index.ts studio/schemaTypes/blogPost.ts studio/sanity.config.ts
git commit -m "feat: add author document type and blogPost reference"
```

Note `studio/node_modules/` and `studio/yarn.lock` — confirm `git status` shows neither as
untracked-and-staged. If `studio/yarn.lock` is newly created and untracked, leave it out of this
commit and report it as a concern rather than deciding unilaterally.

---

### Task 2: Data layer — author types and queries

**Files:**
- Modify: `src/lib/sanity.ts` (add an Authors section before `// --- Blog ---` on line 222; extend `BlogPostSummary` and both blog queries)

**Interfaces:**
- Consumes: `SanitySlug`, `SanityImage`, `PortableText`, `PORTABLE_TEXT_PROJECTION`, `sanityClient` — all already defined at the top of `src/lib/sanity.ts`.
- Produces:
  - `AuthorSummary { _id: string; name: string; slug: SanitySlug; role?: string; photo?: SanityImage }`
  - `Author extends AuthorSummary { bio?: PortableText; sameAs?: string[] }`
  - `AUTHOR_BASE_PATH: string` (value `"/authors"`)
  - `authorHref( slug: SanitySlug ): string`
  - `getAuthors(): Promise<AuthorSummary[]>`
  - `getAuthor( slug: string ): Promise<Author | null>`
  - `getBlogPostsByAuthor( authorId: string ): Promise<BlogPostSummary[]>`
  - `BlogPostSummary` gains `author?: AuthorSummary`

- [ ] **Step 1: Add the Authors section**

In `src/lib/sanity.ts`, insert this block immediately **before** the `// --- Blog ---` comment on line 222:

```ts
// --- Authors ---

export interface AuthorSummary {
  _id: string;
  name: string;
  slug: SanitySlug;
  role?: string;
  photo?: SanityImage;
}

export interface Author extends AuthorSummary {
  bio?: PortableText;
  sameAs?: string[];
}

// Every surface that shows a byline needs the same compact author shape, so the
// projection is defined once and reused by all three blog-facing queries.
const AUTHOR_SUMMARY_PROJECTION = `{
  _id, name, slug, role,
  photo { asset->, alt, crop, hotspot }
}`;

// The author route is spelled once. jsonld.ts builds absolute URLs from the same
// constant, so the HTML href and the JSON-LD url can never drift apart.
export const AUTHOR_BASE_PATH = "/authors";

export function authorHref( slug: SanitySlug ): string {
  return `${AUTHOR_BASE_PATH}/${slug.current}`;
}

export async function getAuthors() {
  return sanityClient.fetch<AuthorSummary[]>(
    `*[_type == "author"] | order(name asc) ${AUTHOR_SUMMARY_PROJECTION}`,
  );
}

export async function getAuthor( slug: string ) {
  return sanityClient.fetch<Author | null>(
    `*[_type == "author" && slug.current == $slug][0] {
      _id, name, slug, role, sameAs,
      photo { asset->, alt, crop, hotspot },
      bio[] ${PORTABLE_TEXT_PROJECTION}
    }`,
    { slug },
  );
}
```

- [ ] **Step 2: Add author to the blog types and queries**

In the `// --- Blog ---` section, add the `author` field to `BlogPostSummary`:

```ts
export interface BlogPostSummary {
  _id: string;
  title: string;
  slug: SanitySlug;
  description?: string;
  publishedAt: string;
  tags?: string[];
  heroImage?: SanityImage;
  // Optional in TypeScript even though Sanity validation requires it: code
  // deploys before the content backfill, so posts can briefly have no author.
  author?: AuthorSummary;
}
```

Replace `getBlogPosts` and `getBlogPost` with:

```ts
export async function getBlogPosts() {
  return sanityClient.fetch<BlogPostSummary[]>(
    `*[_type == "blogPost"] | order(publishedAt desc) {
      _id, title, slug, description, publishedAt, tags,
      heroImage { asset->, alt, crop, hotspot },
      author-> ${AUTHOR_SUMMARY_PROJECTION}
    }`,
  );
}

export async function getBlogPost( slug: string ) {
  return sanityClient.fetch<BlogPost | null>(
    `*[_type == "blogPost" && slug.current == $slug][0] {
      _id, title, slug, description, publishedAt, tags,
      heroImage { asset->, alt, crop, hotspot },
      author-> ${AUTHOR_SUMMARY_PROJECTION},
      body[] ${PORTABLE_TEXT_PROJECTION}
    }`,
    { slug },
  );
}
```

Then add `getBlogPostsByAuthor` immediately after `getBlogPost`:

```ts
export async function getBlogPostsByAuthor( authorId: string ) {
  return sanityClient.fetch<BlogPostSummary[]>(
    `*[_type == "blogPost" && author._ref == $authorId] | order(publishedAt desc) {
      _id, title, slug, description, publishedAt, tags,
      heroImage { asset->, alt, crop, hotspot },
      author-> ${AUTHOR_SUMMARY_PROJECTION}
    }`,
    { authorId },
  );
}
```

- [ ] **Step 3: Verify types compile**

Run: `yarn astro check`
Expected: 0 errors. Warnings and hints that already existed on `main` are acceptable; no **new** error may appear.

- [ ] **Step 4: Verify the queries return real data**

The dataset is public, so this needs no token. Confirm the GROQ is valid and the author projection resolves — at this point the post has no author yet, so `author` must come back `null` rather than erroring:

Run:
```bash
curl -s 'https://nyd3p2n0.api.sanity.io/v2024-01-01/data/query/production?query=*%5B_type%20%3D%3D%20%22blogPost%22%5D%7Btitle%2C%20author%7D'
```
Expected: JSON with the one post and `"author": null`. A GROQ syntax error returns an `error` object instead — that is a failure.

- [ ] **Step 5: Commit**

```bash
make format
yarn astro check
git add src/lib/sanity.ts
git commit -m "feat: project author into blog queries and add author queries"
```

---

### Task 3: JSON-LD Person schema

**Files:**
- Modify: `src/lib/jsonld.ts:51-54` (`AuthorRef`), `:56-65` (`ArticleSchema`), `:79-83` (`StructuredData`), `:183-215` (`buildArticle`)
- Modify: `src/pages/blog/[...slug].astro:32` (the `buildArticle` call site)

**Interfaces:**
- Consumes: `Author`, `AuthorSummary`, `AUTHOR_BASE_PATH` from Task 2.
- Produces:
  - `OrganizationRef { "@type": "Organization"; name: string }` (renamed from `AuthorRef`)
  - `PersonRef { "@type": "Person"; name: string; url?: string; image?: string; jobTitle?: string; sameAs?: string[] }`
  - `ArticleAuthor = PersonRef | OrganizationRef`
  - `PersonSchema` (added to the `StructuredData` union)
  - `buildArticle( input: BuildArticleInput ): ArticleSchema` — **now takes one options object, not 4 positional args**
  - `buildPerson( input: BuildPersonInput ): PersonSchema`

- [ ] **Step 1: Replace AuthorRef with the Person/Organization union**

In `src/lib/jsonld.ts`, replace the `AuthorRef` interface (lines 51-54) with:

```ts
// Renamed from AuthorRef: this describes an organization, not the author role.
// Once `author` can be a Person, a type called AuthorRef that can only be an
// Organization is actively misleading.
export interface OrganizationRef {
  "@type": "Organization";
  name: string;
}

export interface PersonRef {
  "@type": "Person";
  name: string;
  url?: string;
  image?: string;
  jobTitle?: string;
  sameAs?: string[];
}

export type ArticleAuthor = PersonRef | OrganizationRef;
```

Update `ArticleSchema.author` to use the union:

```ts
export interface ArticleSchema extends SchemaBase {
  "@type": "Article";
  headline: string;
  url: string;
  datePublished: string;
  author: ArticleAuthor;
  publisher: PublisherRef;
  description?: string;
  image?: string;
}
```

Add the standalone Person schema after `ArticleSchema`:

```ts
export interface PersonSchema extends SchemaBase {
  "@type": "Person";
  name: string;
  url: string;
  image?: string;
  jobTitle?: string;
  sameAs?: string[];
  description?: string;
}
```

Add it to the union:

```ts
export type StructuredData =
  | OrganizationSchema
  | ProductSchema
  | ArticleSchema
  | PersonSchema
  | BreadcrumbListSchema;
```

- [ ] **Step 2: Update the imports**

The type import block at the top of `src/lib/jsonld.ts` must pull in `Author` and the route constant:

```ts
import {
  AUTHOR_BASE_PATH,
  type Author,
  type BlogPost,
  type PortableText,
  type PortableTextBlock,
  type SiteSettings,
  type Strain,
} from "./sanity";
```

Note this changes the statement from a pure `import type` to a value import, because `AUTHOR_BASE_PATH` is a runtime constant.

- [ ] **Step 3: Convert buildArticle to an options object and emit the Person**

Replace `buildArticle` (lines 183-215) with:

```ts
export interface BuildArticleInput {
  post: BlogPost;
  siteUrl: string;
  settings: SiteSettings | null;
  heroImageUrl?: string;
  authorImageUrl?: string;
}

// Posts written before the author field existed fall back to the site itself, so
// the Article never ships without an author while content is being backfilled.
function buildArticleAuthor(
  post: BlogPost,
  baseUrl: string,
  publisherName: string,
  authorImageUrl?: string,
): ArticleAuthor {
  const author = post.author;
  if( !author ) return { "@type": "Organization", name: publisherName };

  const person: PersonRef = {
    "@type": "Person",
    name: author.name,
    url: `${baseUrl}${AUTHOR_BASE_PATH}/${author.slug.current}/`,
  };

  if( author.role ) person.jobTitle = author.role;
  if( authorImageUrl ) person.image = authorImageUrl;

  return person;
}

export function buildArticle( input: BuildArticleInput ): ArticleSchema {
  const { post, siteUrl, settings, heroImageUrl, authorImageUrl } = input;

  const baseUrl = normalizeSiteUrl( siteUrl );
  const url = `${baseUrl}/blog/${post.slug.current}/`;
  const publisherName = settings?.siteTitle ?? "Northwest Local Cannabis";

  const publisher: PublisherRef = {
    "@type": "Organization",
    name: publisherName,
  };
  if( settings?.logo?.asset?.url ) {
    publisher.logo = { "@type": "ImageObject", url: settings.logo.asset.url };
  }

  const article: ArticleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    url,
    datePublished: post.publishedAt,
    author: buildArticleAuthor( post, baseUrl, publisherName, authorImageUrl ),
    publisher,
  };

  if( heroImageUrl ) article.image = heroImageUrl;
  if( post.description ) article.description = post.description;

  return article;
}

export interface BuildPersonInput {
  author: Author;
  siteUrl: string;
  photoUrl?: string;
}

export function buildPerson( input: BuildPersonInput ): PersonSchema {
  const { author, siteUrl, photoUrl } = input;
  const baseUrl = normalizeSiteUrl( siteUrl );

  const person: PersonSchema = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: author.name,
    url: `${baseUrl}${AUTHOR_BASE_PATH}/${author.slug.current}/`,
  };

  if( photoUrl ) person.image = photoUrl;
  if( author.role ) person.jobTitle = author.role;
  if( author.sameAs && author.sameAs.length > 0 ) person.sameAs = author.sameAs;

  const description = portableTextToPlainText( author.bio );
  if( description ) person.description = description;

  return person;
}
```

- [ ] **Step 4: Update the buildArticle call site**

In `src/pages/blog/[...slug].astro`, replace the positional call on line 32:

```astro
  buildArticle( post, siteUrl, ogImage, settings ),
```

with the options-object form:

```astro
  buildArticle({ post, siteUrl, settings, heroImageUrl: ogImage, authorImageUrl } ),
```

`authorImageUrl` does not exist yet, so define it in the same file. Add this immediately after the existing `ogImage` line (line 26). `urlFor` is already imported there on line 5:

```astro
const authorImageUrl = post.author?.photo?.asset
  ? urlFor( post.author.photo ).width( 400 ).height( 400 ).fit( "crop" ).format( "jpg" ).url()
  : undefined;
```

- [ ] **Step 5: Verify types compile**

Run: `yarn astro check`
Expected: 0 errors. If an error names `buildArticle`, the call site was not converted to the object form.

- [ ] **Step 6: Verify the emitted JSON-LD**

Run: `make build`
Expected: build succeeds.

Then read the real emitted markup — with no author on the post yet, the fallback must still emit an Organization author:

Run: `grep -o '"author":{[^}]*}' dist/blog/why-cannabis-turns-purple/index.html`
Expected: `"author":{"@type":"Organization","name":"Northwest Local Cannabis"}` (or the configured site title). An empty result or a `"Person"` with no name is a failure.

- [ ] **Step 7: Commit**

```bash
make format
yarn astro check
git add src/lib/jsonld.ts src/pages/blog/[...slug].astro
git commit -m "feat: emit Person author in Article JSON-LD"
```

---

### Task 4: Byline component and card bylines

**Files:**
- Create: `src/components/AuthorByline.astro`
- Modify: `src/pages/blog/[...slug].astro:43-56` (header block)
- Modify: `src/components/BlogPostCard.astro:8`, `:25-27`
- Modify: `src/components/FeaturedPost.astro:8`, `:26`

**Interfaces:**
- Consumes: `AuthorSummary`, `authorHref` from Task 2; `urlFor` from `src/lib/image.ts`.
- Produces: `AuthorByline.astro` with `Props { author: AuthorSummary }`.

> **Cards must not link the byline.** `BlogPostCard.astro:12` and `FeaturedPost.astro:13` wrap their entire contents in `<a class="card">`. Nested `<a>` elements are invalid HTML and browsers break the outer link. Only the post header and the author page may link an author.

- [ ] **Step 1: Create the byline component**

Create `src/components/AuthorByline.astro`:

```astro
---
import { authorHref, type AuthorSummary } from "../lib/sanity";
import { urlFor } from "../lib/image";

interface Props {
  author: AuthorSummary;
}

const { author } = Astro.props;

const avatarUrl = author.photo?.asset
  ? urlFor( author.photo ).width( 96 ).height( 96 ).fit( "crop" ).format( "webp" ).url()
  : undefined;
---

<a class="author-byline" href={authorHref( author.slug )}>
  {avatarUrl && (
    <img
      class="author-byline-avatar"
      src={avatarUrl}
      alt={author.photo?.alt ?? author.name}
      width="48"
      height="48"
      loading="lazy"
    />
  )}
  <span class="author-byline-text">
    <span class="author-byline-name">{author.name}</span>
    {author.role && <span class="author-byline-role">{author.role}</span>}
  </span>
</a>

<style>
  .author-byline {
    display: inline-flex;
    align-items: center;
    gap: 0.75rem;
    text-decoration: none;
    color: inherit;
  }

  .author-byline-avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }

  .author-byline-text {
    display: flex;
    flex-direction: column;
    line-height: 1.3;
  }

  .author-byline-name {
    font-weight: 600;
    color: var(--text-primary);
  }

  .author-byline:hover .author-byline-name {
    color: var(--accent);
  }

  .author-byline-role {
    font-size: 0.8rem;
    color: var(--text-secondary);
  }
</style>
```

The three custom properties used above are already defined in `src/styles/global.css`:
`--accent: #00ff88` (line 4), `--text-primary: #ffffff` (line 6), `--text-secondary: #888888`
(line 7). Note the accent is used only for the hover state on the name — never as a surface.

- [ ] **Step 2: Render the byline in the post header**

In `src/pages/blog/[...slug].astro`, import the component alongside the existing imports:

```astro
import AuthorByline from "../../components/AuthorByline.astro";
```

Then in the `<header>` block, add the byline after the `hero-accent` div and before the tags block:

```astro
      <h1>{post.title}</h1>
      <div class="hero-accent"></div>
      {post.author && (
        <div style="margin-top:1rem;">
          <AuthorByline author={post.author} />
        </div>
      )}
```

- [ ] **Step 3: Add the plain-text byline to BlogPostCard**

In `src/components/BlogPostCard.astro`, destructure `author` on line 8:

```astro
const { title, slug, description, publishedAt, heroImage, author } = Astro.props;
```

Replace the date paragraph with a date-and-author line:

```astro
    <p style="font-size:0.75rem;color:var(--accent);text-transform:uppercase;letter-spacing:1px;margin-bottom:0.5rem;">
      {formattedDate}{author && ` · ${author.name}`}
    </p>
```

- [ ] **Step 4: Add the plain-text byline to FeaturedPost**

In `src/components/FeaturedPost.astro`, destructure `author` on line 8:

```astro
const { title, slug, description, publishedAt, heroImage, author } = Astro.props;
```

Replace the date paragraph:

```astro
    <p class="featured-post-date">{formattedDate}{author && ` · ${author.name}`}</p>
```

- [ ] **Step 5: Verify build and absence of nested anchors**

Run: `yarn astro check`
Expected: 0 errors.

Run: `make build`
Expected: build succeeds.

Confirm no card contains a nested anchor:

Run: `grep -c 'class="card"' dist/blog/index.html`
Expected: a count matching the number of posts (currently 1).

Run: `grep -o '<a[^>]*class="card"[^>]*>.\{0,400\}' dist/blog/index.html | grep -c '<a '`
Expected: `0` — no `<a` appears inside a card's opening region. Any non-zero result means a byline was linked inside a card and must be reverted to plain text.

- [ ] **Step 6: Commit**

```bash
make format
yarn astro check
git add src/components/AuthorByline.astro src/pages/blog/[...slug].astro src/components/BlogPostCard.astro src/components/FeaturedPost.astro
git commit -m "feat: render author byline on post header and cards"
```

---

### Task 5: Author page

**Files:**
- Create: `src/pages/authors/[...slug].astro`

**Interfaces:**
- Consumes: `getAuthors`, `getAuthor`, `getBlogPostsByAuthor` from Task 2; `buildPerson`, `buildBreadcrumbList`, `normalizeSiteUrl`, `StructuredData` from Task 3; `BlogPostCard`, `Hero`, `SectionHeading`, `PortableText` components.
- Produces: static pages at `/authors/<slug>/`.

> There is deliberately **no `/authors/index.astro`**. With one author it would be a thin near-duplicate of the author page, and thin index pages are an SEO liability. A bare `/authors/` returning 404 is correct. Revisit at 3+ authors.

- [ ] **Step 1: Create the author page**

Create `src/pages/authors/[...slug].astro`:

```astro
---
import Layout from "../../layouts/Layout.astro";
import Hero from "../../components/Hero.astro";
import PortableText from "../../components/PortableText.astro";
import BlogPostCard from "../../components/BlogPostCard.astro";
import SectionHeading from "../../components/SectionHeading.astro";
import { getAuthors, getAuthor, getBlogPostsByAuthor, AUTHOR_BASE_PATH } from "../../lib/sanity";
import { urlFor } from "../../lib/image";
import {
  buildPerson,
  buildBreadcrumbList,
  normalizeSiteUrl,
  type StructuredData,
} from "../../lib/jsonld";

export async function getStaticPaths() {
  const authors = await getAuthors() ?? [];
  return authors.map( ( author: { slug: { current: string } }) => ({
    params: { slug: author.slug.current },
  }) );
}

const { slug } = Astro.params;
const author = await getAuthor( slug! );
if( !author ) return Astro.redirect( "/blog" );

const posts = await getBlogPostsByAuthor( author._id ) ?? [];

const photoUrl = author.photo?.asset
  ? urlFor( author.photo ).width( 640 ).height( 640 ).fit( "crop" ).format( "webp" ).url()
  : undefined;
const ogImage = author.photo?.asset
  ? urlFor( author.photo ).width( 1200 ).height( 630 ).fit( "crop" ).format( "jpg" ).url()
  : undefined;

const siteUrl = Astro.site?.toString() ?? "https://www.nw-local.com";
const baseUrl = normalizeSiteUrl( siteUrl );
const structuredData: StructuredData[] = [
  buildPerson({ author, siteUrl, photoUrl: ogImage } ),
  buildBreadcrumbList( [
    { name: "Home", url: `${baseUrl}/` },
    { name: "Blog", url: `${baseUrl}/blog/` },
    { name: author.name, url: `${baseUrl}${AUTHOR_BASE_PATH}/${author.slug.current}/` },
  ] ),
];

const description = author.role
  ? `${author.name}, ${author.role} at Northwest Local Cannabis.`
  : `Posts by ${author.name}.`;
---

<Layout title={author.name} description={description} ogImage={ogImage} structuredData={structuredData}>
  <Hero title={author.name}>
    {author.role && (
      <p style="color:var(--text-secondary);margin-top:0.5rem;font-size:1.1rem;">{author.role}</p>
    )}
  </Hero>

  <div class="detail-grid">
    <div>
      {photoUrl && (
        <img
          src={photoUrl}
          alt={author.photo?.alt ?? author.name}
          width="640"
          height="640"
          style="border-radius:8px;width:100%;object-fit:cover;"
        />
      )}
    </div>
    <div>
      {author.bio && <PortableText value={author.bio} />}
    </div>
  </div>

  {posts.length > 0 && (
    <section class="fade-in">
      <SectionHeading title={`Posts by ${author.name}`} />
      <div class="card-grid">
        {posts.map( post => (
          <BlogPostCard {...post} />
        ) )}
      </div>
    </section>
  )}
</Layout>
```

- [ ] **Step 2: Verify types compile**

Run: `yarn astro check`
Expected: 0 errors.

- [ ] **Step 3: Verify the build handles zero authors**

No author document exists yet, so `getStaticPaths()` returns an empty array and no author pages are emitted. This must not fail the build.

Run: `make build`
Expected: build succeeds.

Run: `ls dist/authors 2>&1`
Expected: `No such file or directory` — correct at this stage. After the backfill, this directory will contain the author page.

- [ ] **Step 4: Commit**

```bash
make format
yarn astro check
git add src/pages/authors/[...slug].astro
git commit -m "feat: add author page with bio and post list"
```

---

### Task 6: RSS dc:creator

**Files:**
- Modify: `src/pages/rss.xml.ts`

**Interfaces:**
- Consumes: `BlogPostSummary.author` from Task 2.
- Produces: an RSS feed whose items carry `<dc:creator>`.

> **Do not use the per-item `author` field.** `@astrojs/rss` types it as *"The item author's email address"* (`node_modules/@astrojs/rss/dist/index.d.ts:42`), matching RSS 2.0 where `<author>` must be an email. A plain name there is spec-invalid. `customData` is injected raw and unescaped, so the name must be XML-escaped.

- [ ] **Step 1: Rewrite the feed**

Replace the contents of `src/pages/rss.xml.ts`:

```ts
import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { getBlogPosts, getSiteSettings } from "../lib/sanity";

// @astrojs/rss injects customData verbatim, so anything interpolated into it has
// to be escaped here. An unescaped "&" in a name produces a malformed feed that
// strict readers reject outright.
const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&apos;",
};

function escapeXml( value: string ): string {
  return value.replace( /[&<>"']/g, character => XML_ESCAPES[ character ] );
}

export async function GET( context: APIContext ) {
  const settings = await getSiteSettings();
  const posts = await getBlogPosts() ?? [];

  return rss({
    title: settings?.siteTitle ?? "Northwest Local Cannabis",
    description: settings?.siteDescription ?? "Washington State licensed cannabis producer and processor.",
    site: context.site!.toString(),
    xmlns: { dc: "http://purl.org/dc/elements/1.1/" },
    items: posts.map( post => ({
      title: post.title,
      pubDate: new Date( post.publishedAt ),
      description: post.description ?? "",
      link: `/blog/${post.slug.current}/`,
      customData: post.author
        ? `<dc:creator>${escapeXml( post.author.name )}</dc:creator>`
        : undefined,
    }) ),
  });
}
```

- [ ] **Step 2: Verify types compile**

Run: `yarn astro check`
Expected: 0 errors.

`XML_ESCAPES[ character ]` types as `string`, not `string | undefined` — `noUncheckedIndexedAccess`
is set only by `astro/tsconfigs/strictest`, and this project extends `astro/tsconfigs/strict`. No
`?? character` fallback is needed.

- [ ] **Step 3: Verify the emitted feed**

Run: `make build`
Expected: build succeeds.

Run: `grep -o 'xmlns:dc="[^"]*"' dist/rss.xml`
Expected: `xmlns:dc="http://purl.org/dc/elements/1.1/"`. An empty result means the namespace was not declared, and any `dc:creator` element would make the feed invalid.

Run: `grep -c 'dc:creator' dist/rss.xml`
Expected: `0` at this stage — no post has an author yet. After the backfill this becomes `1`.

- [ ] **Step 4: Commit**

```bash
make format
yarn astro check
git add src/pages/rss.xml.ts
git commit -m "feat: emit dc:creator for post authors in RSS feed"
```

---

### Task 7: Scope the portrait warning and update docs

**Files:**
- Modify: `scripts/upload-image.sh:33-38`
- Modify: `CLAUDE.md` (Sanity Content Model table)

**Interfaces:**
- Consumes: nothing.
- Produces: `upload-image.sh` accepts a 4th positional argument suppressing the hero-specific portrait warning.

> The existing warning says portrait images "will be cropped on the strain page" — it assumes every upload is a strain hero. Author portraits make portrait a legitimate shape, so an unconditional warning is a false positive that trains the operator to ignore warnings.

- [ ] **Step 1: Scope the warning**

In `scripts/upload-image.sh`, add a fourth argument below the existing three (after the `DESCRIPTION` line):

```bash
# Hero images are cropped to landscape on strain pages, so a portrait upload is
# usually a mistake there. Author portraits are legitimately portrait, so the
# warning is opt-out rather than unconditional.
PORTRAIT_OK="${4:-}"
```

Then change the warning condition from:

```bash
  if (( IMG_HEIGHT > IMG_WIDTH )); then
```

to:

```bash
  if (( IMG_HEIGHT > IMG_WIDTH )) && [[ -z "$PORTRAIT_OK" ]]; then
```

- [ ] **Step 2: Pass the argument through the Makefile**

In `Makefile`, update the `upload-image` target to forward a `PORTRAIT_OK` variable:

```make
upload-image: ## Upload an image asset to Sanity (vars: FILE, LABEL, DESCRIPTION, PORTRAIT_OK)
	@./scripts/upload-image.sh "$(FILE)" "$(LABEL)" "$(DESCRIPTION)" "$(PORTRAIT_OK)"
```

- [ ] **Step 3: Verify the script still parses and the flag works**

Run: `bash -n scripts/upload-image.sh`
Expected: no output, exit 0.

Verify the warning still fires without the flag (this fails at the token check, which is after the warning — that is fine, the warning is what is being tested):

Run: `bash scripts/upload-image.sh "/Users/benny/Library/CloudStorage/Dropbox/Northwest Local Cannabis/www/Blog/Authors/_processed/ben-petty.jpg" 2>&1 | head -4`
Expected: output includes `⚠  Warning: Image is portrait orientation`.

Verify the flag suppresses it:

Run: `bash scripts/upload-image.sh "/Users/benny/Library/CloudStorage/Dropbox/Northwest Local Cannabis/www/Blog/Authors/_processed/ben-petty.jpg" "" "" 1 2>&1 | head -4`
Expected: output includes the dimensions line but **no** `⚠  Warning` line.

- [ ] **Step 4: Document the new document type**

In `CLAUDE.md`, add a row to the Sanity Content Model table, immediately above the `blogPost` row:

```markdown
| `author` | Post authors with role, bio, photo, and profile links |
```

And update the `blogPost` row to mention the reference:

```markdown
| `blogPost` | Blog posts with rich text body, tags, hero image, author reference |
```

- [ ] **Step 5: Record the studio/root toolchain split as an Invariant**

`CLAUDE.md`'s "Whitespace inside parens" convention is stated globally, but it is false for `studio/`.
This cost real time during this feature's pre-flight and will bite anyone editing studio files.

Add to the **Invariants** section of `CLAUDE.md`:

```markdown
- **`studio/` is a separate project from the root, with its own style and its own package manager.** The root ESLint config explicitly ignores `studio/**` (`eslint.config.mjs`), so `make format` and `yarn lint` never touch it and the root's spaced-paren/double-quote/semicolon style does **not** apply there. Studio files follow the Prettier config in `studio/package.json` — no semicolons, single quotes, `bracketSpacing: false`, tight parens (`(rule) => rule.required()`). Studio is also an **npm** project (`studio/package-lock.json` is tracked) while the root uses yarn, and it is not a yarn workspace of the root — `yarn install` at the root never installs `studio/node_modules`. Install studio deps with `cd studio && npm install`; running `yarn install` there creates a competing `studio/yarn.lock`. Lint/type-check studio with `cd studio && npx eslint .` and `npx tsc --noEmit`, since `studio/package.json` defines no `lint` script.
```

Renumber the commit step below accordingly.

- [ ] **Step 6: Commit**

```bash
make format
git add scripts/upload-image.sh Makefile CLAUDE.md
git commit -m "chore: scope portrait warning to hero uploads and document author type"
```

---

### Task 8: Open the pull request

**Files:** none.

- [ ] **Step 1: Run the full local check**

Run: `make format`
Run: `yarn lint`
Run: `yarn astro check`
Run: `make build`
Expected: all four succeed. Do not proceed on any failure.

- [ ] **Step 2: Push the branch**

```bash
git push -u origin worktree-blog-post-author
```

- [ ] **Step 3: Create the PR**

Run `gh pr create` as a separate command from the push. Body must reference issue #30 and state that content backfill follows the merge.

```bash
gh pr create --title "Add author attribution to blog posts" --body "$(cat <<'EOF'
Closes #30.

Adds an `author` document type referenced from `blogPost`, surfaced as a byline,
an author page, `Person` JSON-LD, and `dc:creator` in the RSS feed.

## Changes

- **Schema**: new `author` type (name, slug, role, photo, bio, `sameAs`); `blogPost.author` is a required reference. Added to the Studio structure list — without that, a registered type stays invisible in the sidebar.
- **Data layer**: `AuthorSummary` / `Author` types, `getAuthors`, `getAuthor`, `getBlogPostsByAuthor`, and an `authorHref` helper. `author` is optional in TypeScript but required in Sanity validation, because code deploys before the content backfill.
- **Templates**: `AuthorByline` component in the post header; plain-text `date · name` on `BlogPostCard` and `FeaturedPost`. Card bylines are deliberately unlinked — both card components already wrap their contents in an anchor, and nested anchors are invalid HTML.
- **SEO**: `buildArticle` emits a `Person` author with a resolvable `url`, falling back to the previous Organization output for posts with no author yet. New `buildPerson` backs the author page. `buildArticle` now takes an options object rather than 5 positional args.
- **RSS**: `dc:creator` with an `xmlns:dc` declaration, not the per-item `author` field — that one is an email slot per RSS 2.0.
- **Tooling**: `upload-image.sh`'s portrait warning is now opt-out; it assumed every upload was a strain hero, which author portraits make false.

## Follow-up after merge

Content backfill per the rollout in the design doc: deploy the Studio, create the
author document, then attach it to the existing post.

Separately noted, not fixed here: `glossaryTerm` and `terpene` are registered in
`schemaTypes` but absent from the Studio structure list, so 8 glossary terms and 7
terpenes are not browsable in the Studio.
EOF
)"
```

---

## Rollout (after merge — not part of the PR)

Publish/rebuild ordering applies: a Sanity publish rebuilds against `main`, so the code must merge first.

- [ ] **Step 1: Confirm the deploy of `main` succeeded**

Run: `gh run list --branch main --limit 3`
Expected: the most recent deploy run is `completed / success`.

- [ ] **Step 2: Deploy the Studio**

Run: `make deploy-studio`
Expected: succeeds and prints the studio URL. Confirm "Authors" now appears in the sidebar at https://nw-local.sanity.studio/

- [ ] **Step 3: Upload the author photo**

The prepared file is at `Dropbox/Northwest Local Cannabis/www/Blog/Authors/_processed/ben-petty.jpg` (2316×3088, EXIF orientation baked into pixels).

```bash
make upload-image \
  FILE="/Users/benny/Library/CloudStorage/Dropbox/Northwest Local Cannabis/www/Blog/Authors/_processed/ben-petty.jpg" \
  LABEL="Ben Petty" \
  DESCRIPTION="Ben Petty, co-founder of Northwest Local Cannabis, wearing a black Real Ones Only cap, seated in a car in Seattle." \
  PORTRAIT_OK=1
```

Record the returned asset `_id` — step 4 needs it.

- [ ] **Step 4: Create the author document**

Create an `author` document with:
- `name`: `Ben Petty`
- `slug.current`: `ben-petty`
- `role`: `Co-Founder`
- `photo`: the asset from step 3, `alt` set to the DESCRIPTION text above, `hotspot` approximately `{ x: 0.46, y: 0.50, width: 0.81, height: 0.61 }`
- `bio`: a single blockContent paragraph:

> Ben Petty is a co-founder of Northwest Local Cannabis. He has been in the game for over twenty years — on and off, growing and in distribution — working through Washington's medical and legacy markets long before the licensed system existed. Two decades of learning the plant by hand rather than from a manual.

- `sameAs`, in this order:

```json
[
  "https://ben-petty.com",
  "https://audeos.com",
  "https://www.linkedin.com/in/benjaminpetty",
  "https://www.instagram.com/audeos",
  "https://www.tiktok.com/@audeos1",
  "https://twitter.com/audeos"
]
```

URL conventions match `siteSettings.socialLinks`, which uses `https://twitter.com/...`
(not `x.com`) and `https://www.instagram.com/...`.

These are the **personal** accounts and belong on the `Person`, not the `Organization`.
`siteSettings.socialLinks` already carries the brand's own accounts
(`instagram.com/northwest_local`, `twitter.com/nw_local`), which `buildOrganization` emits as the
Organization's `sameAs`. Keeping the two sets separate is the point of `sameAs` — each entity links
only to profiles that represent that same entity.

Then publish it.

- [ ] **Step 5: Attach the author to the existing post**

Patch `why-cannabis-turns-purple` to set `author` to a reference to the new author document, then publish.

- [ ] **Step 6: Verify the rebuild fired**

Issue #29 is open — the webhook still points at the pre-rename repo path, so a publish may not trigger a deploy.

Run: `gh run list --branch main --limit 3`
Expected: a new run started within ~2 minutes of the publish. If none appears, dispatch manually:

```bash
gh workflow run deploy.yml --ref main
```

- [ ] **Step 7: Verify the live site**

Run: `curl -s https://www.nw-local.com/blog/why-cannabis-turns-purple/ | grep -o '"author":{[^}]*}'`
Expected: a `Person` with `name` `Ben Petty` and a `url` ending `/authors/ben-petty/`.

Run: `curl -s https://www.nw-local.com/rss.xml | grep -c 'dc:creator'`
Expected: `1`.

Run: `curl -s -o /dev/null -w '%{http_code}' https://www.nw-local.com/authors/ben-petty/`
Expected: `200`.

Then ask the user to confirm in their running dev server (or on the live site) that the byline avatar renders as a circle, the card byline reads `date · Ben Petty`, and the author page layout looks right. Do not boot a dev server.
