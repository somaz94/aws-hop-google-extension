#!/usr/bin/env bash
# Draws icons/icon{16,48,128}.png: two swap arrows on AWS squid ink. Drawn at 512px, then downscaled.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if command -v magick >/dev/null 2>&1; then
  MAGICK="magick"
elif command -v convert >/dev/null 2>&1; then
  MAGICK="convert"
else
  echo "ImageMagick is required (brew install imagemagick)" >&2
  exit 1
fi

MASTER="$(mktemp "${TMPDIR:-/tmp}/aws-hop-icon.XXXXXX")"
trap 'rm -f "${MASTER}"' EXIT

ARROWS='stroke-width 52 stroke-linecap round stroke-linejoin round fill none'

"${MAGICK}" -size 512x512 xc:none \
  -fill '#232F3E' -draw 'roundrectangle 16,16 495,495 104,104' \
  -draw "${ARROWS} stroke #FF9900 path 'M 120,176 L 368,176 M 304,104 L 384,176 L 304,248'" \
  -draw "${ARROWS} stroke #FFFFFF path 'M 392,336 L 144,336 M 208,264 L 128,336 L 208,408'" \
  "png:${MASTER}"

for size in 16 48 128; do
  "${MAGICK}" "png:${MASTER}" -filter Lanczos -resize "${size}x${size}" "${ROOT_DIR}/icons/icon${size}.png"
  echo "  ✓ icons/icon${size}.png"
done
