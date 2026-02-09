#!/bin/zsh
set -euo pipefail

ROOT=$(cd "$(dirname "$0")" && pwd)
TS=$(date '+%Y%m%d-%H%M%S')
DEST="$ROOT/_backups/$TS"
mkdir -p "$DEST"

# Back up the files that typically change.
for f in \
  .github/workflows/news-bot.yml \
  news_notifier.py \
  README.md \
  README_MAINTENANCE.md \
; do
  if [ -f "$ROOT/$f" ]; then
    mkdir -p "$DEST/$(dirname "$f")"
    cp -a "$ROOT/$f" "$DEST/$f"
  fi
done

echo "$DEST"
