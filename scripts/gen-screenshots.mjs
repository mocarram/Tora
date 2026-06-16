// Generate clean marketing screenshots of Tora's real UI.
//
// Launches the REAL built app (out/main/index.js) through Playwright's Electron
// support against an isolated, EMPTY TORA_USER_DATA dir, seeds a handful of
// innocuous demo clips, drives the UI into a few representative states, and
// captures high-res (2x) PNGs. No real clipboard history is ever read.
//
// Prereqs: `npm run build` and `npm run rebuild` (better-sqlite3 on Electron ABI).
// Run:     node scripts/gen-screenshots.mjs
// Output:  /tmp/tora-shots/*.png  (selected + cropped into site/ afterwards)

import { _electron as electron } from '@playwright/test'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const OUT = process.env.SHOT_DIR || '/tmp/tora-shots'
mkdirSync(OUT, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'tora-shots-'))

const log = (...a) => console.log('[shots]', ...a)
const pause = (ms) => new Promise((r) => setTimeout(r, ms))

const app = await electron.launch({
  args: [
    'out/main/index.js',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--force-device-scale-factor=2',
  ],
  env: { ...process.env, TORA_USER_DATA: userData },
})
const page = await app.firstWindow()
await page.waitForLoadState('domcontentloaded')
// Playwright emulates prefers-color-scheme: light by default. Emulate dark so the
// renderer (which tracks the OS while the setting is "system") resolves to dark -
// the same result a real user gets from the default Follow-macOS setting on a dark
// Mac. The stored theme setting is left untouched, so Settings shows "Follow macOS".
await page.emulateMedia({ colorScheme: 'dark' })
log('launched, userData =', userData)

// Dismiss first-run onboarding.
const start = page.getByRole('button', { name: 'Get started' })
if (await start.isVisible({ timeout: 12000 }).catch(() => false)) {
  await start.click()
  await page
    .getByRole('dialog', { name: 'Welcome to Tora' })
    .waitFor({ state: 'hidden', timeout: 12000 })
    .catch(() => {})
  log('onboarding dismissed')
}

// Nice link cards (favicon + title) where the network allows.
await page.evaluate('window.tora.updateSettings({ fetchLinkPreviews: true })').catch(() => {})

// Render in dark mode - exactly what the default "Follow macOS" setting does on a
// dark Mac. We drive nativeTheme.themeSource directly and leave the stored theme
// setting untouched ('system'), so the Settings shot still shows "Follow macOS".
await app.evaluate(({ nativeTheme }) => {
  nativeTheme.themeSource = 'dark'
})
await pause(500)

const itemCount = () =>
  page.evaluate(() => window.tora.getStorageStats().then((s) => s.itemCount))

// page.evaluate awaits the promise (real count); waitForFunction does NOT await a
// returned promise (it's truthy and resolves instantly), so poll the count here.
async function waitForCount(target) {
  for (let i = 0; i < 50; i++) {
    if ((await itemCount()) >= target) return true
    await pause(150)
  }
  return false
}

async function seedText(text) {
  const before = await itemCount()
  await app.evaluate(({ clipboard }, t) => clipboard.writeText(t), text)
  await waitForCount(before + 1)
  await pause(150)
}

async function seedImage(path) {
  const before = await itemCount()
  await app.evaluate(({ clipboard, nativeImage }, p) => {
    clipboard.writeImage(nativeImage.createFromPath(p))
  }, path)
  await waitForCount(before + 1)
  await pause(150)
}

// Seed diverse, innocuous demo clips (newest ends up at the front).
const code = `export function termScore(term: string, target: string): number | null {
  const i = target.toLowerCase().indexOf(term.toLowerCase())
  if (i < 0) return null
  return SCORE_BASE + (i === 0 ? SCORE_START : 0)
}`
const json = `{
  "name": "tora",
  "version": "0.1.1",
  "private": true
}`
await seedText('Everything you copy lands on a deck of cards you can search and pin.')
await seedText('https://www.apple.com/macos/')
await seedText('#2f6f4e')
await seedText('brew install --cask tora')
await seedText(json)
await seedText('https://github.com/mocarram/Tora')
await seedText('The quick brown fox jumps over the lazy dog.')
await seedText('#6e5ef0')
await seedImage('build/accent-icons/amber.png')
await seedText(code)
await seedText('#e08a3c')
log('seeded; itemCount =', await itemCount())
await pause(600)

// 0. Panel mode - the signature single-row strip summoned by the hotkey. The real
// app frosts the desktop through native vibrancy, which a web-contents screenshot
// can't reproduce, so paint a solid brand-dark backdrop for a clean flat capture.
const bg = await page.addStyleTag({
  content: ':root, html, body, #root { background: #0f1525 !important; }',
})
await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0]
  if (w) {
    w.setBounds({ width: 1180, height: 340 })
    w.center()
  }
})
await pause(500)
await page.screenshot({ path: join(OUT, '00-panel.png') })
log('00 panel')
await bg.evaluate((el) => el.remove())

// Window mode for the detail shots. The crops below are tight on the content that
// matters so it stays legible when shown small on the site, rather than a whole
// window scaled down to nothing.
await page.getByRole('button', { name: 'Window', exact: true }).click().catch(() => {})
await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0]
  if (w) {
    w.setBounds({ width: 1080, height: 720 })
    w.center()
  }
})
await pause(500)

const deckEl = page.getByRole('listbox', { name: 'Clip history' })
const boxOf = (loc) => loc.boundingBox()
async function clipShot(name, region) {
  await page.screenshot({ path: join(OUT, name), clip: region })
  log(name)
}
// Bounding box that encloses two elements, plus a margin.
function union(a, b, m = 14) {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x: x - m,
    y: y - m,
    width: Math.max(a.x + a.width, b.x + b.width) - x + m * 2,
    height: Math.max(a.y + a.height, b.y + b.height) - y + m * 2,
  }
}

// 2. Deck variety - a tight block of cards (colour, code, image, link), legible.
try {
  const d = await boxOf(deckEl)
  await clipShot('02-deck.png', {
    x: d.x,
    y: d.y,
    width: Math.min(640, d.width),
    height: 500,
  })
} catch (e) {
  log('02 deck failed', e.message)
}

// 4. Boards - create two boards and open the Save-to-board popover on a card: a
// small, legible interaction that shows the whole feature at readable scale.
async function newBoard(name) {
  await page.getByRole('button', { name: 'New board' }).click()
  const dlg = page.getByRole('dialog', { name: 'New board' })
  await dlg.getByRole('textbox').fill(name)
  await dlg.getByRole('button', { name: 'Create' }).click()
  await dlg.waitFor({ state: 'hidden', timeout: 6000 }).catch(() => {})
  await pause(250)
}
try {
  await newBoard('Snippets')
  await newBoard('Receipts')
  const codeCard = page.getByRole('option').filter({ hasText: 'export function termScore' }).first()
  await codeCard.getByRole('button', { name: 'Save to board' }).click()
  const menu = page.getByRole('menu')
  await menu.waitFor({ state: 'visible', timeout: 4000 })
  await pause(350)
  await clipShot('04-boards.png', union(await boxOf(codeCard), await boxOf(menu)))
  await page.keyboard.press('Escape')
  await pause(200)
} catch (e) {
  log('boards step failed', e.message)
}

// 5. Search - the bar with the Aa / ab toggles plus the matching cards, cropped to
// the top strip (no empty deck below).
try {
  await page.keyboard.press('/')
  await pause(250)
  const search = page.getByRole('textbox', { name: 'Search' })
  await search.fill('tora')
  await pause(300)
  await page.getByRole('button', { name: 'Match whole word' }).click()
  await pause(450)
  const d = await boxOf(deckEl)
  await clipShot('05-search.png', {
    x: d.x,
    y: 0,
    width: Math.min(860, d.width),
    height: d.y + 300,
  })
  const clear = page.getByRole('button', { name: 'Clear search' })
  if (await clear.isVisible().catch(() => false)) await clear.click()
  await pause(250)
} catch (e) {
  log('search step failed', e.message)
}

// 6. Large preview - the modal only (Space on the code card), legible code.
try {
  const card = page.getByRole('option').filter({ hasText: 'export function termScore' }).first()
  await card.click()
  await page.keyboard.press(' ')
  const dlg = page.getByRole('dialog').first()
  await dlg.waitFor({ state: 'visible', timeout: 4000 })
  await pause(400)
  await dlg.screenshot({ path: join(OUT, '06-preview.png') })
  log('06 preview')
  await page.keyboard.press('Escape')
  await pause(250)
} catch (e) {
  log('preview step failed', e.message)
}

// 7. Settings - the Appearance dialog only (accent vibes), legible.
try {
  await page.getByRole('button', { name: 'Settings' }).first().click()
  const dlg = page.getByRole('dialog', { name: 'Settings' })
  await dlg.waitFor({ state: 'visible', timeout: 4000 })
  await dlg.getByRole('button', { name: 'Appearance' }).click()
  await pause(400)
  await dlg.screenshot({ path: join(OUT, '07-settings-dialog.png') })
  log('07 settings')
  await page.keyboard.press('Escape')
  await pause(250)
} catch (e) {
  log('settings step failed', e.message)
}

log('done -> ', OUT)
await app.close()
