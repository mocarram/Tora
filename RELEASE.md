# Tora - Release, Signing, and Notarization

Packaging uses electron-builder (`electron-builder.yml`) to produce a
`.dmg` for arm64 and x64. Code signing and notarization need an Apple Developer
account and are driven entirely by environment variables, so no secrets live in
the repo. These steps must run on macOS and have not been executed on the Linux
build host (see GAPS.md).

## One-time setup

1. Enrol in the Apple Developer Program.
2. Create a **Developer ID Application** certificate; export it as a `.p12`.
3. Create an app-specific password for your Apple ID (for notarization), or set
   up an App Store Connect API key.

## Build prerequisites (macOS)

```bash
npm install
npm run rebuild        # rebuild better-sqlite3 against the Electron ABI
npm run build
```

## Signing + notarization

electron-builder reads these from the environment:

```bash
export CSC_LINK="/absolute/path/DeveloperIDApplication.p12"
export CSC_KEY_PASSWORD="<p12 password>"

# Notarization (notarytool):
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="abcd-efgh-ijkl-mnop"
export APPLE_TEAM_ID="XXXXXXXXXX"
```

Then enable notarization in `electron-builder.yml` (set `mac.notarize: true`)
and run:

```bash
npm run dist:mac
```

The signed, notarized `.dmg` lands in `release/`.

> After packaging, `better-sqlite3` in your local `node_modules` is left built
> for whichever arch electron-builder compiled last (x64 when targeting both
> arm64 + x64). Before running `npm run dev` again on Apple Silicon, restore the
> local arm64 build:
>
> ```bash
> npm run rebuild
> ```

`build/entitlements.mac.plist` already declares the hardened-runtime
entitlements an Electron app needs (JIT, unsigned executable memory, library
validation disabled). Accessibility for paste injection is requested at runtime
via the macOS TCC prompt and needs no static entitlement.

## In-app updates (electron-updater)

Tora checks for updates on launch and every 6 hours, downloads in the background,
and shows a "Restart" pill when an update is ready (`src/main/services/updater.ts`,
`components/UpdateBanner.tsx`). The updater is **inert in dev and on unsigned
builds**, so it never interferes locally; macOS only applies **signed** updates.

The feed is GitHub Releases on the public `mocarram/tora` repo
(`publish:` in `electron-builder.yml`). The mac `zip` target produces the artifact
electron-updater applies plus the `latest-mac.yml` manifest; the `dmg` is for
first-time manual download.

### Cutting a release

1. Bump `version` in `package.json` (this is the version users update to).
2. Export the signing + notarization env vars above and set `mac.notarize: true`.
3. Provide a token so electron-builder can create the GitHub release:
   ```bash
   export GH_TOKEN="<a GitHub token with repo/contents write on mocarram/tora>"
   npm run build
   npx electron-builder --mac --publish always
   ```
   This uploads the `.dmg`, the `.zip` (both arches), and `latest-mac.yml` to a
   GitHub Release. Installed apps pick it up on their next check.

Notes:
- Auto-update needs the release artifacts to be **public**, which is why the repo
  (or at least its releases) must be public. A private repo would require shipping
  a token in the app - don't.
- Both `arm64` and `x64` are published; electron-updater serves each Mac the right
  one via `latest-mac.yml`.
- Pre-releases: tag/mark the GitHub release as a pre-release and set a `channel`
  if you later want a separate beta track.

## Automated releases (CI)

`.github/workflows/release.yml` does the manual flow above on a macOS runner when
you push a version tag, so a release is just:

```bash
# bump "version" in package.json first, commit, then:
git tag v0.1.0
git push origin v0.1.0
```

It builds, signs, notarizes, and uploads the dmg + zip + `latest-mac.yml` to a
**draft** GitHub Release (review it, then hit Publish). Add these once under
**Settings -> Secrets and variables -> Actions**:

| Secret | What |
| --- | --- |
| `MAC_CSC_LINK` | base64 of the Developer ID Application `.p12` (`base64 -i cert.p12 \| pbcopy`) |
| `MAC_CSC_KEY_PASSWORD` | password for that `.p12` |
| `APPLE_ID` | Apple ID email used for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | app-specific password for that Apple ID |
| `APPLE_TEAM_ID` | 10-character Apple Developer Team ID |

`GITHUB_TOKEN` is provided automatically and needs no setup. macOS runner minutes
are free on a public repo.

## Config slots left to you

- `appId` is `com.tora.clipboard`; change it to your own bundle id.
- Signing identity and notarization credentials: the env vars above.
- CloudKit (if ever activated): container id + API token, see `SYNC.md`.

## Checklist

- [ ] `npm run build` clean on macOS
- [ ] `npm run rebuild` (native module matches Electron ABI)
- [ ] Certs + notarization env vars exported
- [ ] `mac.notarize: true`
- [ ] `npm run dist:mac` produces a signed, notarized dmg
- [ ] Launch from `/Applications`, grant Accessibility, verify capture + paste
- [ ] `version` bumped in `package.json`
- [ ] `GH_TOKEN` exported; `electron-builder --mac --publish always` uploads dmg + zip + latest-mac.yml
- [ ] A prior installed build updates itself to the new release
