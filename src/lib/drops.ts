import type { DropStatus, DropSummary, SanitySlug } from "./sanity";

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
