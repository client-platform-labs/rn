#!/usr/bin/env bash
# Map B — build RnModuleStub.xcframework (requires full Xcode.app, not CLT-only).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../examples/brownfield-host/ios/RnModuleStub" && pwd)"
cd "$ROOT"

if ! xcodebuild -version >/dev/null 2>&1; then
  echo "FAIL: xcodebuild unavailable"
  exit 1
fi
if xcodebuild -version 2>&1 | grep -q "requires Xcode"; then
  echo "FAIL: full Xcode.app required (xcode-select → Xcode.app)"
  exit 1
fi

SCHEME="RnModuleStub"
IOS_ARCHIVE="$ROOT/build/ios.xcarchive"
SIM_ARCHIVE="$ROOT/build/sim.xcarchive"
OUT="$ROOT/build/RnModuleStub.xcframework"

rm -rf "$ROOT/build"
mkdir -p "$ROOT/build"

echo "archive iOS device…"
xcodebuild archive \
  -scheme "$SCHEME" \
  -destination "generic/platform=iOS" \
  -archivePath "$IOS_ARCHIVE" \
  SKIP_INSTALL=NO \
  BUILD_LIBRARY_FOR_DISTRIBUTION=YES \
  ONLY_ACTIVE_ARCH=NO

echo "archive iOS simulator…"
xcodebuild archive \
  -scheme "$SCHEME" \
  -destination "generic/platform=iOS Simulator" \
  -archivePath "$SIM_ARCHIVE" \
  SKIP_INSTALL=NO \
  BUILD_LIBRARY_FOR_DISTRIBUTION=YES \
  ONLY_ACTIVE_ARCH=NO

ios_fw="$(find "$IOS_ARCHIVE" -name "${SCHEME}.framework" -type d | head -1)"
sim_fw="$(find "$SIM_ARCHIVE" -name "${SCHEME}.framework" -type d | head -1)"

if [[ -z "$ios_fw" || -z "$sim_fw" ]]; then
  echo "FAIL: framework not found in archives"
  echo "ios: $ios_fw"
  echo "sim: $sim_fw"
  exit 1
fi

xcodebuild -create-xcframework \
  -framework "$ios_fw" \
  -framework "$sim_fw" \
  -output "$OUT"

echo "OK: $OUT"
