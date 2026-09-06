import { describe, expect, test } from "vitest";
import {
  DISCLOSURE_PUBLIC_CODE,
  DISCLOSURE_LOT_UUID,
  makeNoneAppliedDisclosureFixture,
  makePesticideDisclosureFixture,
} from "../../scripts/fixtures/pesticide-disclosure.ts";
import {
  assertPesticideDisclosure,
  DISCLOSURE_BY_PUBLIC_CODE_QUERY,
  fetchPesticideDisclosuresFromDestination,
  normalizeDisclosureFetchResult,
  normalizeDisclosureFetchResults,
  preparePesticideDisclosureStaticPaths,
  resolvePesticideDisclosureRouteDocument,
} from "./pesticide-disclosure.ts";

function makeDestinationDocument() {
  return {
    _id: `disclosure.${DISCLOSURE_LOT_UUID}`,
    _type: "pesticideDisclosure",
    _rev: "revision-1",
    _createdAt: "2026-09-05T00:00:00Z",
    _updatedAt: "2026-09-05T00:00:00Z",
    publicCode: DISCLOSURE_PUBLIC_CODE,
    strain: "Blue Dream",
    grade: "Top Shelf",
    noneApplied: false,
    applications: [
      {
        _key: "application-1",
        _type: "pesticideApplication",
        productName: "Regalia",
        activeIngredient: "Reynoutria sachalinensis extract",
        epaRegistrationNumber: "84059-3",
        appliedOn: "2026-07-14",
        targetPest: "Powdery mildew",
      },
      {
        _key: "application-2",
        _type: "pesticideApplication",
        productName: "Grandevo",
        activeIngredient: "Chromobacterium subtsugae strain PRAA4-1",
        epaRegistrationNumber: "84059-15",
        appliedOn: "2026-07-28",
        targetPest: "Spider mites",
      },
    ],
  };
}

function makeFetchResult() {
  return { disclosure: makePesticideDisclosureFixture(), destination: makeDestinationDocument() };
}

describe( "pesticide disclosure publication contract", () => {
  test( "requires the deterministic disclosure. id prefix", () => {
    expect( () => assertPesticideDisclosure({ ...makePesticideDisclosureFixture(), _id: "generated-id" }) )
      .toThrow( /_id must start with disclosure\./ );
  });

  test( "rejects a publicCode that is not NWL- plus five Crockford base32 chars", () => {
    expect( () => assertPesticideDisclosure({ ...makePesticideDisclosureFixture(), publicCode: "2043117" }) )
      .toThrow( /publicCode must be NWL-/ );
  });

  test( "rejects noneApplied true with applications present", () => {
    expect( () => assertPesticideDisclosure({ ...makeNoneAppliedDisclosureFixture(), applications: makePesticideDisclosureFixture().applications }) )
      .toThrow( /noneApplied must be true iff applications is empty/ );
  });

  test( "rejects noneApplied false with an empty application list", () => {
    expect( () => assertPesticideDisclosure({ ...makePesticideDisclosureFixture(), applications: [] }) )
      .toThrow( /noneApplied must be true iff applications is empty/ );
  });

  test( "accepts a valid none-applied disclosure", () => {
    expect( () => assertPesticideDisclosure( makeNoneAppliedDisclosureFixture() ) ).not.toThrow();
  });

  test.each( [
    [ "document", ( destination: ReturnType<typeof makeDestinationDocument> ) => Object.assign( destination, { applicatorName: "person" }) ],
    [ "application", ( destination: ReturnType<typeof makeDestinationDocument> ) => Object.assign( destination.applications[0], { applicationRate: "private" }) ],
  ] )( "rejects an unknown stored %s field before returning the buyer projection", ( _level, mutate ) => {
    const fetchResult = makeFetchResult();
    mutate( fetchResult.destination );
    expect( () => normalizeDisclosureFetchResult( fetchResult ) ).toThrow( /unknown destination field/ );
  });

  test( "does not expose the audited destination document in the public disclosure", () => {
    expect( normalizeDisclosureFetchResult( makeFetchResult() ) ).toEqual( makePesticideDisclosureFixture() );
  });

  test( "executes the buyer projection with the destination audit at the fetch boundary", async () => {
    const queries: string[] = [];
    const result = await fetchPesticideDisclosuresFromDestination( async query => {
      queries.push( query );
      return [ makeFetchResult() ];
    });
    expect( result ).toEqual( [ makePesticideDisclosureFixture() ] );
    expect( queries[0] ).toContain( '"disclosure": {' );
    expect( queries[0] ).toContain( '"destination": @' );
    expect( queries[0] ).not.toContain( "$publicCode" ); // the list query, not the by-code query
  });

  test( "looks a lot up by publicCode case-insensitively", () => {
    expect( DISCLOSURE_BY_PUBLIC_CODE_QUERY ).toContain( "lower(publicCode) == lower($publicCode)" );
  });

  test( "rejects duplicate publicCode returned by the list query", () => {
    expect( () => normalizeDisclosureFetchResults( [ makeFetchResult(), makeFetchResult() ] ) )
      .toThrow( /duplicate pesticide disclosure list result/ );
  });

  test( "prepares unique static paths and rejects duplicates", () => {
    const disclosure = makePesticideDisclosureFixture();
    expect( preparePesticideDisclosureStaticPaths( [ disclosure ] ) ).toEqual( [
      { params: { code: DISCLOSURE_PUBLIC_CODE }, props: { disclosure } },
    ] );
    expect( () => preparePesticideDisclosureStaticPaths( [ disclosure, disclosure ] ) )
      .toThrow( /duplicate pesticide disclosure static route/ );
  });

  test( "validates route identity and returns the direct fetch", () => {
    const disclosure = makePesticideDisclosureFixture();
    expect( () => resolvePesticideDisclosureRouteDocument( "NWL-00000", disclosure ) )
      .toThrow( /build data drifted/ );
    expect( resolvePesticideDisclosureRouteDocument( DISCLOSURE_PUBLIC_CODE, disclosure ) ).toBe( disclosure );
  });
});
