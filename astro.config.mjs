// @ts-check
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

export default defineConfig({
  // The apex, not www. This is the domain configured for GitHub Pages
  // (`gh api repos/nw-local/nw-local.com/pages` reports cname nw-local.com), and
  // www is a DNS CNAME to nw-local.github.io that Pages 301-redirects here. It
  // is the single source of truth for canonical URLs, the sitemap, OG tags, and
  // every absolute URL in the JSON-LD, so a mismatch here points all of them at
  // a host that redirects.
  site: "https://nw-local.com",
  // Slug changes for strains renamed after publication. GitHub Pages serves
  // static files with no server to redirect on, so without an entry here the
  // old URL simply 404s: every inbound link, bookmark, and search result
  // pointing at it dies silently.
  //
  // Publish the Sanity rename BEFORE merging an entry here, and never the
  // other way around. Astro's docs say configured redirects have lower
  // precedence than "matching physical page files", which reads as a promise
  // that an entry stays inert while `getStaticPaths()` is still emitting the
  // old slug. It is not: precedence is decided by route specificity, and the
  // static pattern `/strains/kacklesnatch` outranks the rest route in
  // `src/pages/strains/[...slug].astro`. The redirect wins and the real strain
  // page stops being emitted at all. A literal `strains/kacklesnatch.astro`
  // would have won; a spread route loses.
  //
  // Adding an entry ahead of the rename therefore converts a working page into
  // a redirect pointing at a slug that does not exist yet, which is a worse
  // outcome than the bare 404 it was meant to prevent. The only symptom at
  // build time is the page count dropping by one (86 -> 85 when this was
  // caught); nothing errors, and the site still builds and deploys clean.
  //
  // Entries are permanent. A redirect deleted once "enough time has passed"
  // reopens exactly the hole it was added to close.
  redirects: {
    // Renamed 2026-08-26 at the request of the genetics provider, who asked
    // that the flower not be sold under the name they supplied it under.
    "/strains/kacklesnatch": "/strains/grape-chimera",
  },
  integrations: [ sitemap() ],
});
