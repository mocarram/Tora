import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Critical-flow E2E. Drives the built Electron app. REQUIRES:
 *   1. A real Electron binary (unset ELECTRON_SKIP_BINARY_DOWNLOAD, reinstall).
 *   2. A built app: `npm run build`.
 *   3. A display server (use xvfb-run on Linux CI).
 * Not run on the headless Linux build host; see GAPS.md.
 */
let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  const userData = mkdtempSync(join(tmpdir(), 'tora-e2e-'))
  app = await electron.launch({
    args: ['out/main/index.js'],
    env: { ...process.env, TORA_USER_DATA: userData },
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await app.close()
})

test('window loads with the Tora wordmark', async () => {
  await expect(page.getByText('Tora').first()).toBeVisible()
})

test('onboarding can be dismissed', async () => {
  const start = page.getByRole('button', { name: 'Get started' })
  if (await start.isVisible().catch(() => false)) {
    await start.click()
  }
  await expect(page.getByRole('listbox', { name: 'Clip history' })).toBeVisible()
})

test('search input is focusable with /', async () => {
  await page.keyboard.press('/')
  const search = page.getByRole('textbox', { name: 'Search' })
  await expect(search).toBeFocused()
})

test('settings opens and closes', async () => {
  await page.getByRole('button', { name: 'Settings' }).first().click()
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeHidden()
})

test('quick filters switch the view', async () => {
  await page.getByRole('button', { name: 'Links' }).click()
  await expect(page.getByRole('listbox', { name: 'Clip history' })).toBeVisible()
})
