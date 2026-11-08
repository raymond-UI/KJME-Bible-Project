#!/usr/bin/env bash
# Fetch the KJV 1769 source text (eBible.org KJV, public domain) as OSIS, pinned.
# Includes translator-supplied italics (<transChange type="added">) and paragraphs (<p>).
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-$HERE/data/source}"
REPO="https://github.com/seven1m/open-bibles"
COMMIT="8b330654ade69f7c96268c761da18dc83a1f49b7"
FILE="eng-kjv.osis.xml"

WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
git -C "$WORK" init -q src
git -C "$WORK/src" remote add origin "$REPO"
git -C "$WORK/src" fetch -q --depth 1 --filter=blob:none origin "$COMMIT"
git -C "$WORK/src" checkout -q FETCH_HEAD -- "$FILE"
mkdir -p "$TARGET"
cp "$WORK/src/$FILE" "$TARGET/$FILE"
SHA="$(sha256sum "$TARGET/$FILE" | cut -d' ' -f1)"
cat > "$TARGET/MANIFEST.json" <<JSON
{ "name": "King James Version (1769), eBible.org via open-bibles", "repo": "$REPO", "commit": "$COMMIT",
  "file": "$FILE", "sha256": "$SHA", "license": "Public domain (outside the UK; see README Copyright note)" }
JSON
echo "Source ready: $TARGET/$FILE"
