#!/usr/bin/env bash
#
# Upload an image to Sanity and return the asset document as JSON.
# Expects SANITY_PROJECT_ID, SANITY_DATASET, and SANITY_WRITE_TOKEN in env
# (provided automatically when invoked via `make upload-image`).
#
# Usage:
#   make upload-image FILE=path/to/image.jpg
#   make upload-image FILE=path/to/image.jpg LABEL="Hero shot" DESCRIPTION="Alt text here"
#   make upload-image FILE=path/to/portrait.jpg PORTRAIT_OK=1

set -euo pipefail

FILE="${1:?Usage: upload-image.sh <file> [label] [description] [portrait_ok]}"
LABEL="${2:-}"
DESCRIPTION="${3:-}"
# Hero images are cropped to landscape on strain pages, so a portrait upload is
# usually a mistake there. Author portraits are legitimately portrait, so the
# warning is opt-out rather than unconditional.
PORTRAIT_OK="${4:-}"

if [[ ! -f "$FILE" ]]; then
  echo "Error: file not found: $FILE" >&2
  exit 1
fi

# Check image dimensions and warn about aspect ratio
IMG_WIDTH=$(sips -g pixelWidth "$FILE" 2>/dev/null | awk '/pixelWidth/{print $2}')
IMG_HEIGHT=$(sips -g pixelHeight "$FILE" 2>/dev/null | awk '/pixelHeight/{print $2}')
DIMENSIONS="${IMG_WIDTH:+${IMG_WIDTH}x${IMG_HEIGHT}}"
DIMENSIONS="${DIMENSIONS:-unknown}"

if [[ "$DIMENSIONS" != "unknown" ]]; then
  IMG_WIDTH="${DIMENSIONS%x*}"
  IMG_HEIGHT="${DIMENSIONS#*x}"
  echo "Image dimensions: ${IMG_WIDTH}×${IMG_HEIGHT}" >&2
  if (( IMG_HEIGHT > IMG_WIDTH )) && [[ -z "$PORTRAIT_OK" ]]; then
    echo "⚠  Warning: Image is portrait orientation (${IMG_WIDTH}×${IMG_HEIGHT})." >&2
    echo "   Hero images display best at landscape 4:3 (minimum 1200×900)." >&2
    echo "   Portrait images will be cropped on the strain page." >&2
  fi
fi

: "${SANITY_PROJECT_ID:?SANITY_PROJECT_ID is required}"
: "${SANITY_DATASET:?SANITY_DATASET is required}"
: "${SANITY_WRITE_TOKEN:?SANITY_WRITE_TOKEN is required — create an Editor token at sanity.io/manage}"

FILENAME=$(basename "$FILE")
CONTENT_TYPE=$(file --brief --mime-type "$FILE")

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
  "https://${SANITY_PROJECT_ID}.api.sanity.io/v2024-01-01/assets/images/${SANITY_DATASET}?${PARAMS}"
