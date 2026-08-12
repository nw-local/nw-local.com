// Author profile links are stored in Sanity as bare URL strings, because
// schema.org's `sameAs` takes URLs and nothing else. Labels are therefore derived
// here rather than authored alongside each link — an editor pasting a profile URL
// should not also have to type "Instagram" and get it capitalised consistently.
const PLATFORM_LABELS: Record<string, string> = {
  "instagram.com": "Instagram",
  "twitter.com": "Twitter",
  "x.com": "Twitter",
  "tiktok.com": "TikTok",
  "linkedin.com": "LinkedIn",
  "facebook.com": "Facebook",
  "youtube.com": "YouTube",
  "github.com": "GitHub",
  "soundcloud.com": "SoundCloud",
  "bandcamp.com": "Bandcamp",
  "mixcloud.com": "Mixcloud",
  "spotify.com": "Spotify",
};

function hostWithoutWww( host: string ): string {
  return host.startsWith( "www." ) ? host.slice( 4 ) : host;
}

/**
 * Human-readable label for a profile URL.
 *
 * Recognised platforms render as their brand name ("Instagram"); anything else
 * renders as its bare hostname ("ben-petty.com"), which reads better for a
 * personal domain than a guessed title would.
 */
export function profileLinkLabel( url: string ): string {
  let host: string;

  try {
    host = hostWithoutWww( new URL( url ).hostname.toLowerCase() );
  } catch {
    // Sanity validates these as `type: 'url'`, so an unparseable value means the
    // content and the schema have diverged. Failing the build is the only way an
    // operator finds out — a silently skipped link looks identical to no link.
    throw new Error(
      `Unable to parse profile URL "${url}". Expected an absolute URL with a scheme, e.g. https://example.com.`,
    );
  }

  return PLATFORM_LABELS[ host ] ?? host;
}
