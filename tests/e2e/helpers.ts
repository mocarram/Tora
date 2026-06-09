import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Locator,
  type Page,
} from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Shared harness for the Tora end-to-end suite. Every spec drives the REAL built
 * app (out/main/index.js) through Playwright's Electron support, against an
 * isolated TORA_USER_DATA dir so a run never reads or mutates real history.
 *
 * Requires a built app (npm run build) and better-sqlite3 built for Electron's
 * ABI (npm run rebuild). macOS only; see GAPS.md.
 */

export interface AppHandle {
  app: ElectronApplication
  page: Page
  userData: string
  /** Renderer console + page errors seen this session. Should stay empty. */
  errors: string[]
}

/** Launch the app isolated, and (by default) dismiss the first-run onboarding. */
export async function launchApp(
  opts: { userData?: string; onboard?: boolean } = {},
): Promise<AppHandle> {
  const userData = opts.userData ?? mkdtempSync(join(tmpdir(), 'tora-e2e-'))
  const errors: string[] = []
  const app = await electron.launch({
    args: ['out/main/index.js'],
    env: { ...process.env, TORA_USER_DATA: userData },
  })
  const page = await app.firstWindow()
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(e.message))
  await page.waitForLoadState('domcontentloaded')

  if (opts.onboard !== false) {
    const start = page.getByRole('button', { name: 'Get started' })
    if (await start.isVisible({ timeout: 12_000 }).catch(() => false)) {
      await start.click()
      await expect(page.getByRole('dialog', { name: 'Welcome to Tora' })).toBeHidden({
        timeout: 12_000,
      })
    }
  }
  return { app, page, userData, errors }
}

export async function closeApp(h: AppHandle): Promise<void> {
  await h.app.close()
}

/**
 * The preload bridge, cast to a concrete shape inside the browser context so the
 * type-aware lint resolves it (window.tora is injected, not in the DOM lib).
 */
type Bridge = {
  getStorageStats(): Promise<{ itemCount: number; totalBytes: number }>
  getSettings(): Promise<Record<string, unknown>>
  queryItems(req: unknown): Promise<{ total: number }>
}

/** Live item count via the IPC bridge. */
export function itemCount(page: Page): Promise<number> {
  return page.evaluate(() =>
    (globalThis as unknown as { tora: Bridge }).tora.getStorageStats().then((s) => s.itemCount),
  )
}

/** Read a single settings value via the IPC bridge. */
export function getSetting(page: Page, key: string): Promise<unknown> {
  return page.evaluate(
    (k) => (globalThis as unknown as { tora: Bridge }).tora.getSettings().then((s) => s[k]),
    key,
  )
}

/** Time (ms) a representative getStorageStats + queryItems round-trip in-renderer. */
export function measureQuery(page: Page, query: string): Promise<number> {
  return page.evaluate(async (q) => {
    const tora = (globalThis as unknown as { tora: Bridge }).tora
    const t0 = performance.now()
    await tora.getStorageStats()
    await tora.queryItems({
      query: q,
      filter: 'all',
      boardId: null,
      limit: 60,
      offset: 0,
      pinnedOnly: false,
    })
    return performance.now() - t0
  }, query)
}

/**
 * Put text on the system clipboard from the app's main process and wait for the
 * watcher to capture it. Exercises the real capture path end to end and returns
 * once the new clip has landed (item count grew). Note: this writes the real
 * system clipboard, so an e2e run transiently clobbers it.
 */
export async function seedClip(h: AppHandle, text: string): Promise<void> {
  const before = await itemCount(h.page)
  await h.app.evaluate(({ clipboard }, t) => clipboard.writeText(t), text)
  await expect
    .poll(() => itemCount(h.page), { timeout: 6000, intervals: [150, 250, 400, 600] })
    .toBeGreaterThan(before)
}

/** The clip-history listbox (deck in panel mode, grid in window mode). */
export function deck(page: Page): Locator {
  return page.getByRole('listbox', { name: 'Clip history' })
}

/** The card option whose visible text contains `text`. */
export function cardWith(page: Page, text: string): Locator {
  return page.getByRole('option').filter({ hasText: text })
}
