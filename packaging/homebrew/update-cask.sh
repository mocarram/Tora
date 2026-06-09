#!/usr/bin/env bash
# Regenerate packaging/homebrew/tora.rb (version + both sha256s) from the dmgs
# in release/. Run after `npm run dist:mac`, then copy tora.rb into the
# homebrew-tora tap repo's Casks/ and commit.
#
#   ./packaging/homebrew/update-cask.sh
#
set -euo pipefail
cd "$(dirname "$0")/../.."

version="$(node -p "require('./package.json').version")"
arm_dmg="release/Tora-${version}-arm64.dmg"
intel_dmg="release/Tora-${version}.dmg"

for f in "$arm_dmg" "$intel_dmg"; do
  [ -f "$f" ] || { echo "missing $f - run 'npm run dist:mac' first" >&2; exit 1; }
done

arm_sha="$(shasum -a 256 "$arm_dmg" | awk '{print $1}')"
intel_sha="$(shasum -a 256 "$intel_dmg" | awk '{print $1}')"

cask="packaging/homebrew/tora.rb"
/usr/bin/sed -i '' \
  -e "s/^  version \".*\"/  version \"${version}\"/" \
  "$cask"
# Replace the two sha256 lines in document order (arm first, intel second).
awk -v arm="$arm_sha" -v intel="$intel_sha" '
  /sha256 "/ { n++; if (n==1) sub(/sha256 "[^"]*"/, "sha256 \"" arm "\""); else if (n==2) sub(/sha256 "[^"]*"/, "sha256 \"" intel "\"") }
  { print }
' "$cask" > "$cask.tmp" && mv "$cask.tmp" "$cask"

echo "Updated $cask -> version $version"
echo "  arm64 $arm_sha"
echo "  intel $intel_sha"
