#!/usr/bin/env bash
# Build the Tauri macOS bundle and install it into /Applications.
# Usage: pnpm desktop:install  (from repo root)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="DevNote"
SRC="$ROOT/apps/desktop/src-tauri/target/release/bundle/macos/$APP_NAME.app"
DEST="/Applications/$APP_NAME.app"

pnpm --filter @devnote/desktop build

if [ ! -d "$SRC" ]; then
  echo "error: expected bundle not found at $SRC" >&2
  exit 1
fi

# Quit running instance so the bundle can be replaced (binary name, not product name).
pkill -x "devnote-desktop" 2>/dev/null || true
sleep 1

rm -rf "$DEST"
cp -R "$SRC" "$DEST"
echo "Installed $DEST"

# Smoke test: launch and verify the process stays up.
open "$DEST"
sleep 8
if pgrep -x "devnote-desktop" >/dev/null; then
  echo "Smoke test passed: DevNote is running"
else
  echo "error: DevNote exited after launch — check Console.app crash reports" >&2
  exit 1
fi
