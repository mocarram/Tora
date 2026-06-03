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

`build/entitlements.mac.plist` already declares the hardened-runtime
entitlements an Electron app needs (JIT, unsigned executable memory, library
validation disabled). Accessibility for paste injection is requested at runtime
via the macOS TCC prompt and needs no static entitlement.

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
