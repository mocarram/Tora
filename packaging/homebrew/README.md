# Homebrew distribution

Tora is distributed through a **custom Homebrew tap** so the source repo can
stay private while the binaries are public. The tap is a separate public repo,
`mocarram/homebrew-tora`, that holds the Cask and hosts the dmgs as release
assets.

## For users

```sh
# Pre-release (signed, not yet notarized): --no-quarantine clears Gatekeeper.
brew install --cask --no-quarantine mocarram/tora/tora

# Once notarized, the flag is no longer needed:
brew install --cask mocarram/tora/tora
```

Update with `brew upgrade --cask tora`; remove with `brew uninstall --cask tora`
(add `--zap` to also delete local data).

## Tap repo layout (`mocarram/homebrew-tora`)

```
Casks/tora.rb        # the cask in this folder, copied in
README.md            # the user instructions above
```

## Cutting a new version

1. Build the dmgs: `npm run dist:mac` (in this repo).
2. Refresh the cask: `./packaging/homebrew/update-cask.sh`
   (bumps `version` and both `sha256`s from `release/`).
3. In the tap repo: create a GitHub release tagged `v<version>` and upload
   `Tora-<version>-arm64.dmg` and `Tora-<version>.dmg` to it.
4. Copy `packaging/homebrew/tora.rb` → tap repo `Casks/tora.rb`, commit, push.
5. Verify: `brew update && brew install --cask --no-quarantine mocarram/tora/tora`.

The Cask's download URLs point at the tap repo's `v<version>` release assets, so
the release must exist before the cask resolves.

## Validate before publishing

```sh
brew style packaging/homebrew/tora.rb
brew audit --cask --online packaging/homebrew/tora.rb   # after the release exists
```
