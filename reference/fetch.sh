#!/usr/bin/env bash
# Fetch the offline reference library for KJME agents.
# Run once at setup, with network. Agents then run with no network access.
# Usage: reference/fetch.sh [target_dir]    (default: reference/data)
set -euo pipefail

TARGET="${1:-$(cd "$(dirname "$0")" && pwd)/data}"
STEP_REPO="https://github.com/STEPBible/STEPBible-Data"
STEP_COMMIT="5de0a47f35f0fc13dfe1430d104e5db8a4285f9c"   # pinned; bump deliberately and re-run

FILES=(
  "Translators Amalgamated OT+NT/TAGNT Mat-Jhn - Translators Amalgamated Greek NT - STEPBible.org CC-BY.txt"
  "Translators Amalgamated OT+NT/TAGNT Act-Rev - Translators Amalgamated Greek NT - STEPBible.org CC-BY.txt"
  "Translators Amalgamated OT+NT/TAHOT Gen-Deu - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt"
  "Translators Amalgamated OT+NT/TAHOT Jos-Est - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt"
  "Translators Amalgamated OT+NT/TAHOT Job-Sng - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt"
  "Translators Amalgamated OT+NT/TAHOT Isa-Mal - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt"
  "Lexicons/TBESG - Translators Brief lexicon of Extended Strongs for Greek - STEPBible.org CC BY.txt"
  "Lexicons/TBESH - Translators Brief lexicon of Extended Strongs for Hebrew - STEPBible.org CC BY.txt"
  "Versification/TVTMS - Translators Versification Traditions with Methodology for Standardisation for Eng+Heb+Lat+Grk+Others - STEPBible.org CC BY.txt"
)

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

git -C "$WORK" init -q step
git -C "$WORK/step" remote add origin "$STEP_REPO"
git -C "$WORK/step" fetch -q --depth 1 --filter=blob:none origin "$STEP_COMMIT"
git -C "$WORK/step" checkout -q FETCH_HEAD -- "${FILES[@]}" README.md

mkdir -p "$TARGET/stepbible"
for f in "${FILES[@]}" README.md; do
  cp "$WORK/step/$f" "$TARGET/stepbible/$(basename "$f")"
done

# Manifest: what was fetched, from where, with hashes. Published in every release's record.
{
  echo '{'
  echo "  \"fetched_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
  echo "  \"sources\": [{ \"name\": \"STEPBible-Data (Tyndale House)\", \"repo\": \"$STEP_REPO\", \"commit\": \"$STEP_COMMIT\", \"license\": \"CC BY 4.0\" }],"
  echo '  "files": ['
  first=1
  for p in "$TARGET"/stepbible/*; do
    [ $first -eq 1 ] || echo ','
    first=0
    printf '    { "path": "stepbible/%s", "sha256": "%s", "bytes": %s }' \
      "$(basename "$p")" "$(sha256sum "$p" | cut -d' ' -f1)" "$(wc -c < "$p" | tr -d ' ')"
  done
  echo ''
  echo '  ]'
  echo '}'
} > "$TARGET/MANIFEST.json"

# English of 1611: the Bible Word-Book and Webster 1828, from archive.org scans, parsed into reference/data/english/.
bun "$(cd "$(dirname "$0")" && pwd)/../harness/scripts/fetch-english.ts" "$TARGET"

echo "Reference library ready in $TARGET"
