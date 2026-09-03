import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { expect, test } from "vitest";
import type { ProductSummary } from "../lib/sanity";
import ProductCard from "./ProductCard.astro";

const MARKET_URL = "https://wa.cultiveramarket.com/bm/market/northwest-local-cannabis-llc/product/14303";
const IMAGE_REF = "image-abc123-600x375-jpg";

function makeProduct( overrides: Partial<ProductSummary> = {}): ProductSummary {
  return {
    _id: "p1",
    name: "Glitter Bomb Eighth",
    slug: { current: "glitter-bomb-eighth" },
    category: "flower",
    weight: "3.5g",
    available: true,
    image: { asset: { _ref: IMAGE_REF }, alt: "Glitter Bomb jar" },
    strain: {
      _id: "s1",
      name: "Glitter Bomb",
      slug: { current: "glitter-bomb" },
      strainType: "hybrid",
      cultiveraMarketProductId: "14303",
    },
    ...overrides,
  };
}

async function renderCard( product: ProductSummary ): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString( ProductCard, { props: { ...product } });
}

test( "the product image is the buy link, with a caption and no filled order button", async () => {
  const html = await renderCard( makeProduct() );
  expect( html ).toContain( `class="card-image-frame"` );
  expect( html ).toMatch( new RegExp( `<a[^>]*class="card-image-frame"[^>]*href="${MARKET_URL.replace( /[/]/g, "\\/" )}"` ) );
  expect( html ).toContain( `aria-label="Glitter Bomb Eighth: Order on Cultivera"` );
  expect( html ).toContain( `class="cultivera-photo-cta"` );
  // The old filled button is gone, and there is exactly one buy link.
  expect( html ).not.toContain( "product-order-link" );
  expect( html ).not.toContain( `class="cultivera-textlink"` );
  expect( html.split( "data-order-cultivera" ).length - 1 ).toBe( 1 );
});

test( "a product with no image falls back to a single subtle text buy link", async () => {
  const product = makeProduct();
  delete product.image;
  delete product.strain!.heroImage;
  const html = await renderCard( product );
  expect( html ).toContain( `class="cultivera-textlink"` );
  expect( html ).toContain( `href="${MARKET_URL}"` );
  expect( html ).not.toContain( `class="card-image-frame"` );
  expect( html.split( "data-order-cultivera" ).length - 1 ).toBe( 1 );
});

test( "a product whose strain has no marketplace id shows the image but no buy link", async () => {
  const product = makeProduct();
  delete product.strain!.cultiveraMarketProductId;
  const html = await renderCard( product );
  // The image still renders inside its frame, but the frame is a plain div, not
  // an anchor: no buy URL, no caption, no fallback link.
  expect( html ).toContain( "<img" );
  expect( html ).not.toMatch( /<a[^>]*class="card-image-frame"/ );
  expect( html ).not.toContain( "data-order-cultivera" );
  expect( html ).not.toContain( "cultivera-photo-cta" );
  expect( html ).not.toContain( "Order on Cultivera" );
});
