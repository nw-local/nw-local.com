import { describe, expect, test } from "vitest";
import { assertDropCoa, assertDropCoas } from "./drops.ts";

export const DROP_COA_SOURCE_ID = "00000000-0000-4000-8000-000000000001";

export function makeDropCoaFixture() {
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
    delete ( bare as Record<string, unknown> )[ "totalThc" ];
    delete ( bare as Record<string, unknown> )[ "strain" ];
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
