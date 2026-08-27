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

  function claim( index: Map<string, DropSummary>, key: string, candidate: DropSummary ) {
    // Falsy keys come from a dangling reference whose target was deleted in
    // Sanity. Indexing them would collide every such product under one entry.
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
