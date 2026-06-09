# Installing a Tora test build

These are **pre-release builds for testers**. They are code-signed but **not yet
notarized by Apple**, so macOS Gatekeeper will block the first launch until you
explicitly allow it (one time). Notarized public builds - which install with no
warning and update themselves - come later.

> **Heads up:** auto-update is **off** in these test builds. You'll get new
> versions by downloading them here, not automatically.

## 1. Pick the right download

| Your Mac | File |
| --- | --- |
| Apple Silicon (M1/M2/M3/M4) | `Tora-<version>-arm64.dmg` |
| Intel | `Tora-<version>.dmg` |

Not sure?  → Apple menu → About This Mac. "Chip" = Apple Silicon, "Processor" = Intel.

### Verify the download (optional but recommended)

Because this isn't from the App Store, confirm the file wasn't tampered with:

```bash
shasum -a 256 ~/Downloads/Tora-<version>-arm64.dmg
```

Compare the output against the checksum published alongside the build.

## 2. Install

1. Open the `.dmg`.
2. Drag **Tora** onto the **Applications** folder.
3. Eject the dmg.

## 3. First launch (clear the Gatekeeper warning - one time)

Because the build isn't notarized, the first open shows either *"Tora can't be
opened because Apple cannot check it for malicious software"* or *"Tora is
damaged and can't be opened."* That's expected for an un-notarized build - it is
**not** actually damaged.

**Recommended - run this once in Terminal**, which removes the quarantine flag
macOS adds to downloaded files:

```bash
xattr -dr com.apple.quarantine /Applications/Tora.app
```

Then open Tora normally (double-click).

<details>
<summary>Alternative without Terminal</summary>

Right-click **Tora** in Applications → **Open** → **Open** again in the dialog.
This works for the "unidentified developer" wording; if you instead saw
"damaged", use the Terminal command above.
</details>

## 4. Grant Accessibility (for paste)

On first run Tora asks for **Accessibility** - this is what lets it paste
straight back into the app you were using. Approve it:

- System Settings → Privacy & Security → **Accessibility** → enable **Tora**.

Capture and search work without it; only direct paste needs it.

## 5. Try it

- Press **⌘⇧V** to summon the panel (also in the menu-bar icon).
- Copy some text, a link, an image - it lands on the deck.
- Type to fuzzy-search; arrow keys to navigate; **Enter** to paste.
- Drag a card onto a board in the sidebar to save it.

## Updating to a newer test build

Download the new dmg and repeat steps 2-3 (drag over the old one to replace it).
Your history and settings are preserved. If macOS re-quarantines it, re-run the
`xattr` command.

## Uninstall

- Drag **Tora** from Applications to the Trash.
- Your local data lives at `~/Library/Application Support/Tora` - delete that
  folder too for a clean removal.

## Reporting issues

Tell us your macOS version, your Mac's chip (Apple Silicon / Intel), the Tora
version (menu-bar icon → settings), and what you did right before the problem.
