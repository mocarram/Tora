cask "tora" do
  arch arm: "arm64", intel: "x64"

  version "0.1.1"
  # Checksums for the published v0.1.1 DMGs. This file is the source of truth;
  # update-cask.sh refills version + sha256 from each release and copies it into
  # the homebrew-tap repo's Casks/.
  sha256 arm:   "bae795bf4883cf12b802bdc9c2d03c182a025884bd7db99215f1c2dd175bb594",
         intel: "8bb8462810de7a51ffc26b9cc2cd92362ca93f6cd8021b523fabd35f8a53b5b4"

  url "https://github.com/mocarram/Tora/releases/download/v#{version}/Tora-#{version}-#{arch}.dmg"
  name "Tora"
  desc "Privacy-first clipboard manager"
  homepage "https://github.com/mocarram/Tora"

  # The Homebrew build is unsigned, so the in-app updater (Squirrel.Mac) cannot
  # apply updates - Homebrew owns them. Leaving auto_updates at its default
  # (false) keeps `brew upgrade --cask tora` as the real update path; a future
  # signed direct-download build would set this true and self-update instead.
  depends_on macos: :monterey

  app "Tora.app"

  zap trash: [
    "~/Library/Application Support/Tora",
    "~/Library/Logs/Tora",
    "~/Library/Preferences/com.tora.clipboard.plist",
    "~/Library/Saved Application State/com.tora.clipboard.savedState",
  ]
end
