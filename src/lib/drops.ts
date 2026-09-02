import type {
  DropStatus,
  DropStrainDescription,
  DropSummary,
  PortableText,
  ProductSummary,
  SanityImage,
  SanitySlug,
  StrainType,
} from "./sanity";
import {
  UUID_PATTERN,
  assertExactFields,
  assertHttpsUrl,
  assertMeasurement,
  assertRecord,
  assertRequiredString,
  assertRfc3339Timestamp,
  assertStatus,
  type CoaStatus,
} from "./coa.ts";

export const DROP_BASE_PATH = "/drops";

export interface DropRef {
  _id: string;
  name: string;
  slug: SanitySlug;
  status: DropStatus;
}

export interface DropLookup {
  byProductId: Map<string, DropRef>;
  byStrainId: Map<string, DropRef>;
}

// The single source for the visitor-facing wording of a drop status.
// ProductBadge.astro folds this into its own label map and the drops index
// builds its filter buttons from it, so a badge reading "Available Now" and a
// filter reading "Available" cannot drift apart again.
//
// Declaration order is also the order the index page renders its filters in:
// strongest status first, matching compareDropStrength below.
export const DROP_STATUS_LABELS: Record<DropStatus, string> = {
  available: "Available Now",
  upcoming: "Upcoming",
  soldOut: "Sold Out",
};

// Higher wins. A drop a visitor can buy from outranks one they cannot, which is
// why this is a rank rather than the declaration order of DropStatus.
const STATUS_RANK: Record<DropStatus, number> = {
  available: 3,
  upcoming: 2,
  soldOut: 1,
};

export function dropHref( slug: SanitySlug ): string {
  return `${DROP_BASE_PATH}/${slug.current}`;
}

/**
 * Sorts the strongest drop first: status rank, then the later dropDate.
 *
 * Used for two things deliberately, because they are the same question asked
 * twice: which drop wins a lookup collision, and what order the index renders
 * in. dropDate is an ISO date string, so localeCompare orders it correctly
 * without parsing.
 */
export function compareDropStrength( left: DropSummary, right: DropSummary ): number {
  const rankDelta = STATUS_RANK[right.status] - STATUS_RANK[left.status];
  if( rankDelta !== 0 ) return rankDelta;
  return right.dropDate.localeCompare( left.dropDate );
}

function toDropRef( drop: DropSummary ): DropRef {
  return { _id: drop._id, name: drop.name, slug: drop.slug, status: drop.status };
}

export function buildDropLookup( drops: DropSummary[] ): DropLookup {
  const strongestByProductId = new Map<string, DropSummary>();
  const strongestByStrainId = new Map<string, DropSummary>();

  function claim( index: Map<string, DropSummary>, key: string | null, candidate: DropSummary ) {
    // A null key comes from a product that has no strain reference at all.
    // Studio's rule.required() does not reach API writes, so such a product is
    // writable, and strain._ref then projects to null in place. Indexing that
    // would collide every strain-less product under one entry. Dangling
    // references are already filtered out in GROQ with [defined(@->)] and are
    // not a source here.
    if( !key ) return;
    const incumbent = index.get( key );
    if( !incumbent || compareDropStrength( candidate, incumbent ) < 0 ) index.set( key, candidate );
  }

  for( const drop of drops ) {
    for( const productId of drop.productIds ) claim( strongestByProductId, productId, drop );
    for( const strainId of drop.strainIds ) claim( strongestByStrainId, strainId, drop );
  }

  return {
    byProductId: new Map(
      [ ...strongestByProductId ].map( ( [ key, drop ] ) => [ key, toDropRef( drop ) ] ),
    ),
    byStrainId: new Map(
      [ ...strongestByStrainId ].map( ( [ key, drop ] ) => [ key, toDropRef( drop ) ] ),
    ),
  };
}

// --- Drop certificates ---
//
// A drop names its release certificates explicitly (drop.coas) rather than
// looking them up by strain name: the certificate's strain.url is the join key,
// and it is matched exactly in groupDropStrains. This is the buyer-facing
// subset of a COA document: enough to say "Pass, 29.39% Total THC, here is the
// certificate", and nothing a drop page should not restate (panels, sample ids,
// the PDF).

export interface DropCoaReading {
  value: string;
  unit: string;
}

export interface DropCoaStrain {
  name: string;
  url: string;
}

export interface DropCoa {
  sourceId: string;
  labResultId: string;
  status: CoaStatus;
  publishedAt: string;
  totalThc?: DropCoaReading;
  strain?: DropCoaStrain;
}

export const DROP_COA_PROJECTION = `{
  sourceId, labResultId, status, publishedAt,
  defined(totalThc) => { "totalThc": totalThc { value, unit } },
  defined(strain) => { "strain": strain { name, url } }
}`;

const DROP_COA_FIELDS: ReadonlySet<string> = new Set( [
  "sourceId",
  "labResultId",
  "status",
  "publishedAt",
  "totalThc",
  "strain",
] );
const DROP_COA_READING_FIELDS: ReadonlySet<string> = new Set( [ "value", "unit" ] );
const DROP_COA_STRAIN_FIELDS: ReadonlySet<string> = new Set( [ "name", "url" ] );

function assertDropCoaReading( value: unknown, path: string ): asserts value is DropCoaReading {
  assertRecord( value, path );
  assertExactFields( value, DROP_COA_READING_FIELDS, path );
  assertMeasurement( value, path );
}

function assertDropCoaStrain( value: unknown, path: string ): asserts value is DropCoaStrain {
  assertRecord( value, path );
  assertExactFields( value, DROP_COA_STRAIN_FIELDS, path );
  assertRequiredString( value[ "name" ], `${path}.name` );
  assertHttpsUrl( value[ "url" ], `${path}.url` );
}

export function assertDropCoa( value: unknown, path = "drop COA" ): asserts value is DropCoa {
  assertRecord( value, path );
  assertExactFields( value, DROP_COA_FIELDS, path );

  const sourceId = value[ "sourceId" ];
  assertRequiredString( sourceId, `${path}.sourceId` );
  if( !UUID_PATTERN.test( sourceId ) ) throw new Error( `${path}.sourceId must be a UUID.` );

  assertRequiredString( value[ "labResultId" ], `${path}.labResultId` );
  assertStatus( value[ "status" ], `${path}.status` );
  assertRfc3339Timestamp( value[ "publishedAt" ], `${path}.publishedAt` );
  if( value[ "totalThc" ] !== undefined ) assertDropCoaReading( value[ "totalThc" ], `${path}.totalThc` );
  if( value[ "strain" ] !== undefined ) assertDropCoaStrain( value[ "strain" ], `${path}.strain` );
}

export function assertDropCoas( value: unknown ): asserts value is DropCoa[] {
  if( !Array.isArray( value ) ) throw new Error( "drop COAs must be an array." );
  const seenSourceIds = new Set<string>();
  value.forEach( ( candidate, index ) => {
    assertDropCoa( candidate, `drop COA [${index}]` );
    if( seenSourceIds.has( candidate.sourceId ) ) {
      throw new Error( `duplicate drop COA for source ID ${candidate.sourceId}.` );
    }
    seenSourceIds.add( candidate.sourceId );
  });
}

// --- Drop chapters ---
//
// The drop page is built like the buyer sheet: one chapter per strain, each
// with a fixed label colour, its certificate, and its state. Grouping is pure
// so the page, the coas.json manifest and the tests all derive from the same
// function and cannot disagree about which certificate belongs to which strain.

export const DROP_CHAPTER_COLORS: readonly string[] = [ "#00ff88", "#ff5fa2", "#ffb000", "#5ac8ff" ];
export const UNASSIGNED_STRAIN_KEY = "unassigned";
export const UNASSIGNED_STRAIN_HEADING = "More in this drop";
const STRAIN_BASE_PATH = "/strains";
const COA_BASE_PATH = "/coas";
const PERCENT_UNIT = "%";
const TOTAL_THC_SUFFIX = "Total THC";

// The badge-type keys the drop page's state banner reads, kept as a constant
// so ProductBadge's own label map and this module cannot drift on the two
// spellings a chapter can be in.
export const DROP_CHAPTER_STATE_LABELS = { available: "available", soldOut: "soldOut" } as const;

export interface DropChapterStrain {
  key: string;
  name: string;
  slug?: SanitySlug;
  strainType?: StrainType;
  lineage?: string;
  heroImage?: SanityImage;
  description?: PortableText;
}

export interface DropChapter {
  index: number;
  color: string;
  anchorId: string;
  strain: DropChapterStrain;
  products: ProductSummary[];
  available: boolean;
  coa?: DropCoa;
}

export interface DropStrainGrouping {
  chapters: DropChapter[];
  unmatchedCoas: DropCoa[];
}

export interface DropGroupingInput {
  products: ProductSummary[];
  coas: DropCoa[];
  strainDescriptions: DropStrainDescription[];
}

// The COA publisher in OPS writes strain.url with a trailing slash; the match
// in groupDropStrains is exact, so this is the one place that shape is spelled.
export function strainPageUrl( baseUrl: string, slug: SanitySlug ): string {
  return `${baseUrl}${STRAIN_BASE_PATH}/${slug.current}/`;
}

export function dropCoaHref( sourceId: string ): string {
  return `${COA_BASE_PATH}/${sourceId}/`;
}

export function dropCoaManifest( coas: DropCoa[] ): string[] {
  return coas.map( coa => coa.sourceId ).sort();
}

export function formatDropTotalThc( reading: DropCoaReading ): string {
  const measurement = reading.unit === PERCENT_UNIT
    ? `${reading.value}${PERCENT_UNIT}`
    : `${reading.value} ${reading.unit}`;
  return `${measurement} ${TOTAL_THC_SUFFIX}`;
}

function coasByStrainUrl( coas: DropCoa[] ): Map<string, DropCoa> {
  const byUrl = new Map<string, DropCoa>();
  for( const coa of coas ) {
    if( !coa.strain ) continue;
    if( byUrl.has( coa.strain.url ) ) {
      throw new Error( `two certificates claim ${coa.strain.url}: ${byUrl.get( coa.strain.url )!.sourceId} and ${coa.sourceId}.` );
    }
    byUrl.set( coa.strain.url, coa );
  }
  return byUrl;
}

export function groupDropStrains( drop: DropGroupingInput, baseUrl: string ): DropStrainGrouping {
  const descriptionsByStrainId = new Map(
    drop.strainDescriptions.map( entry => [ entry._id, entry.description ] ),
  );
  const chaptersByKey = new Map<string, Omit<DropChapter, "index" | "color">>();

  for( const product of drop.products ) {
    const key = product.strain?._id ?? UNASSIGNED_STRAIN_KEY;
    const existing = chaptersByKey.get( key );
    if( existing ) {
      existing.products.push( product );
      existing.available = existing.available || product.available === true;
      continue;
    }
    const strain: DropChapterStrain = product.strain
      ? {
        key,
        name: product.strain.name,
        slug: product.strain.slug,
        strainType: product.strain.strainType,
        lineage: product.strain.lineage,
        heroImage: product.strain.heroImage,
        description: descriptionsByStrainId.get( product.strain._id ),
      }
      : { key, name: UNASSIGNED_STRAIN_HEADING };
    chaptersByKey.set( key, {
      anchorId: `strain-${product.strain?.slug.current ?? UNASSIGNED_STRAIN_KEY}`,
      strain,
      products: [ product ],
      available: product.available === true,
    });
  }

  // "unassigned" sorts last so the fallback chapter cannot land between two
  // real strains; the sort is stable, so every other chapter keeps product order.
  const orderedChapters = [ ...chaptersByKey.values() ].sort( ( left, right ) => {
    if( left.strain.key === UNASSIGNED_STRAIN_KEY ) return 1;
    if( right.strain.key === UNASSIGNED_STRAIN_KEY ) return -1;
    return 0;
  });

  const byUrl = coasByStrainUrl( drop.coas );
  const matchedSourceIds = new Set<string>();
  const chapters = orderedChapters.map( ( chapter, position ) => {
    const coa = chapter.strain.slug ? byUrl.get( strainPageUrl( baseUrl, chapter.strain.slug ) ) : undefined;
    if( coa ) matchedSourceIds.add( coa.sourceId );
    return {
      ...chapter,
      index: position + 1,
      color: DROP_CHAPTER_COLORS[ position % DROP_CHAPTER_COLORS.length ],
      coa,
    };
  });

  return {
    chapters,
    unmatchedCoas: drop.coas.filter( coa => !matchedSourceIds.has( coa.sourceId ) ),
  };
}
