import { describe, expect, test } from "vitest";
import {
  CULTIVERA_MARKET_SLUG,
  ORDER_ON_CULTIVERA_LABEL,
  cultiveraMarketUrl,
  cultiveraMarketUrlFor,
} from "./cultivera.ts";

describe( "cultiveraMarketUrl", () => {
  test( "builds the gated marketplace product url under the constant storefront slug", () => {
    expect( cultiveraMarketUrl( "14303" ) ).toBe(
      `https://wa.cultiveramarket.com/bm/market/${CULTIVERA_MARKET_SLUG}/product/14303`,
    );
  });

  test( "the storefront slug is Northwest Local's", () => {
    expect( CULTIVERA_MARKET_SLUG ).toBe( "northwest-local-cannabis-llc" );
  });

  test( "the button carries no wholesale caveat", () => {
    expect( ORDER_ON_CULTIVERA_LABEL ).toBe( "Order on Cultivera" );
  });
});

describe( "cultiveraMarketUrlFor", () => {
  test( "returns a url for a present id", () => {
    expect( cultiveraMarketUrlFor( "14307" ) ).toBe(
      "https://wa.cultiveramarket.com/bm/market/northwest-local-cannabis-llc/product/14307",
    );
  });

  test( "trims surrounding whitespace before building the url", () => {
    expect( cultiveraMarketUrlFor( " 14305 " ) ).toBe(
      "https://wa.cultiveramarket.com/bm/market/northwest-local-cannabis-llc/product/14305",
    );
  });

  test.each( [
    [ "undefined", undefined ],
    [ "null", null ],
    [ "empty string", "" ],
    [ "whitespace only", "   " ],
  ] )( "returns undefined for %s so no button renders", ( _label, value ) => {
    expect( cultiveraMarketUrlFor( value ) ).toBeUndefined();
  });
});
