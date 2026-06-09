# typed: strict
# frozen_string_literal: true

cask "tora" do
  version "0.1.0"

  # Universal-by-arch: each Mac downloads only its slice. sha256 values are the
  # checksums of the released dmgs (run packaging/homebrew/update-cask.sh to regen).
  on_arm do
    sha256 "5fa52ab639faafdc838f7b9c554374be66cf0832ebf97972fee39d90c23ad9d8"

    url "https://github.com/mocarram/homebrew-tora/releases/download/v#{version}/Tora-#{version}-arm64.dmg"
  end
  on_intel do
    sha256 "0d39c1b6adf569f268ee938cd80151291d7d1effb2c97edae805af42c2ab05d3"

    url "https://github.com/mocarram/homebrew-tora/releases/download/v#{version}/Tora-#{version}.dmg"
  end

  name "Tora"
  desc "Privacy-first clipboard manager"
  homepage "https://github.com/mocarram/Tora"

  # macOS 11+ (matches the app's minimum).
  depends_on macos: ">= :big_sur"

  app "Tora.app"

  # NOTE: pre-release builds are signed but NOT notarized, so a normal cask
  # install quarantines the app and Gatekeeper blocks first launch. Until the
  # notarized release lands, install with:
  #     brew install --cask --no-quarantine tora
  # `--no-quarantine` is a Homebrew flag (it cannot be set from inside a cask).

  zap trash: [
    "~/Library/Application Support/Tora",
    "~/Library/Logs/Tora",
    "~/Library/Preferences/com.tora.clipboard.plist",
    "~/Library/Saved Application State/com.tora.clipboard.savedState",
  ]
end
