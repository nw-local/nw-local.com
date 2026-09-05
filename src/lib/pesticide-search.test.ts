import { describe, expect, test } from "vitest";
import { filterPesticideDisclosures } from "./pesticide-search.ts";

const RECORDS = [
  { lotCultiveraId: "2043117", strain: "Blue Dream", grade: "Top Shelf" },
  { lotCultiveraId: "2051002", strain: "Gelato #33", grade: "Value" },
];

describe( "pesticide disclosure search", () => {
  test( "matches on the Cultivera number", () => {
    expect( filterPesticideDisclosures( RECORDS, "2043117" ) ).toEqual( [ "2043117" ] );
  });
  test( "matches on strain, case-insensitively", () => {
    expect( filterPesticideDisclosures( RECORDS, "gelato" ) ).toEqual( [ "2051002" ] );
  });
  test( "returns every id for an empty query", () => {
    expect( filterPesticideDisclosures( RECORDS, "  " ) ).toEqual( [ "2043117", "2051002" ] );
  });
  test( "returns nothing for an unrelated query", () => {
    expect( filterPesticideDisclosures( RECORDS, "zzzz" ) ).toEqual( [] );
  });
});
