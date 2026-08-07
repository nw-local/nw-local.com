import { createClient } from "@sanity/client";

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

// --- Shared types ---

export interface SanitySlug {
  current: string;
}

export interface SanityImage {
  asset: {
    _id?: string;
    _ref?: string;
    url?: string;
    metadata?: unknown;
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
      "strains": *[_type == "strain" && ^.name in terpenes] | order(_createdAt desc) {
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
    `*[_type == "product"] | order(sortOrder asc, name asc) {
      _id, name, slug, category, weight, available,
      image { asset->, alt },
      "strain": strain->{ _id, name, slug, strainType, heroImage { asset->, alt, crop, hotspot } }
    }`,
  );
}

export async function getProductsByStrain( strainId: string ) {
  return sanityClient.fetch<ProductWithDescription[]>(
    `*[_type == "product" && strain._ref == $strainId] | order(sortOrder asc) {
      _id, name, slug, category, weight, available,
      image { asset->, alt },
      description[] ${PORTABLE_TEXT_PROJECTION}
    }`,
    { strainId },
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
}

export interface BlogPost extends BlogPostSummary {
  body?: PortableText;
}

export async function getBlogPosts() {
  return sanityClient.fetch<BlogPostSummary[]>(
    `*[_type == "blogPost"] | order(publishedAt desc) {
      _id, title, slug, description, publishedAt, tags,
      heroImage { asset->, alt, crop, hotspot }
    }`,
  );
}

export async function getBlogPost( slug: string ) {
  return sanityClient.fetch<BlogPost | null>(
    `*[_type == "blogPost" && slug.current == $slug][0] {
      _id, title, slug, description, publishedAt, tags,
      heroImage { asset->, alt, crop, hotspot },
      body[] ${PORTABLE_TEXT_PROJECTION}
    }`,
    { slug },
  );
}

// --- Glossary ---

export interface GlossaryTermSummary {
  _id: string;
  term: string;
  slug: SanitySlug;
  shortDefinition: string;
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
  mentionedIn?: GlossaryTermMention[];
}

export async function getGlossaryTerms() {
  return sanityClient.fetch<GlossaryTermSummary[]>(
    `*[_type == "glossaryTerm"] | order(lower(term) asc) {
      _id, term, slug, shortDefinition
    }`,
  );
}

export async function getGlossaryTerm( slug: string ) {
  return sanityClient.fetch<GlossaryTerm | null>(
    `*[_type == "glossaryTerm" && slug.current == $slug][0] {
      _id, term, slug, shortDefinition,
      body[] ${PORTABLE_TEXT_PROJECTION},
      "mentionedIn": *[_type in $mentionTypes && references(^._id)]
        | order(coalesce(publishedAt, "") desc, coalesce(title, name) asc) {
        _id, _type, slug, publishedAt,
        "title": coalesce(title, name)
      }
    }`,
    { slug, mentionTypes: GLOSSARY_MENTION_TYPES },
  );
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
    `*[_type == "retailer"] | order(city asc, name asc) {
      _id, name, slug, address, city, state, zip,
      lat, lng, website, phone, email,
      logo { asset->, alt },
      featured,
      productsAvailable[]->{ _id, name, slug, category }
    }`,
  );
}

// --- Pages (singletons by pageId) ---

export interface Page {
  _id: string;
  title: string;
  pageId: string;
  seoDescription?: string;
  heroImage?: SanityImage;
  body?: PortableText;
}

export async function getPage( pageId: string ) {
  return sanityClient.fetch<Page | null>(
    `*[_type == "page" && pageId == $pageId][0] {
      _id, title, pageId, seoDescription,
      heroImage { asset->, alt, crop, hotspot },
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

export interface RetailerPage {
  headline?: string;
  intro?: PortableText;
  contactEmail?: string;
  contactPhone?: string;
  downloadables?: RetailerPageDownloadable[];
}

export async function getRetailerPage() {
  return sanityClient.fetch<RetailerPage | null>(
    `*[_type == "retailerPage"][0] {
      headline, intro[] ${PORTABLE_TEXT_PROJECTION},
      contactEmail, contactPhone,
      "downloadables": downloadables[] { label, "url": file.asset->url }
    }`,
  );
}
