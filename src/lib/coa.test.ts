import { describe, expect, test } from "vitest";
import { makeCoaFixture, COA_SOURCE_ID } from "../../scripts/fixtures/coa.ts";
import {
  assertCoa,
  fetchCoasFromDestination,
  normalizeCoaFetchResult,
  normalizeCoaFetchResults,
  prepareCoaStaticPaths,
  resolveCoaRouteDocument,
} from "./coa.ts";

function makeDestinationDocument() {
  return {
    _id: `coa.${COA_SOURCE_ID}`,
    _type: "coa",
    _rev: "revision-1",
    _createdAt: "2026-09-01T21:15:30Z",
    _updatedAt: "2026-09-01T21:15:30Z",
    sourceId: COA_SOURCE_ID,
    labResultId: "2155470281845367208-18-2026",
    sampleId: "SAMPLE-1",
    status: "pass",
    publishedAt: "2026-09-01T21:15:30Z",
    totalThc: { _type: "object", label: "Total THC (calculated)", value: "29.39", unit: "%" },
    waterActivity: { _type: "object", label: "Water activity", value: "0", unit: "aw" },
    panels: [
      {
        _key: "panel-1",
        _type: "object",
        name: "Cannabinoids",
        status: "pass",
        metrics: [
          {
            _key: "metric-1",
            _type: "object",
            name: "D9-THC",
            value: "0.12",
            unit: "%",
            status: "fail",
          },
        ],
      },
      {
        _key: "panel-2",
        _type: "object",
        name: "Microbial",
        status: "pass",
        metrics: [
          {
            _key: "metric-2",
            _type: "object",
            name: "Total yeast and mold",
            value: "0",
            unit: "CFU/g",
          },
        ],
      },
    ],
    strain: {
      _type: "object",
      name: "Test Strain",
      url: "https://nw-local.com/strains/test-strain/",
    },
    certificate: {
      _type: "object",
      filename: "certificate.pdf",
      sha256: "a".repeat( 64 ),
      asset: {
        _type: "file",
        asset: { _ref: "file-example-pdf", _type: "reference" },
      },
    },
  };
}

function makeFetchResult() {
  return { coa: makeCoaFixture(), destination: makeDestinationDocument() };
}

describe( "COA publication contract", () => {
  test( "rejects a malformed publication timestamp", () => {
    expect( () => assertCoa({ ...makeCoaFixture(), publishedAt: "2026-09-01 21:15:30" }) )
      .toThrow( /publishedAt.*RFC3339/ );
  });

  test( "requires the deterministic Sanity document id", () => {
    expect( () => assertCoa({ ...makeCoaFixture(), _id: "generated-id" }) )
      .toThrow( /must equal coa\./ );
  });

  test.each( [
    [ "document", ( destination: ReturnType<typeof makeDestinationDocument> ) => Object.assign( destination, { rawPayload: {} }) ],
    [ "reading", ( destination: ReturnType<typeof makeDestinationDocument> ) => Object.assign( destination.totalThc, { sourceJson: {} }) ],
    [ "panel", ( destination: ReturnType<typeof makeDestinationDocument> ) => Object.assign( destination.panels[0], { operator: "person" }) ],
    [ "metric", ( destination: ReturnType<typeof makeDestinationDocument> ) => Object.assign( destination.panels[0].metrics[0], { storageKey: "private/key" }) ],
    [ "strain", ( destination: ReturnType<typeof makeDestinationDocument> ) => Object.assign( destination.strain, { internalId: "private" }) ],
    [ "certificate", ( destination: ReturnType<typeof makeDestinationDocument> ) => Object.assign( destination.certificate, { privateUrl: "https://private.example.test" }) ],
  ] )( "rejects an unknown stored %s field before returning the buyer projection", ( _level, mutateDestination ) => {
    const fetchResult = makeFetchResult();
    mutateDestination( fetchResult.destination );

    expect( () => normalizeCoaFetchResult( fetchResult ) ).toThrow( /unknown destination field/ );
  });

  test( "does not expose the audited destination document in the public COA", () => {
    expect( normalizeCoaFetchResult( makeFetchResult() ) ).toEqual( makeCoaFixture() );
  });

  test( "executes the buyer projection with the destination audit at the fetch boundary", async () => {
    const queries: string[] = [];
    const result = await fetchCoasFromDestination( async query => {
      queries.push( query );
      return [ makeFetchResult() ];
    });

    expect( result ).toEqual( [ makeCoaFixture() ] );
    expect( queries ).toHaveLength( 1 );
    expect( queries[0] ).toContain( '"coa": {' );
    expect( queries[0] ).toContain( '"destination": @' );
    expect( queries[0] ).toContain(
      'certificate { filename, sha256, "url": asset.asset->url }',
    );
    expect( queries[0] ).not.toContain( "..." );
  });

  test( "rejects duplicate source routes returned by the list query", () => {
    expect( () => normalizeCoaFetchResults( [ makeFetchResult(), makeFetchResult() ] ) )
      .toThrow( /duplicate COA source ID/ );
  });

  test( "prepares unique static paths from complete validated COAs", () => {
    const coa: unknown = makeCoaFixture();
    assertCoa( coa );
    expect( prepareCoaStaticPaths( [ coa ] ) ).toEqual( [
      { params: { sourceId: COA_SOURCE_ID }, props: { coa } },
    ] );
    expect( () => prepareCoaStaticPaths( [ coa, coa ] ) )
      .toThrow( /duplicate COA static route/ );
  });

  test( "validates route identity and returns the complete direct fetch", () => {
    const directCoa: unknown = { ...makeCoaFixture(), sampleId: "SAMPLE-2" };
    assertCoa( directCoa );
    expect( () => resolveCoaRouteDocument( "00000000-0000-4000-9000-000000000002", directCoa ) )
      .toThrow( /build data drifted/ );
    expect( resolveCoaRouteDocument( COA_SOURCE_ID, directCoa ) ).toBe( directCoa );
  });
});
