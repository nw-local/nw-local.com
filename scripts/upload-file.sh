#!/usr/bin/env bash
#
# Upload a file asset (e.g. an MP4 video) to Sanity and return the asset
# document as JSON. This is the file-asset counterpart to upload-image.sh:
# images go to /assets/images, everything else (video, audio, PDF) to
# /assets/files, and @sanity/image-url cannot build urls for the latter, so the
# frontend reads the file asset's `url` directly.
#
# Expects SANITY_PROJECT_ID, SANITY_DATASET, and SANITY_WRITE_TOKEN in env
# (provided automatically when invoked via `make upload-file`).
#
# Usage:
#   make upload-file FILE=path/to/clip.mp4
#   make upload-file FILE=path/to/clip.mp4 LABEL="Booth clip" DESCRIPTION="Alt text here"

set -euo pipefail

FILE="${1:?Usage: upload-file.sh <file> [label] [description]}"
LABEL="${2:-}"
DESCRIPTION="${3:-}"

if [[ ! -f "$FILE" ]]; then
  echo "Error: file not found: $FILE" >&2
  exit 1
fi

: "${SANITY_PROJECT_ID:?SANITY_PROJECT_ID is required}"
: "${SANITY_DATASET:?SANITY_DATASET is required}"
: "${SANITY_WRITE_TOKEN:?SANITY_WRITE_TOKEN is required — create an Editor token at sanity.io/manage}"

FILENAME=$(basename "$FILE")
CONTENT_TYPE=$(file --brief --mime-type "$FILE")

# Browsers only reliably play H.264/AAC in an MP4 container. A phone records
# .mov/HEVC, which uploads fine but will not play in <video>, so guard the
# common mistake at the point of upload rather than discovering it on the page.
if [[ "$CONTENT_TYPE" == video/* && "$CONTENT_TYPE" != "video/mp4" ]]; then
  echo "⚠  Warning: ${FILENAME} is ${CONTENT_TYPE}, not video/mp4." >&2
  echo "   Most browsers will not play it in a <video> element." >&2
  echo "   Transcode to H.264/AAC MP4 first (ffmpeg -c:v libx264 -c:a aac -movflags +faststart)." >&2
fi

urlencode() {
  python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1]))" "$1"
}

PARAMS="filename=$(urlencode "$FILENAME")"
if [[ -n "$LABEL" ]]; then
  PARAMS="${PARAMS}&label=$(urlencode "$LABEL")"
fi
if [[ -n "$DESCRIPTION" ]]; then
  PARAMS="${PARAMS}&description=$(urlencode "$DESCRIPTION")"
fi

curl --silent --fail --show-error \
  -X POST \
  -H "Authorization: Bearer ${SANITY_WRITE_TOKEN}" \
  -H "Content-Type: ${CONTENT_TYPE}" \
  --data-binary "@${FILE}" \
  "https://${SANITY_PROJECT_ID}.api.sanity.io/v2024-01-01/assets/files/${SANITY_DATASET}?${PARAMS}"
