#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/roku/build/coastloop-roku-dev.zip"

rm -f "$OUT"

cd "$ROOT/roku"
zip -q -r "$OUT" manifest source components \
  -x '*.DS_Store' '__MACOSX/*'

printf 'ROKU_PACKAGE=%s\n' "$OUT"
printf 'SIZE='
du -h "$OUT" | awk '{print $1}'
