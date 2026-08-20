// The GA4 measurement ID is a public identifier, not a credential, and it is
// checked in deliberately.
//
// It ships in the HTML of every page — `<script async
// src="https://www.googletagmanager.com/gtag/js?id=G-...">` — so anyone can read
// it with View Source, and Astro's own `PUBLIC_` env prefix means exactly that:
// inlined into the client bundle. It was nonetheless stored as a GitHub Actions
// secret and a .env line, which bought no secrecy and cost real things: it was
// invisible to anyone without console access, it never appeared in a diff or a
// review, and it was one more file a fresh git worktree silently lacked. The
// README told contributors to put it in .env while .env.example never listed
// it, so following the setup instructions produced a build that threw.
//
// Nothing here grants access. Writing data to a GA4 property requires the
// Measurement Protocol api_secret, which is a real credential and must never be
// checked in; reading reports requires an authenticated Analytics account.
// A measurement ID alone lets a third party send junk events to the property —
// true of every GA4 site on the web, since the ID is public by construction, and
// not a thing hiding it in CI secrets ever prevented.
//
// The genuinely secret build input is SANITY_API_TOKEN, which stays in .env and
// in CI secrets. SANITY_PROJECT_ID and SANITY_DATASET were already checked into
// .env.example on the same reasoning.
export const GOOGLE_ANALYTICS_ID = "G-BXD75PELF6";
