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

// Switch to the roomier Window mode and size it 16:10 for marketing shots.
await page.getByRole('button', { name: 'Window', exact: true }).click().catch(() => {})
await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0]
  if (w) {
    w.setBounds({ width: 1280, height: 800 })
    w.center()
  }
})
await pause(400)

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

// 1. Primary / hero - full window, All filter.
await page.screenshot({ path: join(OUT, '01-primary.png') })
log('01 primary')

// 2. Deck close-up - the clip-history listbox only.
await page
  .getByRole('listbox', { name: 'Clip history' })
  .screenshot({ path: join(OUT, '02-deck.png') })
  .catch((e) => log('02 deck failed', e.message))

// 3. Boards - create two boards, file the code clip, capture pills + deck.
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
  // File the JSON + code clips into Snippets via the card's Save-to-board.
  for (const needle of ['"version": "0.1.1"', 'export function termScore']) {
    const card = page.getByRole('option').filter({ hasText: needle }).first()
    await card.getByRole('button', { name: 'Save to board' }).click()
    await page
      .getByRole('menu')
      .getByRole('menuitem', { name: 'Snippets', exact: true })
      .click()
    await pause(200)
  }
  await page.screenshot({ path: join(OUT, '03-boards.png') })
  log('03 boards')
  // Filtered to the Snippets board.
  await page
    .getByRole('group', { name: 'Boards' })
    .getByRole('button', { name: 'Snippets', exact: true })
    .click()
  await pause(400)
  await page.screenshot({ path: join(OUT, '04-board-filtered.png') })
  log('04 board filtered')
  // Back to all.
  await page
    .getByRole('group', { name: 'Boards' })
    .getByRole('button', { name: 'History', exact: true })
    .click()
    .catch(() => {})
  await pause(300)
} catch (e) {
  log('boards step failed', e.message)
}

// 5. Search with Aa / ab toggles - expand, type, enable whole-word.
try {
  await page.keyboard.press('/')
  await pause(250)
  const search = page.getByRole('textbox', { name: 'Search' })
  await search.fill('tora')
  await pause(300)
  await page.getByRole('button', { name: 'Match whole word' }).click()
  await pause(400)
  await page.screenshot({ path: join(OUT, '05-search.png') })
  log('05 search')
  // Clear search.
  const clear = page.getByRole('button', { name: 'Clear search' })
  if (await clear.isVisible().catch(() => false)) await clear.click()
  await pause(250)
} catch (e) {
  log('search step failed', e.message)
}

// 6. Large preview - Space on the code card.
try {
  const card = page.getByRole('option').filter({ hasText: 'export function termScore' }).first()
  await card.click()
  await page.keyboard.press(' ')
  await page.getByRole('dialog').first().waitFor({ state: 'visible', timeout: 4000 })
  await pause(400)
  await page.screenshot({ path: join(OUT, '06-preview.png') })
  log('06 preview')
  await page.keyboard.press('Escape')
  await pause(250)
} catch (e) {
  log('preview step failed', e.message)
}

// 7. Settings - Appearance (accent vibes).
try {
  await page.getByRole('button', { name: 'Settings' }).first().click()
  const dlg = page.getByRole('dialog', { name: 'Settings' })
  await dlg.waitFor({ state: 'visible', timeout: 4000 })
  await dlg.getByRole('button', { name: 'Appearance' }).click()
  await pause(400)
  await page.screenshot({ path: join(OUT, '07-settings.png') })
  await dlg.screenshot({ path: join(OUT, '07-settings-dialog.png') }).catch(() => {})
  log('07 settings')
  await page.keyboard.press('Escape')
  await pause(250)
} catch (e) {
  log('settings step failed', e.message)
}

log('done -> ', OUT)
await app.close()
