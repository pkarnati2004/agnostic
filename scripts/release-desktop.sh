#!/usr/bin/env bash
# Builds agnostic.app signed with a Developer ID under the hardened runtime, notarized and stapled,
# as a dmg and a zip, then verifies it. The signing and notarytool variables come from the shell
# this runs in; the script checks only that they are set. docs/release.md lists them.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ -z "${CSC_NAME:-}" ]; then
  echo "release-desktop: CSC_NAME is not set; see docs/release.md" >&2
  exit 1
fi
# notarytool logs in with a keychain profile from `xcrun notarytool store-credentials`, or with the
# Apple ID trio; the profile keeps the password out of the environment and out of ps.
if [ -z "${APPLE_KEYCHAIN_PROFILE:-}" ] &&
  { [ -z "${APPLE_ID:-}" ] || [ -z "${APPLE_APP_SPECIFIC_PASSWORD:-}" ] || [ -z "${APPLE_TEAM_ID:-}" ]; }; then
  echo "release-desktop: set APPLE_KEYCHAIN_PROFILE, or APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID; see docs/release.md" >&2
  exit 1
fi

echo "release-desktop: stage the app"
pnpm stage:desktop

echo "release-desktop: sign, notarize and staple with electron-builder"
# An empty identity replaces the yml's ad-hoc "-", so electron-builder signs with CSC_NAME.
pnpm --filter @agnostic/desktop exec electron-builder --config electron-builder.yml --mac -c.mac.identity=

APP=packages/desktop/release/mac-arm64/agnostic.app

echo "release-desktop: the signature is valid and sealed"
codesign --verify --deep --strict "$APP"

echo "release-desktop: the app is signed with a Developer ID"
SIGNATURE="$(codesign -dv --verbose=2 "$APP" 2>&1)"
grep -q 'Authority=Developer ID Application' <<< "$SIGNATURE"

echo "release-desktop: Gatekeeper accepts the app"
spctl --assess --type execute "$APP"

echo "release-desktop: the notarization ticket is stapled"
xcrun stapler validate "$APP"

echo "release-desktop: ELECTRON_RUN_AS_NODE still works on the signed app"
ELECTRON_RUN_AS_NODE=1 "$APP/Contents/MacOS/agnostic" -p process.versions.node > /dev/null

echo "release-desktop: the dmg and the zip are there"
VERSION="$(node -p "require('./build/npm/package.json').version")"
DMG="packages/desktop/release/agnostic-$VERSION-arm64.dmg"
ZIP="packages/desktop/release/agnostic-$VERSION-arm64-mac.zip"
test -f "$DMG"
test -f "$ZIP"

echo
shasum -a 256 "$DMG" "$ZIP"
echo
echo "1. git tag v$VERSION && git push origin v$VERSION  (or reuse a pushed tag)"
echo "2. open https://github.com/pkarnati2004/agnostic/releases/new?tag=v$VERSION"
echo "3. upload the dmg and the zip, then publish"
