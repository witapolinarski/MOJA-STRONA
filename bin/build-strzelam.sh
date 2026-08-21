#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/strzelam"

if [ ! -d "$SRC" ]; then
  SRC="$ROOT"
fi

cd "$ROOT"
npm install

if [ -f "$SRC/package.json" ] && [ "$SRC" != "$ROOT" ]; then
  npm install --prefix "$SRC"
fi

rm -rf "$ROOT/tmp/strzelam-fix2"
mkdir -p "$ROOT/tmp/strzelam-fix2"
cp -a "$SRC"/. "$ROOT/tmp/strzelam-fix2/"

echo "Strzelam publish directory ready at tmp/strzelam-fix2"
