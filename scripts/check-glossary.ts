#!/usr/bin/env node
/**
 * Verify the glossary content contract and reading-time calculation.
 *
 * This runs under bare node with no .env loaded. glossary.ts consequently
 * imports its Sanity shapes with `import type` only, so validating fetched data
 * does not initialize the Sanity client.
 */

import {
  glossaryReadingMinutes,
  validateGlossarySummaries,
} from "../src/lib/glossary.ts";
import type { GlossaryTermSummary, PortableText } from "../src/lib/sanity.ts";

type GlossaryTermOverrides = Partial<Omit<GlossaryTermSummary, "category">> & {
  category?: unknown;
};

function makeTerm( overrides: GlossaryTermOverrides = {}): GlossaryTermSummary {
  const term: GlossaryTermSummary = {
    _id: "glossary-valid",
    term: "Trichome",
    slug: { current: "trichome" },
    shortDefinition: "A resin gland on cannabis flowers.",
    aliases: [ "resin gland" ],
    category: "plant-biology",
    featured: false,
    image: {
      asset: { _id: "image-valid" },
      alt: "A magnified trichome on a cannabis flower.",
    },
    hasBody: true,
    lastReviewedAt: "2026-08-31",
  };

  for( const [ fieldName, value ] of Object.entries( overrides ) ) {
    Reflect.set( term, fieldName, value );
  }

  return term;
}

function bodyWithWords( wordCount: number ): PortableText {
  return [ {
    _type: "block",
    children: [ { _type: "span", text: Array.from({ length: wordCount }, () => "word" ).join( " " ) } ],
  } ];
}

const failures: string[] = [];

function expectEqual( label: string, actual: unknown, expected: unknown ): void {
  if( actual !== expected ) {
    failures.push( `${label}: expected ${JSON.stringify( expected )}, got ${JSON.stringify( actual )}` );
  }
}

function expectThrows( label: string, action: () => void, expectedMessage: string ): void {
  try {
    action();
    failures.push( `${label}: expected an error containing ${JSON.stringify( expectedMessage )}` );
  } catch ( error ) {
    const message = error instanceof Error ? error.message : String( error );
    if( !message.includes( expectedMessage ) ) {
      failures.push( `${label}: expected an error containing ${JSON.stringify( expectedMessage )}, got ${JSON.stringify( message )}` );
    }
  }
}

expectThrows(
  "unknown category names the document",
  () => validateGlossarySummaries( [ makeTerm({ _id: "glossary-bad", category: "unknown" }) ] ),
  "glossary-bad",
);

expectThrows(
  "featured entries report every missing field",
  () => validateGlossarySummaries( [ makeTerm({
    _id: "glossary-featured",
    featured: true,
    image: undefined,
    hasBody: false,
    lastReviewedAt: undefined,
  }) ] ),
  "body, image, image.alt, lastReviewedAt",
);

expectEqual( "200 words is one minute", glossaryReadingMinutes( bodyWithWords( 200 ) ), 1 );
expectEqual( "201 words rounds up", glossaryReadingMinutes( bodyWithWords( 201 ) ), 2 );
expectEqual( "missing body has no reading time", glossaryReadingMinutes( undefined ), undefined );

if( failures.length > 0 ) {
  console.error( "Glossary contract violated:" );
  for( const failure of failures ) console.error( `  - ${failure}` );
  process.exit( 1 );
}

console.log( "Glossary content contract holds" );
