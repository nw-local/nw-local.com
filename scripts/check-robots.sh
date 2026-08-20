#!/usr/bin/env bash
#
# Fail if the built site has no robots.txt, or if its Sitemap directive cannot
# lead a crawler to this build's sitemap.
#
# robots.txt is the conventional way a crawler discovers a sitemap. This site
# shipped without one at all until 2026-08-20 — https://nw-local.com/robots.txt
# returned the 404 page — which nothing noticed, because a file that was never
# created cannot regress and no check was looking for its absence.
#
# Two things are asserted beyond existence:
#
# 1. The Sitemap directive is absolute. robots.txt gives it no base URL to
#    resolve against, so a relative path there is silently ignored, unlike the
#    Allow/Disallow rules in the same file, which are path-only by definition.
#    A relative Sitemap line therefore looks fine and does nothing.
#
# 2. Its host matches the host the sitemap itself uses in <loc>. Both derive
#    from `site` in astro.config.mjs today, so they agree by construction — but
#    that config named the redirecting www host until #58, and this check is
#    written against the sitemap rather than a hardcoded literal so it keeps
#    working if the domain changes and still fails if the two ever diverge.
#
# Usage:
#   ./scripts/check-robots.sh [dist-dir]   # defaults to ./dist

set -euo pipefail

DIST="${1:-dist}"
ROBOTS="$DIST/robots.txt"
SITEMAP="$DIST/sitemap-0.xml"

if [ ! -f "$ROBOTS" ]; then
  echo "error: $ROBOTS missing — crawlers have no sitemap pointer" >&2
  exit 1
fi

if ! grep -qE '^Sitemap: https?://' "$ROBOTS"; then
  echo "error: $ROBOTS has no absolute Sitemap: directive (a relative one is ignored by crawlers)" >&2
  echo "--- $ROBOTS ---" >&2
  cat "$ROBOTS" >&2
  exit 1
fi

if [ ! -f "$SITEMAP" ]; then
  echo "error: $SITEMAP missing — cannot cross-check the robots.txt host" >&2
  exit 1
fi

robots_origin=$( grep -m1 '^Sitemap:' "$ROBOTS" | sed -E 's|^Sitemap: (https?://[^/]+).*|\1|' )

# `grep -o ... | head -1`, never `grep -om1`: -m1 stops after the first matching
# *line*, and the sitemap is one minified line carrying every <loc>, so -o still
# prints all of them and the variable becomes a multi-line string that can never
# equal a single origin. That mistake made this check fail on correct input and
# "pass" the mismatch case against garbage. Same family as the `grep -c` trap in
# CLAUDE.md's invariants: line counts and line limits both lie about minified files.
loc_origin=$( grep -o '<loc>https\?://[^/]*' "$SITEMAP" | head -1 | sed 's|<loc>||' )

if [ -z "$loc_origin" ]; then
  echo "error: no absolute <loc> entries in $SITEMAP" >&2
  exit 1
fi

if [ "$robots_origin" != "$loc_origin" ]; then
  echo "error: robots.txt Sitemap host ($robots_origin) disagrees with sitemap <loc> host ($loc_origin)" >&2
  exit 1
fi

echo "robots.txt OK — Sitemap directive is absolute and matches the sitemap host ($robots_origin)"
