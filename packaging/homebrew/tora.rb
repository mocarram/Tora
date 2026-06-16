cask "tora" do
  arch arm: "arm64", intel: "x64"

  version "0.1.1"
  # PLACEHOLDER checksums - filled by update-cask.sh once the v0.1.1 DMGs are
  # built and published to mocarram/Tora releases. This file is the source of
  # truth; update-cask.sh copies it into the homebrew-tap repo's Casks/.
  sha256 arm:   "0000000000000000000000000000000000000000000000000000000000000000",
         intel: "0000000000000000000000000000000000000000000000000000000000000000"

  url "https://github.com/mocarram/Tora/releases/download/v#{version}/Tora-#{version}-#{arch}.dmg",
      verified: "github.com/mocarram/Tora/"
  name "Tora"
  desc "Privacy-first clipboard manager"
  homepage "https://github.com/mocarram/Tora"

  # The Homebrew build is unsigned, so the in-app updater (Squirrel.Mac) cannot
  # apply updates - Homebrew owns them. Leaving auto_updates at its default
  # (false) keeps `brew upgrade --cask tora` as the real update path; a future
  # signed direct-download build would set this true and self-update instead.
  depends_on macos: :big_sur

  app "Tora.app"

  zap trash: [
    "~/Library/Application Support/Tora",
    "~/Library/Logs/Tora",
    "~/Library/Preferences/com.tora.clipboard.plist",
    "~/Library/Saved Application State/com.tora.clipboard.savedState",
  ]
end
