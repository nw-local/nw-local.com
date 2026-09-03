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

test( "the product image is the buy link, quietly, with no visible marketplace label or button", async () => {
  const html = await renderCard( makeProduct() );
  expect( html ).toContain( `class="card-image-frame"` );
  expect( html ).toMatch( new RegExp( `<a[^>]*class="card-image-frame"[^>]*href="${MARKET_URL.replace( /[/]/g, "\\/" )}"` ) );
  // Accessible name promotes the product, not the marketplace, and nothing
  // visible advertises Cultivera on the card.
  expect( html ).toContain( `aria-label="Order Glitter Bomb Eighth"` );
  expect( html ).not.toContain( "Cultivera" );
  // The old filled button is gone, and there is exactly one buy link.
  expect( html ).not.toContain( "product-order-link" );
  expect( html ).not.toContain( `class="cultivera-textlink"` );
  expect( html.split( "data-order-cultivera" ).length - 1 ).toBe( 1 );
});

test( "a product with no image renders no buy link, since the photo is the only one", async () => {
  const product = makeProduct();
  delete product.image;
  delete product.strain!.heroImage;
  const html = await renderCard( product );
  // The buy link lives on the photo alone; with no photo there is nothing to
  // attach it to, and we do not fall back to a button or a text link.
  expect( html ).not.toContain( "data-order-cultivera" );
  expect( html ).not.toContain( "cultivera-textlink" );
  expect( html ).not.toContain( `class="card-image-frame"` );
});

test( "a product whose strain has no marketplace id shows the image but no buy link", async () => {
  const product = makeProduct();
  delete product.strain!.cultiveraMarketProductId;
  const html = await renderCard( product );
  // The image still renders inside its frame, but the frame is a plain div, not
  // an anchor: no buy URL and no fallback link.
  expect( html ).toContain( "<img" );
  expect( html ).not.toMatch( /<a[^>]*class="card-image-frame"/ );
  expect( html ).not.toContain( "data-order-cultivera" );
  expect( html ).not.toContain( "cultivera-textlink" );
});
