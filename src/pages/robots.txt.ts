import type { APIRoute } from "astro";
import { requireSiteUrl, normalizeSiteUrl } from "../lib/jsonld";

// Generated rather than committed as public/robots.txt so the absolute Sitemap
// URL derives from `site` in astro.config.mjs, the same single source of truth
// the canonical tags, the sitemap itself, and the JSON-LD all read. A static
// file would reintroduce exactly the hardcoded-host duplication that pointed
// every canonical URL at the redirecting www host until #58.
//
// The Sitemap directive has to be absolute — the robots.txt spec gives it no
// base to resolve against, so a relative path there is silently ignored, unlike
// the Disallow/Allow rules above it, which are path-only by definition.
export const GET: APIRoute = ({ site }) => {
  const siteUrl = normalizeSiteUrl( requireSiteUrl( site ) );

  const body = [
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${siteUrl}/sitemap-index.xml`,
    "",
  ].join( "\n" );

  return new Response( body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
