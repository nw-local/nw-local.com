// The gated Cultivera marketplace deep-link for a strain's "Order on Cultivera"
// buy button. The URL shape is spelled here once so every surface that renders
// the button (the drop page, the products index, the strain page) builds an
// identical link and cannot drift.
//
// The page is intentionally gated: a retail buyer with marketplace access is
// sent straight to purchase, and a consumer without it hits a login wall by
// design. The label carries no "wholesale" caveat for that reason.
//
// The market slug is a constant — every product lives under one storefront. The
// per-strain product id is content (strain.cultiveraMarketProductId); a strain
// with no id gets no button.

export const CULTIVERA_MARKET_SLUG = "northwest-local-cannabis-llc";
export const ORDER_ON_CULTIVERA_LABEL = "Order on Cultivera";

const CULTIVERA_MARKET_BASE = "https://wa.cultiveramarket.com/bm/market";

export function cultiveraMarketUrl( productId: string ): string {
  return `${CULTIVERA_MARKET_BASE}/${CULTIVERA_MARKET_SLUG}/product/${productId}`;
}

// Resolve a strain's optional marketplace id to a buy URL, or undefined when the
// strain has no id (or only whitespace). Callers render the button iff this is
// defined, so the emptiness test lives here rather than in three templates.
export function cultiveraMarketUrlFor( productId: string | undefined | null ): string | undefined {
  const trimmed = productId?.trim();
  return trimmed ? cultiveraMarketUrl( trimmed ) : undefined;
}
