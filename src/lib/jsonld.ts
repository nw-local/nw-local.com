import {
  AUTHOR_BASE_PATH,
  type Author,
  type BlogPost,
  type PortableText,
  type PortableTextBlock,
  type SiteSettings,
  type Strain,
} from "./sanity";
import { childrenToText } from "./portableText";

interface SchemaBase {
  "@context": "https://schema.org";
  "@type": string;
}

export interface OrganizationSchema extends SchemaBase {
  "@type": "Organization";
  name: string;
  url: string;
  description?: string;
  logo?: string;
  email?: string;
  telephone?: string;
  sameAs?: string[];
}

export interface BrandRef {
  "@type": "Brand";
  name: string;
}

export interface ProductSchema extends SchemaBase {
  "@type": "Product";
  name: string;
  url: string;
  category: string;
  description?: string;
  image?: string;
  brand?: BrandRef;
}

export interface ImageObject {
  "@type": "ImageObject";
  url: string;
}

export interface PublisherRef {
  "@type": "Organization";
  name: string;
  logo?: ImageObject;
}

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

export interface PersonSchema extends SchemaBase {
  "@type": "Person";
  name: string;
  url: string;
  image?: string;
  jobTitle?: string;
  sameAs?: string[];
  description?: string;
}

export interface BreadcrumbItem {
  "@type": "ListItem";
  position: number;
  name: string;
  item: string;
}

export interface BreadcrumbListSchema extends SchemaBase {
  "@type": "BreadcrumbList";
  itemListElement: BreadcrumbItem[];
}

export type StructuredData =
  | OrganizationSchema
  | ProductSchema
  | ArticleSchema
  | PersonSchema
  | BreadcrumbListSchema;

export function normalizeSiteUrl( siteUrl: string ): string {
  return siteUrl.endsWith( "/" ) ? siteUrl.slice( 0, -1 ) : siteUrl;
}

// `Astro.site` is whatever `site` in astro.config.mjs says, so it is defined on
// every build; this throws rather than substituting a literal because the seven
// call sites used to carry their own `?? "https://www.nw-local.com"` fallback,
// and that fallback was both unreachable and wrong. It named the www host after
// the site moved to the apex, so the one situation it existed to handle would
// have silently published a second, contradictory hostname into canonical tags
// and JSON-LD @ids — while BaseHead.astro, which reads Astro.site directly with
// no fallback, kept emitting the right one. A fallback that disagrees with its
// neighbours is worse than no fallback, and one host literal is easier to keep
// correct than seven.
export function requireSiteUrl( site: URL | undefined ): string {
  if( !site ) throw new Error( "Missing `site` in astro.config.mjs — canonical URLs, the sitemap, and JSON-LD all derive from it" );
  return site.toString();
}

export function portableTextToPlainText( blocks?: PortableText, maxParagraphs = 2 ): string {
  if( !blocks ) return "";

  const paragraphs: string[] = [];

  for( const block of blocks ) {
    if( paragraphs.length >= maxParagraphs ) break;
    if( !isParagraphBlock( block ) ) continue;

    const text = childrenToText( block.children );

    if( text.length > 0 ) paragraphs.push( text );
  }

  return paragraphs.join( " " );
}

function isParagraphBlock( block: PortableTextBlock ): boolean {
  return (
    block._type === "block"
    && block.style === "normal"
    && !block.listItem
  );
}

export function buildOrganization(
  settings: SiteSettings | null,
  siteUrl: string,
): OrganizationSchema | null {
  if( !settings?.siteTitle ) return null;

  const url = normalizeSiteUrl( siteUrl );

  const organization: OrganizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: settings.siteTitle,
    url,
  };

  if( settings.logo?.asset?.url ) organization.logo = settings.logo.asset.url;
  if( settings.siteDescription ) organization.description = settings.siteDescription;
  if( settings.contactEmail ) organization.email = settings.contactEmail;
  if( settings.contactPhone ) organization.telephone = settings.contactPhone;

  const sameAs: string[] = [];
  if( settings.socialLinks?.instagram ) sameAs.push( settings.socialLinks.instagram );
  if( settings.socialLinks?.facebook ) sameAs.push( settings.socialLinks.facebook );
  if( settings.socialLinks?.twitter ) sameAs.push( settings.socialLinks.twitter );
  if( sameAs.length > 0 ) organization.sameAs = sameAs;

  return organization;
}

export function buildProduct(
  strain: Strain,
  siteUrl: string,
  heroImageUrl?: string,
  brandName?: string,
): ProductSchema {
  const url = `${normalizeSiteUrl( siteUrl )}/strains/${strain.slug.current}/`;

  const product: ProductSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: strain.name,
    url,
    category: `Cannabis Strain - ${strain.strainType}`,
  };

  if( heroImageUrl ) product.image = heroImageUrl;

  const description = portableTextToPlainText( strain.description );
  if( description ) product.description = description;

  if( brandName ) {
    product.brand = { "@type": "Brand", name: brandName };
  }

  return product;
}

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

export interface BreadcrumbInput {
  name: string;
  url: string;
}

export function buildBreadcrumbList(
  items: BreadcrumbInput[],
): BreadcrumbListSchema {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map( ( crumb, index ) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: crumb.url,
    }) ),
  };
}

