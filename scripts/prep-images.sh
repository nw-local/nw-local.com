#!/usr/bin/env bash
#
# Prepare images for Sanity upload: convert to JPG, rename with strain slug, check for duplicates.
#
# Usage:
#   make prep-images DIR=path/to/images STRAIN="Strain Name"
#   make prep-images DIR=path/to/images STRAIN="Strain Name" RENAME="IMG_3559.HEIC:bud-closeup,IMG_3561.HEIC:trichome-detail"

set -euo pipefail

DIR="${1:?Usage: prep-images.sh <directory> <strain-name>}"
STRAIN="${2:?Usage: prep-images.sh <directory> <strain-name>}"
RENAME="${3:-}"

if [[ ! -d "$DIR" ]]; then
  echo "Error: directory not found: $DIR" >&2
  exit 1
fi

slugify() {
  echo "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed 's/[_ ]/-/g' \
    | sed 's/[^a-z0-9-]//g' \
    | sed 's/--*/-/g' \
    | sed 's/^-//;s/-$//'
}

SLUG=$(slugify "$STRAIN")
PROCESSED_DIR="${DIR%/}/_processed"

# Parse RENAME mappings into parallel arrays: RENAME_FROM[i] → RENAME_TO[i]
RENAME_FROM=()
RENAME_TO=()
if [[ -n "$RENAME" ]]; then
  IFS=',' read -ra PAIRS <<< "$RENAME"
  for pair in "${PAIRS[@]}"; do
    FROM="${pair%%:*}"
    TO="${pair#*:}"
    RENAME_FROM+=("$FROM")
    RENAME_TO+=("$TO")
  done
fi

# Look up a rename mapping for a given filename; returns the new stem or empty string
lookup_rename() {
  local filename="$1"
  for index in "${!RENAME_FROM[@]}"; do
    if [[ "${RENAME_FROM[$index]}" == "$filename" ]]; then
      echo "${RENAME_TO[$index]}"
      return
    fi
  done
  echo ""
}

echo "Strain: $STRAIN"
echo "Slug:   $SLUG"
echo "Source: $DIR"
echo "Output: $PROCESSED_DIR"
if [[ ${#RENAME_FROM[@]} -gt 0 ]]; then
  echo "Renames: ${#RENAME_FROM[@]} mapping(s)"
fi
echo ""

# Find image files (case-insensitive), skip _processed/
IMAGE_EXTENSIONS="heic|heif|png|jpg|jpeg|webp"
IMAGES=()
while IFS= read -r -d '' file; do
  IMAGES+=("$file")
done < <(find "$DIR" -maxdepth 1 -not -path "*/_processed/*" -type f -print0 \
  | grep -ziE "\.(${IMAGE_EXTENSIONS})$" \
  | sort -z)

if [[ ${#IMAGES[@]} -eq 0 ]]; then
  echo "No image files found in $DIR" >&2
  exit 1
fi

echo "Found ${#IMAGES[@]} image(s):"
printf "  %s\n" "${IMAGES[@]}"
echo ""

# Create output directory
mkdir -p "$PROCESSED_DIR"

# Convert and rename
PROCESSED_FILES=()
for img in "${IMAGES[@]}"; do
  BASENAME=$(basename "$img")
  RENAMED=$(lookup_rename "$BASENAME")
  if [[ -n "$RENAMED" ]]; then
    STEM_SLUG=$(slugify "$RENAMED")
  else
    STEM="${BASENAME%.*}"
    STEM_SLUG=$(slugify "$STEM")
  fi
  OUTPUT_NAME="${SLUG}-${STEM_SLUG}.jpg"
  OUTPUT_PATH="${PROCESSED_DIR}/${OUTPUT_NAME}"

  EXT_LOWER=$(echo "${BASENAME##*.}" | tr '[:upper:]' '[:lower:]')

  if [[ "$EXT_LOWER" == "jpg" || "$EXT_LOWER" == "jpeg" ]]; then
    echo "Copying $BASENAME → $OUTPUT_NAME"
    cp "$img" "$OUTPUT_PATH"
  else
    echo "Converting $BASENAME → $OUTPUT_NAME"
    # Dedup hashes the CONVERTED JPG bytes, not the source file, so this quality
    # setting is part of the dedup contract. Changing 90 changes every hash, every
    # already-uploaded image starts reading as new, and duplicates upload silently.
    sips -s format jpeg -s formatOptions 90 "$img" --out "$OUTPUT_PATH" >/dev/null 2>&1
  fi

  PROCESSED_FILES+=("$OUTPUT_PATH")
done

echo ""
echo "Processed ${#PROCESSED_FILES[@]} file(s) to $PROCESSED_DIR"

# Local dedup: if _processed/ has files with the same content (SHA-1) as newly
# processed files (e.g., renamed version from a previous run), keep the newest.
echo ""
echo "Deduplicating _processed/..."
LOCAL_DUP_COUNT=0

# Build hash list for current batch (parallel arrays — bash 3.2 compatible)
CURRENT_HASHES=()
CURRENT_PATHS=()
for file in "${PROCESSED_FILES[@]}"; do
  CURRENT_HASHES+=("$(shasum "$file" | awk '{print $1}')")
  CURRENT_PATHS+=("$file")
done

while IFS= read -r -d '' existing; do
  # Skip files from current batch
  IS_CURRENT=false
  for current in "${PROCESSED_FILES[@]}"; do
    if [[ "$existing" == "$current" ]]; then
      IS_CURRENT=true
      break
    fi
  done
  if [[ "$IS_CURRENT" == true ]]; then
    continue
  fi
  # Check if a current file has the same hash (i.e., same image, different name)
  EXISTING_HASH=$(shasum "$existing" | awk '{print $1}')
  MATCHED=false
  for hash_index in "${!CURRENT_HASHES[@]}"; do
    if [[ "${CURRENT_HASHES[$hash_index]}" == "$EXISTING_HASH" ]]; then
      echo "  Replaced: $(basename "$existing") → $(basename "${CURRENT_PATHS[$hash_index]}")"
      MATCHED=true
      break
    fi
  done
  if [[ "$MATCHED" == false ]]; then
    echo "  Removed stale: $(basename "$existing")"
  fi
  rm "$existing"
  LOCAL_DUP_COUNT=$((LOCAL_DUP_COUNT + 1))
done < <(find "$PROCESSED_DIR" -maxdepth 1 -type f -print0)
if [[ $LOCAL_DUP_COUNT -eq 0 ]]; then
  echo "  No duplicates or stale files found"
fi

# Sanity dedup: check which files are already uploaded
echo ""
echo "Checking Sanity for upload status..."
echo ""

: "${SANITY_PROJECT_ID:?SANITY_PROJECT_ID is required}"
: "${SANITY_DATASET:?SANITY_DATASET is required}"
: "${SANITY_API_TOKEN:?SANITY_API_TOKEN is required}"

urlencode() {
  python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1]))" "$1"
}

parse_json_field() {
  python3 -c "
import json, sys
data = json.loads(sys.stdin.read())
result = data.get('result')
if result and isinstance(result, dict):
    print(result.get(sys.argv[1], ''))
" "$1"
}

NEW_COUNT=0
UPLOADED_COUNT=0

for file in "${PROCESSED_FILES[@]}"; do
  # Skip files that were removed during local dedup
  if [[ ! -f "$file" ]]; then
    continue
  fi

  FILENAME=$(basename "$file")
  HASH=$(shasum "$file" | awk '{print $1}')

  QUERY=$(urlencode "*[_type == \"sanity.imageAsset\" && sha1hash == \"${HASH}\"][0]{_id, label, originalFilename}")

  RESPONSE=$(curl --silent --fail \
    -H "Authorization: Bearer ${SANITY_API_TOKEN}" \
    "https://${SANITY_PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${SANITY_DATASET}?query=${QUERY}")

  ASSET_ID=$(echo "$RESPONSE" | parse_json_field "_id")

  if [[ -n "$ASSET_ID" ]]; then
    ASSET_LABEL=$(echo "$RESPONSE" | parse_json_field "label")
    ASSET_FILENAME=$(echo "$RESPONSE" | parse_json_field "originalFilename")
    if [[ "$ASSET_FILENAME" != "$FILENAME" ]]; then
      echo "  RENAME: $FILENAME → uploaded as $ASSET_ID (currently \"${ASSET_FILENAME}\")"
    else
      echo "  UPLOADED: $FILENAME → $ASSET_ID${ASSET_LABEL:+ ($ASSET_LABEL)}"
    fi
    UPLOADED_COUNT=$((UPLOADED_COUNT + 1))
  else
    echo "  NEW: $FILENAME"
    NEW_COUNT=$((NEW_COUNT + 1))
  fi
done

echo ""
echo "Summary: _processed/ contains $((NEW_COUNT + UPLOADED_COUNT)) file(s) — $NEW_COUNT new, $UPLOADED_COUNT already uploaded"
