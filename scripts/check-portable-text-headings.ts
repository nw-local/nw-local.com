#!/usr/bin/env node
/**
 * Verify Portable Text heading preparation produces stable, unique anchor ids.
 *
 * This runs under bare node with no .env loaded, so portableTextHeadings.ts
 * imports Portable Text shapes with `import type` only. The checks exercise the
 * shared preparation pass directly, keeping collision behavior independent of
 * any particular page renderer.
 */

import { preparePortableTextHeadings } from "../src/lib/portableTextHeadings.ts";
import type { PortableText, PortableTextBlock } from "../src/lib/sanity.ts";

const failures: string[] = [];

function heading( style: "h2" | "h3", text: string ): PortableTextBlock {
  return {
    _type: "block",
    _key: `${style}-${text}`,
    style,
    children: [ { _type: "span", text } ],
  };
}

function expectIds( label: string, value: PortableText, expected: string[] ): void {
  const actual = preparePortableTextHeadings( value ).headings.map( headingRecord => headingRecord.id );
  if( JSON.stringify( actual ) !== JSON.stringify( expected ) ) {
    failures.push( `${label}: expected ${JSON.stringify( expected )}, got ${JSON.stringify( actual )}` );
  }
}

function expectThrows( label: string, action: () => void ): void {
  try {
    action();
    failures.push( `${label}: expected an error` );
  } catch {
    // The behavior under test is rejection of an unusable heading, not the
    // implementation's exact error wording.
  }
}

expectIds( "ordinary headings", [ heading( "h2", "What EC measures" ) ], [ "what-ec-measures" ] );
expectIds(
  "duplicates receive stable suffixes",
  [ heading( "h2", "Sources" ), heading( "h3", "Sources" ), heading( "h2", "Sources" ) ],
  [ "sources", "sources-2", "sources-3" ],
);
expectIds(
  "punctuation-equivalent headings collide",
  [ heading( "h2", "Feed EC" ), heading( "h2", "Feed: EC" ) ],
  [ "feed-ec", "feed-ec-2" ],
);
expectThrows( "symbol-only heading fails loudly", () => preparePortableTextHeadings( [ heading( "h2", "§" ) ] ) );

if( failures.length > 0 ) {
  console.error( "Portable Text heading preparation contract violated:" );
  for( const failure of failures ) console.error( `  - ${failure}` );
  process.exit( 1 );
}

console.log( "Portable Text heading preparation contract holds" );
