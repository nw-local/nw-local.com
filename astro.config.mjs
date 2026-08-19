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
  integrations: [ sitemap() ],
});
