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
import { buildDefinedTerm } from "../src/lib/jsonld.ts";
import {
  filterGlossaryTerms,
  hasActiveGlossaryFilters,
  normalizeGlossaryQueryValue,
  normalizeGlossarySearchText,
  parseGlossaryFilters,
  serializeGlossaryFilters,
  type GlossaryFilters,
  type GlossarySearchRecord,
} from "../src/lib/glossary-search.ts";
import type {
  GlossaryTerm,
  GlossaryTermSummary,
  PortableText,
} from "../src/lib/sanity.ts";
import { readFileSync } from "node:fs";

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
  if( !Object.is( actual, expected ) && JSON.stringify( actual ) !== JSON.stringify( expected ) ) {
    failures.push( `${label}: expected ${JSON.stringify( expected )}, got ${JSON.stringify( actual )}` );
  }
}

function expectIds( label: string, actual: string[], expected: string[] ): void {
  expectEqual( label, JSON.stringify( actual ), JSON.stringify( expected ) );
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
expectEqual( "present textless body is one minute", glossaryReadingMinutes( bodyWithWords( 0 ) ), 1 );
expectEqual( "missing body has no reading time", glossaryReadingMinutes( undefined ), undefined );

const ec: GlossaryTerm = {
  _id: "glossary-ec",
  term: "Electrical conductivity (EC)",
  slug: { current: "ec" },
  shortDefinition: "A measure of how well dissolved fertilizer ions conduct electricity.",
  aliases: [ "EC", "conductivity" ],
  category: "nutrition",
  featured: true,
  image: {
    asset: { _id: "image-ec-1600x1000-jpg" },
    alt: "An electrical conductivity probe immersed in a fertigation reservoir.",
  },
  lastReviewedAt: "2026-08-31",
  hasBody: true,
  body: [ {
    _type: "block",
    style: "normal",
    children: [ {
      _type: "span",
      text: "EC is a process-control signal for nutrient solutions and root zones.",
    } ],
  } ],
  relatedTerms: [ {
    _id: "glossary-ph",
    term: "pH",
    slug: { current: "ph" },
    shortDefinition: "A logarithmic measure of acidity or alkalinity.",
    category: "chemistry",
  } ],
  mentionedIn: [ {
    _id: "post-ec",
    _type: "blogPost",
    title: "Reading a nutrient solution",
    slug: { current: "reading-a-nutrient-solution" },
    publishedAt: "2026-08-31",
  } ],
};

const schema = buildDefinedTerm( ec, "https://nw-local.com/" );
expectEqual( "defined term type", schema[ "@type" ], "DefinedTerm" );
expectEqual( "canonical name", schema.name, "Electrical conductivity (EC)" );
expectEqual( "canonical url", schema.url, "https://nw-local.com/glossary/ec/" );
expectEqual( "description", schema.description, ec.shortDefinition );
expectEqual( "aliases", schema.alternateName, [ "EC", "conductivity" ] );

const searchTerms: GlossarySearchRecord[] = [
  {
    _id: "ec",
    term: "Electrical conductivity (EC)",
    shortDefinition: "A measure of how well dissolved fertilizer ions conduct electricity.",
    aliases: [ "EC", "conductivity", "solution conductivity" ],
    category: "nutrition",
  },
  {
    _id: "vpd",
    term: "Vapor pressure deficit (VPD)",
    shortDefinition: "The difference between saturated and actual vapor pressure in the air.",
    aliases: [ "vapour pressure deficit" ],
    category: "environment",
  },
  {
    _id: "xylem",
    term: "Xylem",
    shortDefinition: "Plant tissue that transports water and dissolved minerals upward.",
    category: "plant-biology",
  },
];

function filter( overrides: Partial<GlossaryFilters> ): string[] {
  return filterGlossaryTerms( searchTerms, { query: "", ...overrides });
}

expectIds( "canonical term", filter({ query: "electrical conductivity" }), [ "ec" ] );
expectIds( "alias", filter({ query: "EC" }), [ "ec" ] );
expectIds( "definition", filter({ query: "dissolved fertilizer" }), [ "ec" ] );
expectIds( "category label", filter({ query: "nutrition" }), [ "ec" ] );
expectIds( "accent and punctuation normalization", filter({ query: "vapor-pressure" }), [ "vpd" ] );
expectIds( "combined filters", filter({
  query: "conductivity",
  letter: "e",
  category: "nutrition",
}), [ "ec" ] );
expectIds( "zero results", filter({ query: "not-present" }), [] );
expectIds( "source order is retained", filter({ query: "dissolved" }), [ "ec", "xylem" ] );
expectEqual(
  "accent and punctuation normalize to searchable spaces",
  normalizeGlossarySearchText( "Vápor-pressure" ),
  "vapor pressure",
);
expectIds(
  "precomputed DOM metadata",
  filterGlossaryTerms( [ {
    _id: "dom-ec",
    term: "Electrical conductivity (EC)",
    shortDefinition: "",
    category: "nutrition",
    initial: "e",
    searchText: "electrical conductivity ec solution nutrition",
  } ], { query: "solution", letter: "e", category: "nutrition" }),
  [ "dom-ec" ],
);

const parsedFilters = parseGlossaryFilters(
  new URLSearchParams( "q=conductivity&letter=e&category=nutrition" ),
);
expectEqual(
  "valid URL filters parse",
  JSON.stringify( parsedFilters ),
  JSON.stringify({ query: "conductivity", letter: "e", category: "nutrition" }),
);
expectEqual(
  "filters round trip",
  serializeGlossaryFilters( parsedFilters ).toString(),
  "q=conductivity&letter=e&category=nutrition",
);
expectEqual(
  "unknown category is rejected",
  JSON.stringify( parseGlossaryFilters( new URLSearchParams( "category=unknown" ) ) ),
  JSON.stringify({ query: "" }),
);
expectEqual(
  "multi-character letter is rejected",
  JSON.stringify( parseGlossaryFilters( new URLSearchParams( "letter=ec" ) ) ),
  JSON.stringify({ query: "" }),
);
expectEqual(
  "empty values are omitted",
  serializeGlossaryFilters({ query: "   " }).toString(),
  "",
);
expectEqual(
  "invalid values are not serialized",
  serializeGlossaryFilters({ query: "", letter: "ec", category: "unknown" }).toString(),
  "",
);
expectEqual(
  "punctuation-only query has no visible value",
  normalizeGlossaryQueryValue( " --- " ),
  "",
);
expectEqual(
  "punctuation-only query is inactive",
  hasActiveGlossaryFilters({ query: "---" }),
  false,
);
expectEqual(
  "punctuation-only query is not serialized",
  serializeGlossaryFilters({ query: "---" }).toString(),
  "",
);

const glossarySearchSource = readFileSync(
  new URL( "../src/components/GlossarySearch.astro", import.meta.url ),
  "utf8",
);
expectEqual(
  "controls are hidden before enhancement",
  /<div\s+class="glossary-search-controls"[^>]*\bhidden\b[^>]*>/.test( glossarySearchSource ),
  true,
);
expectEqual(
  "controls reveal only after initial render",
  /render\(\);\s*updateUrl\( "replace" \);\s*searchControls\.hidden = false;/.test(
    glossarySearchSource,
  ),
  true,
);
const glossaryDirectoryTag = glossarySearchSource.match( /<dl\s+class="glossary-index"[^>]*>/ )?.[ 0 ];
expectEqual(
  "directory remains visible before enhancement",
  glossaryDirectoryTag?.includes( "hidden" ) ?? true,
  false,
);

if( failures.length > 0 ) {
  console.error( "Glossary contract violated:" );
  for( const failure of failures ) console.error( `  - ${failure}` );
  process.exit( 1 );
}

console.log( "Glossary content contract holds" );
