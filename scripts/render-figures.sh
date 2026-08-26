#!/usr/bin/env bash
#
# Rasterize committed SVG figure sources to PNG at publication width.
#
# Figures are authored as SVG under figures/<post-slug>/ and uploaded to Sanity
# as PNG, because PortableTextImage.astro calls .format("webp") and sizes the
# layout box from the asset's dimension metadata. Sanity's CDN ignores format
# conversion on SVG, so an SVG upload would serve untransformed and defeat both.
# Committing the SVG keeps the figure regenerable when a number in it changes;
# the PNG is a build artifact and is not tracked.
#
# Headless Chrome is the rasterizer because it is the only one present on a
# stock macOS dev box here: librsvg, cairosvg, and matplotlib are all absent,
# and ImageMagick's SVG delegate just shells out to the rsvg-convert that is
# missing. Chrome also gets text layout right, which the ImageMagick built-in
# MSVG renderer does not.
#
# Usage:
#   make render-figures                 # render every figure
#   make render-figures FIGURE=fig2-leaf-cupping
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIGURES_DIR="${REPO_ROOT}/figures"
FILTER="${1:-}"

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
if [[ ! -x "$CHROME" ]]; then
  echo "Error: Chrome not found at: $CHROME" >&2
  echo "Set CHROME=/path/to/chrome to override." >&2
  exit 1
fi

if [[ ! -d "$FIGURES_DIR" ]]; then
  echo "Error: no figures directory at $FIGURES_DIR" >&2
  exit 1
fi

# Chrome refuses to share a profile directory with a running instance, and the
# user keeps one open. A throwaway profile per run sidesteps that entirely.
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

rendered=0

while IFS= read -r svg; do
  name="$(basename "$svg" .svg)"
  if [[ -n "$FILTER" && "$name" != "$FILTER" ]]; then
    continue
  fi

  # The shim reads the intended raster size off the SVG root rather than taking
  # it as an argument, so the figure source stays the single source of truth for
  # its own dimensions.
  width="$(sed -n 's/.*[^-]width="\([0-9]*\)".*/\1/p' "$svg" | head -1)"
  height="$(sed -n 's/.*[^-]height="\([0-9]*\)".*/\1/p' "$svg" | head -1)"

  if [[ -z "$width" || -z "$height" ]]; then
    echo "Error: $svg must declare integer width and height on its root <svg>." >&2
    exit 1
  fi

  out="$(dirname "$svg")/${name}.png"
  shim="${WORK_DIR}/${name}.html"

  # Chrome renders a bare .svg document inside a page that has a default body
  # margin, which would offset the figure and crop its right edge. Wrapping it
  # in a zero-margin HTML document pins the origin at the top left corner.
  {
    printf '<!doctype html><meta charset="utf-8">'
    printf '<style>html,body{margin:0;padding:0;background:#F7F7F8}svg{display:block}</style>'
    cat "$svg"
  } > "$shim"

  rm -f "$out"

  # Chrome writes the screenshot and then does not always exit, which hangs the
  # whole run. Waiting on the process is therefore not an option: poll for the
  # artifact instead, treat a size that has stopped changing as a finished
  # write, and stop the browser ourselves.
  "$CHROME" \
    --headless \
    --disable-gpu \
    --hide-scrollbars \
    --force-device-scale-factor=1 \
    --user-data-dir="${WORK_DIR}/profile" \
    --window-size="${width},${height}" \
    --screenshot="$out" \
    "file://${shim}" >/dev/null 2>&1 &
  chrome_pid=$!

  previous_size=-1
  for _ in $(seq 1 120); do
    sleep 0.5
    if [[ -s "$out" ]]; then
      current_size="$(wc -c < "$out")"
      if [[ "$current_size" == "$previous_size" ]]; then
        break
      fi
      previous_size="$current_size"
    fi
  done

  kill "$chrome_pid" 2>/dev/null || true
  wait "$chrome_pid" 2>/dev/null || true

  if [[ ! -s "$out" ]]; then
    echo "Error: Chrome produced no output for $svg" >&2
    exit 1
  fi

  actual="$(sips -g pixelWidth -g pixelHeight "$out" | awk '/pixelWidth/{w=$2} /pixelHeight/{h=$2} END{print w"x"h}')"
  echo "  ${name}.png  ${actual}"
  rendered=$(( rendered + 1 ))
done < <(find "$FIGURES_DIR" -name '*.svg' | sort)

if (( rendered == 0 )); then
  echo "Error: no figures matched${FILTER:+ FIGURE=$FILTER}." >&2
  exit 1
fi

echo "Rendered ${rendered} figure(s)."
