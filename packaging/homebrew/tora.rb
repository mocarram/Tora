cask "tora" do
  arch arm: "arm64", intel: "x64"

  version "0.1.2"
  # Checksums for the published v0.1.1 DMGs. This file is the source of truth;
  # update-cask.sh refills version + sha256 from each release and copies it into
  # the homebrew-tap repo's Casks/.
  sha256 arm:   "22c47ee2400e3c745022970acccb610c537d2421d27861c344ee82a2a78b0bcb",
         intel: "4ab14507a8fcddf4fac91d99f3a55441ea36ae85be02ebb20d91886339ede277"

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

  caveats <<~EOS
    Tora is not yet signed or notarized. Homebrew no longer offers
    --no-quarantine, so clear Gatekeeper once after installing:

      xattr -dr com.apple.quarantine "#{appdir}/Tora.app"

    Then grant Accessibility when prompted so Tora can paste back into the
    app you were using.
  EOS
end
