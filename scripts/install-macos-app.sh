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

# Ad-hoc seal: Tauri leaves resources unsealed, which Gatekeeper on other
# Macs reports as "damaged". A local signature seals the bundle so downloads
# degrade to the milder "unidentified developer" (right-click → Open) flow.
# (Proper fix: Developer ID + notarization, PLAN.md §6c.)
codesign --force --deep --sign - "$SRC"
echo "Ad-hoc signature applied"

# Tauri's DMG is staged before signing, so restage it from the sealed app.
DMG_DIR="$ROOT/apps/desktop/src-tauri/target/release/bundle/dmg"
DMG_NAME="DevNote_$(jq -r .version "$ROOT/apps/desktop/src-tauri/tauri.conf.json")_aarch64.dmg"
STAGE="$(mktemp -d)/dmg"
mkdir -p "$STAGE"
cp -R "$SRC" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
rm -f "$DMG_DIR/$DMG_NAME"
hdiutil create -volname "DevNote" -srcfolder "$STAGE" -ov -format UDZO "$DMG_DIR/$DMG_NAME" >/dev/null
rm -rf "$(dirname "$STAGE")"
echo "Restaged $DMG_DIR/$DMG_NAME from sealed bundle"

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
