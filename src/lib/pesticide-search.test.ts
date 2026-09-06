import { describe, expect, test } from "vitest";
import { filterPesticideDisclosures } from "./pesticide-search.ts";

const RECORDS = [
  { publicCode: "NWL-4A7KP", strain: "Blue Dream", grade: "Top Shelf" },
  { publicCode: "NWL-9G2TX", strain: "Gelato #33", grade: "Value" },
];

describe( "pesticide disclosure search", () => {
  test( "matches on the lot code", () => {
    expect( filterPesticideDisclosures( RECORDS, "NWL-4A7KP" ) ).toEqual( [ "NWL-4A7KP" ] );
  });
  test( "matches on the lot code, case-insensitively", () => {
    expect( filterPesticideDisclosures( RECORDS, "nwl-4a7kp" ) ).toEqual( [ "NWL-4A7KP" ] );
  });
  test( "matches on strain, case-insensitively", () => {
    expect( filterPesticideDisclosures( RECORDS, "gelato" ) ).toEqual( [ "NWL-9G2TX" ] );
  });
  test( "returns every id for an empty query", () => {
    expect( filterPesticideDisclosures( RECORDS, "  " ) ).toEqual( [ "NWL-4A7KP", "NWL-9G2TX" ] );
  });
  test( "returns nothing for an unrelated query", () => {
    expect( filterPesticideDisclosures( RECORDS, "zzzz" ) ).toEqual( [] );
  });
});
