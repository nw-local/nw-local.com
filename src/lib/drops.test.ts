import { describe, expect, test } from "vitest";
import {
  DROP_CHAPTER_COLORS,
  UNASSIGNED_STRAIN_HEADING,
  UNASSIGNED_STRAIN_KEY,
  assertDropCoa,
  assertDropCoas,
  dropCoaHref,
  dropCoaManifest,
  formatDropTotalThc,
  groupDropStrains,
  strainPageUrl,
} from "./drops.ts";
import type { DropCoa } from "./drops.ts";
import type { ProductStrainRef, ProductSummary } from "./sanity";

export const DROP_COA_SOURCE_ID = "00000000-0000-4000-8000-000000000001";

export function makeDropCoaFixture(): DropCoa {
  return {
    sourceId: DROP_COA_SOURCE_ID,
    labResultId: "2155470281845367208-18-2026",
    status: "pass",
    publishedAt: "2026-09-01T21:15:30Z",
    totalThc: { value: "29.39", unit: "%" },
    strain: { name: "Test Strain", url: "https://nw-local.com/strains/test-strain/" },
  };
}

describe( "assertDropCoa", () => {
  test( "accepts the fixture", () => {
    expect( () => assertDropCoa( makeDropCoaFixture() ) ).not.toThrow();
  });

  test( "accepts a COA without a reading or a strain", () => {
    const bare = makeDropCoaFixture();
    delete bare.totalThc;
    delete bare.strain;
    expect( () => assertDropCoa( bare ) ).not.toThrow();
  });

  test.each( [
    [ "an unknown field", { ...makeDropCoaFixture(), sampleId: "S" }, "unknown field: sampleId" ],
    [ "a non-UUID sourceId", { ...makeDropCoaFixture(), sourceId: "abc" }, "must be a UUID" ],
    [ "a blank labResultId", { ...makeDropCoaFixture(), labResultId: " " }, "labResultId must be a non-empty string" ],
    [ "an unknown status", { ...makeDropCoaFixture(), status: "pending" }, 'must be "pass" or "fail"' ],
    [ "a loose timestamp", { ...makeDropCoaFixture(), publishedAt: "2026-09-01" }, "strict RFC3339" ],
    [ "a null reading", { ...makeDropCoaFixture(), totalThc: null }, "totalThc must be an object" ],
    [ "a non-canonical reading", { ...makeDropCoaFixture(), totalThc: { value: "29.390", unit: "%" } }, "canonical decimal" ],
    [ "a reading with a label", { ...makeDropCoaFixture(), totalThc: { label: "x", value: "1", unit: "%" } }, "unknown field: label" ],
    [ "a blank unit", { ...makeDropCoaFixture(), totalThc: { value: "1", unit: "" } }, "unit must be a non-empty string" ],
    [ "an http strain url", { ...makeDropCoaFixture(), strain: { name: "S", url: "http://nw-local.com/strains/s/" } }, "HTTPS URL" ],
    [ "a strain with extra keys", { ...makeDropCoaFixture(), strain: { name: "S", url: "https://nw-local.com/strains/s/", slug: "s" } }, "unknown field: slug" ],
  ] )( "rejects %s", ( _description, value, message ) => {
    expect( () => assertDropCoa( value ) ).toThrow( message );
  });

  test( "assertDropCoas rejects a non-array and a duplicate source id", () => {
    expect( () => assertDropCoas( null ) ).toThrow( "must be an array" );
    expect( () => assertDropCoas( [ makeDropCoaFixture(), makeDropCoaFixture() ] ) )
      .toThrow( `duplicate drop COA for source ID ${DROP_COA_SOURCE_ID}` );
  });

  test( "assertDropCoas names the failing index", () => {
    expect( () => assertDropCoas( [ makeDropCoaFixture(), { ...makeDropCoaFixture(), sourceId: "x" } ] ) )
      .toThrow( "drop COA [1].sourceId must be a UUID" );
  });
});

const BASE_URL = "https://nw-local.com";

function makeStrain( name: string, slug: string ): ProductStrainRef {
  return { _id: `strain-${slug}`, name, slug: { current: slug }, strainType: "hybrid", lineage: `${name} lineage` };
}

function makeProduct( name: string, strain: ReturnType<typeof makeStrain> | undefined, available: boolean ): ProductSummary {
  return { _id: `product-${name}`, name, slug: { current: name }, category: "flower", available, strain };
}

function makeCoaFor( slug: string, sourceIdSuffix: string ): DropCoa {
  return {
    ...makeDropCoaFixture(),
    sourceId: `00000000-0000-4000-8000-00000000000${sourceIdSuffix}`,
    strain: { name: slug, url: `${BASE_URL}/strains/${slug}/` },
  };
}

describe( "groupDropStrains", () => {
  const glitterBomb = makeStrain( "Glitter Bomb", "glitter-bomb" );
  const superBoof = makeStrain( "Super Boof", "super-boof" );

  test( "groups products by strain in product order, matches COAs by exact strain url, and attaches descriptions", () => {
    const description = [ { _type: "block", _key: "b1", children: [] } ];
    const grouping = groupDropStrains({
      products: [
        makeProduct( "GB 3.5", glitterBomb, true ),
        makeProduct( "SB 3.5", superBoof, false ),
        makeProduct( "GB 7", glitterBomb, false ),
      ],
      coas: [ makeCoaFor( "super-boof", "2" ), makeCoaFor( "glitter-bomb", "1" ) ],
      strainDescriptions: [ { _id: glitterBomb._id, description } ],
    }, BASE_URL );

    expect( grouping.chapters.map( chapter => chapter.strain.name ) ).toEqual( [ "Glitter Bomb", "Super Boof" ] );
    expect( grouping.chapters[0].products.map( product => product.name ) ).toEqual( [ "GB 3.5", "GB 7" ] );
    expect( grouping.chapters[0].coa?.sourceId ).toBe( "00000000-0000-4000-8000-000000000001" );
    expect( grouping.chapters[1].coa?.sourceId ).toBe( "00000000-0000-4000-8000-000000000002" );
    expect( grouping.chapters[0].strain.description ).toEqual( description );
    expect( grouping.chapters[0].strain.lineage ).toBe( "Glitter Bomb lineage" );
    expect( grouping.chapters[0].anchorId ).toBe( "strain-glitter-bomb" );
    expect( grouping.chapters.map( chapter => chapter.index ) ).toEqual( [ 1, 2 ] );
    expect( grouping.unmatchedCoas ).toEqual( [] );
  });

  test( "carries the strain's Cultivera marketplace id onto the chapter and strips drop-page references from the description", () => {
    const strainWithId: ProductStrainRef = { ...glitterBomb, cultiveraMarketProductId: "14303" };
    const description = [
      {
        _type: "block", _key: "b1", style: "normal",
        markDefs: [ { _key: "m1", _type: "link", href: "https://breeder.example" } ],
        children: [ { _type: "span", _key: "s1", text: "Bred by Compound Genetics", marks: [ "m1" ] } ],
      },
      { _type: "block", _key: "b2", style: "h4", children: [ { _type: "span", _key: "s2", text: "Learn More", marks: [] } ] },
      {
        _type: "block", _key: "b3", style: "normal",
        markDefs: [ { _key: "m2", _type: "link", href: "https://leafly.example" } ],
        children: [ { _type: "span", _key: "s3", text: "Leafly", marks: [ "m2" ] } ],
      },
    ];
    const grouping = groupDropStrains({
      products: [ makeProduct( "GB 3.5", strainWithId, true ) ],
      coas: [],
      strainDescriptions: [ { _id: strainWithId._id, description } ],
    }, BASE_URL );

    const chapterStrain = grouping.chapters[0].strain;
    expect( chapterStrain.cultiveraMarketProductId ).toBe( "14303" );
    // The "Learn More" heading and every block after it are gone; the surviving
    // block keeps its prose but drops its outbound link markDef and span mark.
    expect( chapterStrain.description ).toEqual( [
      {
        _type: "block", _key: "b1", style: "normal", markDefs: [],
        children: [ { _type: "span", _key: "s1", text: "Bred by Compound Genetics", marks: [] } ],
      },
    ] );
  });

  test( "availability is any product available; a strain whose products are all unavailable is sold out", () => {
    const grouping = groupDropStrains({
      products: [ makeProduct( "GB 3.5", glitterBomb, false ), makeProduct( "GB 7", glitterBomb, true ), makeProduct( "SB", superBoof, false ) ],
      coas: [],
      strainDescriptions: [],
    }, BASE_URL );
    expect( grouping.chapters.map( chapter => chapter.available ) ).toEqual( [ true, false ] );
  });

  test( "a COA matched by strain name but not url is unmatched; a trailing-slash difference is a mismatch", () => {
    const wrongUrl = { ...makeCoaFor( "glitter-bomb", "1" ), strain: { name: "Glitter Bomb", url: `${BASE_URL}/strains/glitter-bomb` } };
    const grouping = groupDropStrains({
      products: [ makeProduct( "GB", glitterBomb, true ) ],
      coas: [ wrongUrl ],
      strainDescriptions: [],
    }, BASE_URL );
    expect( grouping.chapters[0].coa ).toBeUndefined();
    expect( grouping.unmatchedCoas ).toEqual( [ wrongUrl ] );
  });

  test( "a strainless product lands in a trailing unassigned chapter with no lineage or COA", () => {
    const grouping = groupDropStrains({
      products: [ makeProduct( "Mystery", undefined, true ), makeProduct( "GB", glitterBomb, true ) ],
      coas: [],
      strainDescriptions: [],
    }, BASE_URL );
    expect( grouping.chapters.map( chapter => chapter.strain.key ) ).toEqual( [ glitterBomb._id, UNASSIGNED_STRAIN_KEY ] );
    expect( grouping.chapters[1].strain.name ).toBe( UNASSIGNED_STRAIN_HEADING );
    expect( grouping.chapters[1].anchorId ).toBe( "strain-unassigned" );
    expect( grouping.chapters[1].strain.lineage ).toBeUndefined();
  });

  test( "colors follow chapter position and wrap after four", () => {
    const strains = [ "a", "b", "c", "d", "e" ].map( slug => makeStrain( slug.toUpperCase(), slug ) );
    const grouping = groupDropStrains({
      products: strains.map( strain => makeProduct( strain.name, strain, true ) ),
      coas: [],
      strainDescriptions: [],
    }, BASE_URL );
    expect( grouping.chapters.map( chapter => chapter.color ) ).toEqual( [ ...DROP_CHAPTER_COLORS, DROP_CHAPTER_COLORS[0] ] );
    expect( DROP_CHAPTER_COLORS ).toHaveLength( 4 );
  });

  test( "throws when two COAs claim the same strain", () => {
    expect( () => groupDropStrains({
      products: [ makeProduct( "GB", glitterBomb, true ) ],
      coas: [ makeCoaFor( "glitter-bomb", "1" ), makeCoaFor( "glitter-bomb", "2" ) ],
      strainDescriptions: [],
    }, BASE_URL ) ).toThrow( "two certificates claim https://nw-local.com/strains/glitter-bomb/" );
  });
});

describe( "drop helpers", () => {
  test( "strainPageUrl carries the trailing slash the COA publisher writes", () => {
    expect( strainPageUrl( BASE_URL, { current: "super-boof" }) ).toBe( "https://nw-local.com/strains/super-boof/" );
  });

  test( "dropCoaManifest sorts source ids and does not mutate its input", () => {
    const coas = [ makeCoaFor( "b", "2" ), makeCoaFor( "a", "1" ) ];
    expect( dropCoaManifest( coas ) ).toEqual( [ "00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002" ] );
    expect( coas[0].sourceId ).toBe( "00000000-0000-4000-8000-000000000002" );
  });

  test( "dropCoaHref points at the public certificate route", () => {
    expect( dropCoaHref( DROP_COA_SOURCE_ID ) ).toBe( `/coas/${DROP_COA_SOURCE_ID}/` );
  });

  test( "formatDropTotalThc hugs a percent sign and spaces any other unit", () => {
    expect( formatDropTotalThc({ value: "29.39", unit: "%" }) ).toBe( "29.39% Total THC" );
    expect( formatDropTotalThc({ value: "293.9", unit: "mg/g" }) ).toBe( "293.9 mg/g Total THC" );
  });
});
