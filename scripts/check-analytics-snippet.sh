#!/usr/bin/env bash
#
# Fail if the built pages ship a Google Analytics snippet that cannot record hits.
#
# gtag.js does not execute the dataLayer entries it finds; it inspects them, and
# it only treats an entry as a gtag *command* when that entry is an `arguments`
# object. Google's published snippet therefore uses
# `function gtag(){ dataLayer.push(arguments) }` on purpose. Rewriting it to rest
# params -- `function gtag( ...args ){ dataLayer.push( args ) }` -- pushes a plain
# Array, which gtag.js reads as legacy GTM-style data and ignores. That is exactly
# what commit c154186 did while reformatting the file to house style.
#
# The resulting failure is invisible to every other check in this repo: ESLint
# passes (prefer-rest-params is not enabled), `astro check` passes, the build
# succeeds, the link checker is happy, the gtag.js request still returns 200 and
# google_tag_data still initialises in the page. The only observable symptom is
# the *absence* of a request to google-analytics.com/g/collect -- an absence no
# existing job was looking for. It went unnoticed from 2026-05-01 to 2026-08-19.
#
# This check therefore asserts on the built HTML rather than on the source: what
# matters is the shape of the snippet that actually reaches a browser.
#
# Usage:
#   ./scripts/check-analytics-snippet.sh [dist-dir]   # defaults to ./dist

set -euo pipefail

DIST="${1:-dist}"

if [ ! -d "$DIST" ]; then
  echo "error: '$DIST' is not a directory -- build first (make build)" >&2
  exit 1
fi

# Whitespace is stripped before matching so that a reformat of the snippet's
# spacing stays passing while a change to its *semantics* fails. House style
# writes `push( arguments )`, Google writes `push(arguments)`, and both are
# correct; only the identifier being pushed decides whether hits are recorded.
normalise() { tr -d ' \t\n\r'; }

pages_total=0
pages_missing_loader=0
pages_broken_push=0
pages_missing_global=0
failures=()

# grep -o | wc -l, never grep -c: Astro minifies each page onto a single line, so
# grep -c reports 1 for a page containing forty matches and 1 for a page
# containing one. This repo has no test framework, which makes grep assertions
# against dist/ the whole automated verification surface -- a miscounted
# assertion here reads as satisfied for the wrong reason.
occurrences() { printf '%s' "$1" | grep -o -- "$2" | wc -l | tr -d ' '; }

while IFS= read -r page; do
  pages_total=$(( pages_total + 1 ))
  flat="$( normalise < "$page" )"

  if [ "$( occurrences "$flat" 'googletagmanager\.com/gtag/js?id=G-' )" -eq 0 ]; then
    pages_missing_loader=$(( pages_missing_loader + 1 ))
    failures+=( "$page: no gtag.js loader with a G- measurement id" )
  fi

  if [ "$( occurrences "$flat" 'dataLayer\.push(arguments)' )" -eq 0 ]; then
    pages_broken_push=$(( pages_broken_push + 1 ))
    failures+=( "$page: gtag() does not push an arguments object -- no hit will be sent" )
  fi

  # define:vars wraps the inline script in an IIFE, so the snippet's `function
  # gtag` is closure-scoped instead of global. Without an explicit assignment
  # every later gtag( "event", ... ) call throws ReferenceError, which is a
  # second silent failure waiting on the first line of event tracking anyone adds.
  if [ "$( occurrences "$flat" 'window\.gtag=gtag' )" -eq 0 ]; then
    pages_missing_global=$(( pages_missing_global + 1 ))
    failures+=( "$page: window.gtag is never assigned -- event tracking would throw" )
  fi
done < <( find "$DIST" -name '*.html' -type f )

if [ "$pages_total" -eq 0 ]; then
  echo "error: no HTML files under '$DIST'" >&2
  exit 1
fi

if [ "${#failures[@]}" -gt 0 ]; then
  printf '%s\n' "${failures[@]}" >&2
  echo >&2
  echo "Analytics snippet check FAILED across $pages_total page(s):" >&2
  echo "  missing loader:      $pages_missing_loader" >&2
  echo "  broken gtag push:    $pages_broken_push" >&2
  echo "  missing window.gtag: $pages_missing_global" >&2
  exit 1
fi

echo "Analytics snippet OK on all $pages_total page(s)"
