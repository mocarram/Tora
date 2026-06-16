# Homebrew distribution

Tora is distributed through a **shared Homebrew tap**, `mocarram/homebrew-tap`
(one tap for all of mocarram's apps). The DMGs are published as release assets
on the public source repo `mocarram/Tora`; the tap only holds the cask.

`packaging/homebrew/tora.rb` here is the **source of truth** for the cask;
`update-cask.sh` fills its checksums and copies it into the tap.

## For users

```sh
brew tap mocarram/tap
# Builds are unsigned (no Apple Developer account yet): --no-quarantine clears
# Gatekeeper on first launch.
brew install --cask --no-quarantine tora
```

Update with `brew upgrade --cask tora`; remove with `brew uninstall --cask tora`
(add `--zap` to also delete local data). Once the app is signed + notarized the
`--no-quarantine` flag is no longer needed.

## Cutting a new version

1. Bump `version` in `package.json`, commit, and push a `v<version>` tag:
   `git tag v0.1.1 && git push origin v0.1.1`.
2. The **Release** workflow builds the (unsigned) DMGs + zips and publishes them
   to `mocarram/Tora` releases. (A `workflow_dispatch` run is a dry run.)
3. Refresh + publish the cask (downloads the DMGs from the release, fills the
   checksums, commits to a local clone of the tap):

   ```sh
   TAP_DIR=../homebrew-tap ./packaging/homebrew/update-cask.sh
   git -C ../homebrew-tap push
   ```

4. Verify: `brew update && brew install --cask --no-quarantine tora`.

## Validate the cask

```sh
brew style packaging/homebrew/tora.rb
brew audit --cask --online packaging/homebrew/tora.rb   # after the release exists
```
