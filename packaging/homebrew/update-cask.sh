#!/usr/bin/env bash
# Fill the sha256 checksums (and version) in packaging/homebrew/tora.rb from the
# v<version> DMGs, then optionally copy the cask into the homebrew-tap repo.
#
# DMG source, in order of preference:
#   1. local  release/Tora-<version>-{arm64,x64}.dmg  (after `npm run dist:mac`)
#   2. the published GitHub release  (downloaded via `gh release download`)
#
# Usage:
#   ./packaging/homebrew/update-cask.sh                 # use package.json version
#   ./packaging/homebrew/update-cask.sh 0.1.1           # explicit version
#   TAP_DIR=../homebrew-tap ./packaging/homebrew/update-cask.sh   # also copy + commit
set -euo pipefail
cd "$(dirname "$0")/../.."

version="${1:-$(node -p "require('./package.json').version")}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

resolve_dmg() { # arch -> path to the dmg (local or downloaded)
  local arch="$1" name="Tora-${version}-${1}.dmg"
  if [ -f "release/${name}" ]; then
    echo "release/${name}"
  else
    gh release download "v${version}" --repo mocarram/Tora \
      --pattern "${name}" --dir "$work" >/dev/null
    echo "${work}/${name}"
  fi
}

arm_sha="$(shasum -a 256 "$(resolve_dmg arm64)" | awk '{print $1}')"
intel_sha="$(shasum -a 256 "$(resolve_dmg x64)" | awk '{print $1}')"

cask="packaging/homebrew/tora.rb"
/usr/bin/sed -i '' \
  -e "s/^  version \".*\"/  version \"${version}\"/" \
  -e "s/^  sha256 arm:   \"[^\"]*\"/  sha256 arm:   \"${arm_sha}\"/" \
  -e "s/^         intel: \"[^\"]*\"/         intel: \"${intel_sha}\"/" \
  "$cask"

echo "Updated ${cask} -> version ${version}"
echo "  arm64 ${arm_sha}"
echo "  x64   ${intel_sha}"

# Optional: copy into the tap repo and commit, if TAP_DIR points at a clone.
if [ -n "${TAP_DIR:-}" ]; then
  cp "$cask" "${TAP_DIR}/Casks/tora.rb"
  git -C "$TAP_DIR" add Casks/tora.rb
  git -C "$TAP_DIR" commit -m "tora ${version}" >/dev/null
  echo "Committed to ${TAP_DIR} (push it to publish: git -C ${TAP_DIR} push)"
fi
