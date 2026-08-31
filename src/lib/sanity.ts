import { createClient } from "@sanity/client";
import type { GlossaryCategory } from "../../shared/glossary-categories";
import { validateGlossarySummaries, validateGlossaryTerm } from "./glossary";

const SANITY_PROJECT_ID = import.meta.env.SANITY_PROJECT_ID;
const SANITY_DATASET = import.meta.env.SANITY_DATASET;
const SANITY_API_TOKEN = import.meta.env.SANITY_API_TOKEN;

if( !SANITY_PROJECT_ID ) throw new Error( "Missing SANITY_PROJECT_ID env var" );
if( !SANITY_DATASET ) throw new Error( "Missing SANITY_DATASET env var" );
if( !SANITY_API_TOKEN ) throw new Error( "Missing SANITY_API_TOKEN env var" );

export const sanityClient = createClient({
  projectId: SANITY_PROJECT_ID,
  dataset: SANITY_DATASET,
  apiVersion: "2026-04-14",
  useCdn: false,
  token: SANITY_API_TOKEN,
});

// Portable Text bodies must dereference their markDefs. A glossaryRef stores a
// reference, so left unresolved the renderer receives an id and has nothing to
// display. blockContent is shared by six document types, so this fragment is the
// single place that projection is defined — coalesce() normalises glossaryTerm
// (term/shortDefinition) and terpene (name/tagline) into one shape.
const PORTABLE_TEXT_PROJECTION = `{
  ...,
  markDefs[] {
    ...,
    _type == "glossaryRef" => {
      ...,
      term-> {
        _type,
        "slug": slug.current,
        "label": coalesce(term, name),
        "summary": coalesce(shortDefinition, tagline)
      }
    }
  },
  _type == "image" => { asset->, alt, caption }
}`;

// Shared for the same reason PORTABLE_TEXT_PROJECTION is: getProducts() and the
// drop detail page ask for the identical product shape off different array
// sources, so the braced body is the mechanic and the source expression is the
// orchestration. Copies of exactly this string are what shipped center-cropped
// jar labels in #75, where one of three spellings had lost `crop, hotspot`.
const PRODUCT_SUMMARY_PROJECTION = `{
  _id, name, slug, category, weight, available,
  image { asset->, alt, crop, hotspot },
  "strain": strain->{ _id, name, slug, strainType, heroImage { asset->, alt, crop, hotspot } }
}`;

// logo omits `crop, hotspot` on purpose: a retailer logo renders unconstrained,
// so there is no crop for a hotspot to reframe. Every other image projection in
// this file constrains both dimensions and therefore needs them.
const RETAILER_PROJECTION = `{
  _id, name, slug, address, city, state, zip,
  lat, lng, website, phone, email,
  logo { asset->, alt },
  featured,
  productsAvailable[]->{ _id, name, slug, category }
}`;

// Keep long glossary bodies out of index data. hasBody gives the featured-term
// contract the one fact it needs without serializing every article at once.
const GLOSSARY_SUMMARY_PROJECTION = `
  _id, term, slug, shortDefinition, aliases, category, featured, lastReviewedAt,
  image { asset->, alt, crop, hotspot },
  "hasBody": defined(body[0])
`;

// --- Shared types ---

export interface SanitySlug {
  current: string;
}

export interface SanityImage {
  asset: {
    _id?: string;
    _ref?: string;
    url?: string;
    metadata?: { dimensions?: { width?: number; height?: number } };
  };
  alt?: string;
  caption?: string;
  crop?: unknown;
  hotspot?: unknown;
}

export type StrainType = "indica" | "sativa" | "hybrid";

export interface PortableTextBlock {
  _type: string;
  _key?: string;
  [key: string]: unknown;
}

export type PortableText = PortableTextBlock[];

// --- Strains ---

export interface StrainSummary {
  _id: string;
  _createdAt: string;
  name: string;
  slug: SanitySlug;
  strainType: StrainType;
  effects?: string[];
  terpenes?: string[];
  thcRange?: string;
  cbdRange?: string;
  nextHarvestDate?: string;
  heroImage?: SanityImage;
  featured?: boolean;
  available?: boolean;
}

export interface Strain extends StrainSummary {
  description?: PortableText;
  gallery?: SanityImage[];
}

export async function getStrains() {
  return sanityClient.fetch<StrainSummary[]>(
    `*[_type == "strain"] | order(_createdAt desc) {
      _id, _createdAt, name, slug, strainType, effects, terpenes,
      thcRange, cbdRange, nextHarvestDate,
      heroImage { asset->, alt, crop, hotspot },
      featured, available
    }`,
  );
}

export async function getStrain( slug: string ) {
  return sanityClient.fetch<Strain | null>(
    `*[_type == "strain" && slug.current == $slug][0] {
      _id, _createdAt, name, slug, strainType,
      description[] ${PORTABLE_TEXT_PROJECTION},
      effects, terpenes, thcRange, cbdRange, nextHarvestDate,
      heroImage { asset->, alt, crop, hotspot },
      gallery[] { asset->, alt, crop, hotspot },
      featured, available
    }`,
    { slug },
  );
}

// --- Terpenes ---

export interface TerpeneSummary {
  _id: string;
  name: string;
  slug: SanitySlug;
  tagline?: string;
  aroma?: string[];
  effects?: string[];
  foundIn?: string[];
  heroImage?: SanityImage;
}

export interface TerpeneStrainRef {
  _id: string;
  _createdAt: string;
  name: string;
  slug: SanitySlug;
  strainType: StrainType;
  heroImage?: SanityImage;
}

export interface Terpene extends TerpeneSummary {
  description?: PortableText;
  strains?: TerpeneStrainRef[];
}

export async function getTerpenes() {
  return sanityClient.fetch<TerpeneSummary[]>(
    `*[_type == "terpene"] | order(sortOrder asc, name asc) {
      _id, name, slug, tagline, aroma, effects, foundIn,
      heroImage { asset->, alt, crop, hotspot }
    }`,
  );
}

export async function getTerpene( slug: string ) {
  return sanityClient.fetch<Terpene | null>(
    `*[_type == "terpene" && slug.current == $slug][0] {
      _id, name, slug, tagline, aroma, effects, foundIn,
      description[] ${PORTABLE_TEXT_PROJECTION},
      heroImage { asset->, alt, crop, hotspot },
      "strains": *[_type == "strain" && ^.name in terpenes] | order(name asc) {
        _id, _createdAt, name, slug, strainType,
        heroImage { asset->, alt, crop, hotspot }
      }
    }`,
    { slug },
  );
}

// --- Products ---

export interface ProductStrainRef {
  _id: string;
  name: string;
  slug: SanitySlug;
  strainType: StrainType;
  heroImage?: SanityImage;
}

export interface ProductSummary {
  _id: string;
  name: string;
  slug: SanitySlug;
  category: string;
  weight?: string;
  available?: boolean;
  image?: SanityImage;
  strain?: ProductStrainRef;
}

export interface ProductWithDescription {
  _id: string;
  name: string;
  slug: SanitySlug;
  category: string;
  weight?: string;
  available?: boolean;
  image?: SanityImage;
  description?: PortableText;
}

export async function getProducts() {
  return sanityClient.fetch<ProductSummary[]>(
    `*[_type == "product"] | order(sortOrder asc, name asc) ${PRODUCT_SUMMARY_PROJECTION}`,
  );
}

export async function getProductsByStrain( strainId: string ) {
  return sanityClient.fetch<ProductWithDescription[]>(
    `*[_type == "product" && strain._ref == $strainId] | order(sortOrder asc) {
      _id, name, slug, category, weight, available,
      image { asset->, alt, crop, hotspot },
      description[] ${PORTABLE_TEXT_PROJECTION}
    }`,
    { strainId },
  );
}

// --- Drops ---

export type DropStatus = "upcoming" | "available" | "soldOut";
export type DropPortal = "bamboo" | "cultivera";

export interface DropSummary {
  _id: string;
  name: string;
  slug: SanitySlug;
  description: string;
  status: DropStatus;
  dropDate: string;
  heroImage?: SanityImage;
  // Carried on the summary so one fetch serves both the index cards and the
  // lookup maps in drops.ts. Two separate queries could disagree; one cannot.
  // productIds keeps every raw _ref, including one whose target no longer
  // resolves, because getDrops() uses its length to fail loudly on an empty
  // drop. liveProductCount is the number a visitor can actually see, and is
  // what any rendered count must use: unpublishing one SKU leaves the _ref
  // intact, so the two legitimately disagree.
  productIds: string[];
  liveProductCount: number;
  // A product written through the API can have no strain at all, and
  // strain._ref then projects to null in place. Typed to admit that rather
  // than making the guard in buildDropLookup() look like dead code.
  strainIds: ( string | null )[];
}

export interface Drop extends DropSummary {
  lotIdentifier?: string;
  lotPortal?: DropPortal;
  harvestedAt?: string;
  body?: PortableText;
  products: ProductSummary[];
  retailers?: Retailer[];
}

const DROP_SUMMARY_PROJECTION = `{
  _id, name, slug, description, status, dropDate,
  heroImage { asset->, alt, crop, hotspot },
  "productIds": coalesce(products[]._ref, []),
  "liveProductCount": count(products[defined(@->)]),
  "strainIds": coalesce(products[defined(@->)]->strain._ref, [])
}`;

// A drop with no products is a batch with nothing in it. Studio's
// rule.required() stops a human clicking Publish and does nothing about API
// writes, which is how blogPost.author nearly shipped without a byline in #34.
// Failing the deploy is the intended outcome: the alternative is a page that
// renders an empty batch and looks fine.
function assertDropHasProducts( name: string, id: string, count: number ) {
  if( count > 0 ) return;
  throw new Error(
    `Drop "${name}" (${id}) has no products. Add at least one product to it in Sanity, or unpublish the drop.`,
  );
}

export async function getDrops() {
  const drops = await sanityClient.fetch<DropSummary[]>(
    `*[_type == "drop"] | order(dropDate desc) ${DROP_SUMMARY_PROJECTION}`,
  );
  for( const drop of drops ) {
    assertDropHasProducts( drop.name, drop._id, drop.productIds.length );
  }
  return drops;
}

export async function getDrop( slug: string ) {
  const drop = await sanityClient.fetch<Drop | null>(
    `*[_type == "drop" && slug.current == $slug][0] {
      _id, name, slug, description, status, dropDate,
      heroImage { asset->, alt, crop, hotspot },
      lotIdentifier, lotPortal, harvestedAt,
      "productIds": coalesce(products[]._ref, []),
      "liveProductCount": count(products[defined(@->)]),
      "strainIds": coalesce(products[defined(@->)]->strain._ref, []),
      body[] ${PORTABLE_TEXT_PROJECTION},
      "products": products[defined(@->)]-> ${PRODUCT_SUMMARY_PROJECTION},
      "retailers": retailers[defined(@->)]-> ${RETAILER_PROJECTION}
    }`,
    { slug },
  );

  if( !drop ) return null;

  // The projection filters dangling references out with [defined(@->)]
  // before dereferencing, so drop.products holds live products only, never a
  // null entry for a deleted target. This count is therefore narrower than
  // getDrops(), which counts raw refs and so also catches a drop whose every
  // product was deleted after publish.
  assertDropHasProducts( drop.name, drop._id, drop.products.length );
  return drop;
}

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

// --- Blog ---

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

export interface BlogPost extends BlogPostSummary {
  body?: PortableText;
}

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

// --- Glossary ---

export interface GlossaryTermSummary {
  _id: string;
  term: string;
  slug: SanitySlug;
  shortDefinition: string;
  aliases?: string[];
  category: GlossaryCategory;
  featured?: boolean;
  image?: SanityImage;
  lastReviewedAt?: string;
  hasBody: boolean;
}

export interface GlossaryRelatedTerm {
  _id: string;
  term: string;
  slug: SanitySlug;
  shortDefinition: string;
  category: GlossaryCategory;
}

// The document types a glossary term can be cited from. Restricted to types
// that have their own slug-addressed page — `product` bodies can carry a
// glossaryRef, but products render on a single /products index with no per-item
// URL, so a backlink would have nowhere to point.
export type GlossaryMentionType = "blogPost" | "strain" | "terpene";

export const GLOSSARY_MENTION_TYPES: readonly GlossaryMentionType[] = [
  "blogPost",
  "strain",
  "terpene",
];

// Each mention type resolves to its own route. Keyed by type so adding a type to
// GLOSSARY_MENTION_TYPES without giving it a route is a compile error, not a
// link to nowhere.
const GLOSSARY_MENTION_ROUTES: Record<GlossaryMentionType, string> = {
  blogPost: "/blog",
  strain: "/strains",
  terpene: "/terpenes",
};

export function glossaryMentionHref( mention: GlossaryTermMention ): string {
  return `${GLOSSARY_MENTION_ROUTES[ mention._type ]}/${mention.slug.current}`;
}

export interface GlossaryTermMention {
  _id: string;
  _type: GlossaryMentionType;
  title: string;
  slug: SanitySlug;
  // Only blogPost carries a publish date; the others sort by title.
  publishedAt?: string;
}

export interface GlossaryTerm extends GlossaryTermSummary {
  body?: PortableText;
  relatedTerms?: GlossaryRelatedTerm[];
  mentionedIn?: GlossaryTermMention[];
}

export async function getGlossaryTerms() {
  const terms = await sanityClient.fetch<GlossaryTermSummary[]>(
    `*[_type == "glossaryTerm"] | order(lower(term) asc) {
      ${GLOSSARY_SUMMARY_PROJECTION}
    }`,
  );

  validateGlossarySummaries( terms );
  return terms;
}

export async function getGlossaryTerm( slug: string ) {
  const term = await sanityClient.fetch<GlossaryTerm | null>(
    `*[_type == "glossaryTerm" && slug.current == $slug][0] {
      ${GLOSSARY_SUMMARY_PROJECTION},
      body[] ${PORTABLE_TEXT_PROJECTION},
      relatedTerms[]->{ _id, term, slug, shortDefinition, category },
      "mentionedIn": *[_type in $mentionTypes && references(^._id)]
        | order(coalesce(publishedAt, "") desc, coalesce(title, name) asc) {
        _id, _type, slug, publishedAt,
        "title": coalesce(title, name)
      }
    }`,
    { slug, mentionTypes: GLOSSARY_MENTION_TYPES },
  );

  if( term ) validateGlossaryTerm( term );
  return term;
}

// --- Retailers ---

export interface RetailerProductRef {
  _id: string;
  name: string;
  slug: SanitySlug;
  category: string;
}

export interface Retailer {
  _id: string;
  name: string;
  slug: SanitySlug;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  lat?: number;
  lng?: number;
  website?: string;
  phone?: string;
  email?: string;
  logo?: SanityImage;
  featured?: boolean;
  productsAvailable?: RetailerProductRef[];
}

export async function getRetailers() {
  return sanityClient.fetch<Retailer[]>(
    `*[_type == "retailer"] | order(city asc, name asc) ${RETAILER_PROJECTION}`,
  );
}

// --- Pages (singletons by pageId) ---

export interface Page {
  _id: string;
  title: string;
  pageId: string;
  seoDescription?: string;
  heroImage?: SanityImage;
  heroImages?: SanityImage[];
  body?: PortableText;
}

export async function getPage( pageId: string ) {
  return sanityClient.fetch<Page | null>(
    `*[_type == "page" && pageId == $pageId][0] {
      _id, title, pageId, seoDescription,
      heroImage { asset->, alt, crop, hotspot },
      heroImages[] { asset->, crop, hotspot },
      body[] ${PORTABLE_TEXT_PROJECTION}
    }`,
    { pageId },
  );
}

// --- Site Settings ---

export interface SocialLinks {
  instagram?: string;
  facebook?: string;
  twitter?: string;
}

export interface SiteSettings {
  siteTitle?: string;
  siteDescription?: string;
  logo?: SanityImage;
  heroLockup?: SanityImage;
  socialLinks?: SocialLinks;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  ageGateMessage?: string;
}

export async function getSiteSettings() {
  return sanityClient.fetch<SiteSettings | null>(
    `*[_type == "siteSettings"][0] {
      siteTitle, siteDescription,
      logo { asset->, alt },
      heroLockup { asset->, alt },
      socialLinks,
      contactEmail, contactPhone, address,
      ageGateMessage
    }`,
  );
}

// --- Retailer Page ---

export interface RetailerPageDownloadable {
  label: string;
  url: string;
}

export interface RetailerPageMarketplace {
  label: string;
  audience?: string;
  url: string;
}

export interface RetailerPage {
  headline?: string;
  intro?: PortableText;
  contactEmail?: string;
  contactPhone?: string;
  marketplaces?: RetailerPageMarketplace[];
  downloadables?: RetailerPageDownloadable[];
}

export async function getRetailerPage() {
  const page = await sanityClient.fetch<RetailerPage | null>(
    `*[_type == "retailerPage"][0] {
      headline, intro[] ${PORTABLE_TEXT_PROJECTION},
      contactEmail, contactPhone,
      marketplaces[] { label, audience, url },
      "downloadables": downloadables[] { label, "url": file.asset->url }
    }`,
  );

  // Both the nav and the footer promote /retailers, and every section on that
  // page is optional-chained. A missing singleton therefore renders a blank page
  // behind the most prominent CTA on the site, and nothing else fails: not lint,
  // not astro check, not the build. Fail the build instead.
  if( !page ) {
    throw new Error(
      `No retailerPage document found in the "${SANITY_DATASET}" dataset. `
      + "Create and publish one at https://nw-local.sanity.studio/ before building.",
    );
  }

  // The storefront cards are the reason the page exists, so an empty array is
  // not an empty section: it publishes a Wholesale page that promises ordering
  // and offers no way to order. The optional chain below and the .length > 0
  // guard in retailers.astro both pass silently on zero entries, so the only
  // place this can be caught is here.
  if( !page.marketplaces?.length ) {
    throw new Error(
      `retailerPage in the "${SANITY_DATASET}" dataset has no marketplaces. `
      + "Add at least one Cultivera storefront at https://nw-local.sanity.studio/ before building.",
    );
  }

  // Studio validation is not enforced by the Content Lake, so an entry written
  // through the HTTP API, the MCP tools, or a script can be missing either field
  // and would render an unlabelled card or a link to nowhere.
  page.marketplaces.forEach( ( marketplace, index ) => {
    const missingFields: string[] = [];
    if( !marketplace.label?.trim() ) missingFields.push( "label" );
    if( !marketplace.url?.trim() ) missingFields.push( "url" );

    if( missingFields.length ) {
      throw new Error(
        `retailerPage.marketplaces[${index}] in the "${SANITY_DATASET}" dataset `
        + `is missing: ${missingFields.join( ", " )}. `
        + "Fill it in at https://nw-local.sanity.studio/ before building.",
      );
    }
  });

  return page;
}
