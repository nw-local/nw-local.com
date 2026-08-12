import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { getBlogPosts, getSiteSettings } from "../lib/sanity";

// @astrojs/rss injects customData verbatim, so anything interpolated into it has
// to be escaped here. An unescaped "&" in a name produces a malformed feed that
// strict readers reject outright.
const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&apos;",
};

function escapeXml( value: string ): string {
  return value.replace( /[&<>"']/g, character => XML_ESCAPES[ character ] );
}

export async function GET( context: APIContext ) {
  const settings = await getSiteSettings();
  const posts = await getBlogPosts() ?? [];

  return rss({
    title: settings?.siteTitle ?? "Northwest Local Cannabis",
    description: settings?.siteDescription ?? "Washington State licensed cannabis producer and processor.",
    site: context.site!.toString(),
    xmlns: { dc: "http://purl.org/dc/elements/1.1/" },
    items: posts.map( post => ({
      title: post.title,
      pubDate: new Date( post.publishedAt ),
      description: post.description ?? "",
      link: `/blog/${post.slug.current}/`,
      customData: post.author
        ? `<dc:creator>${escapeXml( post.author.name )}</dc:creator>`
        : undefined,
    }) ),
  });
}
