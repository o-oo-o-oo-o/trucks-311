#!/usr/bin/env bash
set -euo pipefail

# run with:
# ./convert_to_jpg.sh /path/to/your/heic_folder

if [ $# -ne 1 ]; then
  echo "Usage: $0 /path/to/input_directory_with_heic_files"
  exit 1
fi

IN_DIR="$1"

if [ ! -d "$IN_DIR" ]; then
  echo "Error: '$IN_DIR' is not a directory"
  exit 1
fi

BASE_OUT="/Users/michaelhassin/brain/codes/trucks-311/playwright/media"

# Timestamp like 2025-11-24_23-05-12 (no colons)
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
OUT_DIR="$BASE_OUT/$TIMESTAMP"

mkdir -p "$OUT_DIR"
echo "Output directory: $OUT_DIR"

shopt -s nullglob

# Loop over both .HEIC and .heic
for SRC in "$IN_DIR"/*.HEIC "$IN_DIR"/*.heic; do
  # If no matches, skip
  [ -e "$SRC" ] || continue

  FNAME=$(basename "$SRC")
  BASENAME="${FNAME%.*}"
  DST="$OUT_DIR/${BASENAME}.jpg"

  echo "Converting: $SRC -> $DST"

  # 1) Convert HEIC -> JPEG (this may lose metadata, but we'll restore it)
  sips -s format jpeg "$SRC" --out "$DST" >/dev/null

  # 2) Copy all EXIF + file timestamps from the original HEIC to the new JPG
  #    -All:All             -> all metadata tags
  #    -FileCreateDate      -> filesystem creation time
  #    -FileModifyDate      -> filesystem modified time
  exiftool \
    -TagsFromFile "$SRC" \
    -All:All \
    '-FileCreateDate<FileCreateDate' \
    '-FileModifyDate<FileModifyDate' \
    -overwrite_original \
    "$DST" >/dev/null

  echo "Done: $DST"
done

echo "All done. Files are in: $OUT_DIR"
