#!/usr/bin/env node
/**
 * Verify the buildDropLookup collision rule.
 *
 * When one product or strain belongs to several drops, the lookup keeps the
 * drop with the strongest status, tie broken by the later dropDate. A Map
 * silently keeps whichever entry was written last, so without this check the
 * answer would depend on the order Sanity happened to return rows in, and a
 * strain in both a live batch and a sold out old one could badge as sold out.
 *
 * Both orderings of the same two drops are asserted deliberately. A naive
 * last-write-wins implementation passes one of them by luck.
 *
 * This runs under bare node with no .env loaded, which is why src/lib/drops.ts
 * must import from src/lib/sanity.ts with `import type` only: a value import
 * would pull in the Sanity client and throw on the missing env vars.
 */

import { buildDropLookup, type DropRef } from "../src/lib/drops.ts";
import type { DropSummary } from "../src/lib/sanity.ts";

function makeDrop(
  name: string,
  status: DropSummary["status"],
  dropDate: string,
): DropSummary {
  return {
    _id: `drop-${name}`,
    name,
    // SanitySlug is { current: string } and nothing else. Adding a _type here
    // is an excess property error, not harmless extra data.
    slug: { current: name },
    description: `${name} description`,
    status,
    dropDate,
    productIds: [ "product-1" ],
    liveProductCount: 1,
    strainIds: [ "strain-1" ],
  };
}

const failures: string[] = [];

function expectWinner( label: string, actual: DropRef | undefined, expectedName: string ) {
  if( actual?.name !== expectedName ) {
    failures.push( `${label}: expected "${expectedName}", got "${actual?.name ?? "nothing"}"` );
  }
}

const soldOutDrop = makeDrop( "old-sold-out", "soldOut", "2026-01-01" );
const availableDrop = makeDrop( "new-available", "available", "2026-08-01" );

for( const [ label, drops ] of [
  [ "sold out listed first", [ soldOutDrop, availableDrop ] ],
  [ "available listed first", [ availableDrop, soldOutDrop ] ],
] satisfies [ string, DropSummary[] ][] ) {
  const lookup = buildDropLookup( drops );
  expectWinner( `${label}, byProductId`, lookup.byProductId.get( "product-1" ), "new-available" );
  expectWinner( `${label}, byStrainId`, lookup.byStrainId.get( "strain-1" ), "new-available" );
}

const olderUpcoming = makeDrop( "older-upcoming", "upcoming", "2026-02-01" );
const newerUpcoming = makeDrop( "newer-upcoming", "upcoming", "2026-09-01" );

for( const [ label, drops ] of [
  [ "newer listed first", [ newerUpcoming, olderUpcoming ] ],
  [ "older listed first", [ olderUpcoming, newerUpcoming ] ],
] satisfies [ string, DropSummary[] ][] ) {
  const lookup = buildDropLookup( drops );
  const context = `same status ties break on the later dropDate, ${label}`;
  expectWinner( `${context}, byProductId`, lookup.byProductId.get( "product-1" ), "newer-upcoming" );
  expectWinner( `${context}, byStrainId`, lookup.byStrainId.get( "strain-1" ), "newer-upcoming" );
}

const emptyLookup = buildDropLookup( [] );
if( emptyLookup.byProductId.size !== 0 || emptyLookup.byStrainId.size !== 0 ) {
  failures.push( "an empty drop list must produce empty maps" );
}

if( failures.length > 0 ) {
  console.error( "buildDropLookup collision rule violated:" );
  for( const failure of failures ) console.error( `  - ${failure}` );
  process.exit( 1 );
}

console.log( "buildDropLookup collision rule holds" );
