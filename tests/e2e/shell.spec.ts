import { test, expect } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp, closeApp, seedClip, cardWith, type AppHandle } from './helpers'

/** The app shell: collapsible category rail + topbar settings gear. */
let h: AppHandle
const TEXT_CLIP = 'shell rail text clip'

test.beforeAll(async () => {
  h = await launchApp()
  await seedClip(h, TEXT_CLIP)
})
test.afterAll(async () => {
  await closeApp(h)
})

const rail = (h2: AppHandle) => h2.page.getByRole('navigation', { name: 'Library' })

test('sidebar collapses to an icon rail and expands back', async () => {
  await expect(rail(h).getByText('Images')).toBeVisible()

  await rail(h).getByRole('button', { name: 'Collapse sidebar' }).click()
  // Icon-only: labels hide but the buttons keep accessible names (titles).
  await expect(rail(h).getByText('Images')).toBeHidden()
  await expect(rail(h).getByRole('button', { name: 'Images' })).toBeVisible()

  await rail(h).getByRole('button', { name: 'Expand sidebar' }).click()
  await expect(rail(h).getByText('Images')).toBeVisible()
})

test('filters still work from the collapsed rail', async () => {
  await rail(h).getByRole('button', { name: 'Collapse sidebar' }).click()
  await rail(h).getByRole('button', { name: 'Links' }).click()
  // The text clip is filtered out under Links, and back in under All.
  await expect(cardWith(h.page, TEXT_CLIP)).toHaveCount(0)
  await rail(h).getByRole('button', { name: 'All' }).click()
  await expect(cardWith(h.page, TEXT_CLIP)).toBeVisible()
  await rail(h).getByRole('button', { name: 'Expand sidebar' }).click()
})

test('settings opens from the topbar gear', async () => {
  await h.page.getByRole('button', { name: 'Settings' }).first().click()
  await expect(h.page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
  await h.page.keyboard.press('Escape')
  await expect(h.page.getByRole('dialog', { name: 'Settings' })).toBeHidden()
})

test('the sync badge tooltip dismisses when the window loses focus', async () => {
  // Enable sync so the badge renders, hover to open its tooltip, then simulate
  // the panel hiding (window blur): the tooltip must not survive to the next
  // summon. Regression for a tooltip that stuck open across hide/reshow.
  await h.page.evaluate('window.tora.updateSettings({ syncProvider: "icloud" })')
  const badge = h.page.getByRole('status')
  await expect(badge).toBeVisible({ timeout: 8000 })

  await badge.hover()
  await expect(h.page.getByRole('tooltip')).toBeVisible()

  await h.page.evaluate('window.dispatchEvent(new Event("blur"))')
  await expect(h.page.getByRole('tooltip')).toHaveCount(0)

  // The badge is a status indicator, not a tab stop: landing on it while
  // tabbing used to pop the tooltip open. It must carry no tabindex.
  await expect(badge).not.toHaveAttribute('tabindex')

  // Back to local-only so later tests see no badge.
  await h.page.evaluate('window.tora.updateSettings({ syncProvider: "local" })')
})

test('sidebar collapse persists across relaunch', async () => {
  // Two full app launches: fast in isolation but tight against the default 30s
  // under full-suite load (same allowance as the other double-launch tests).
  test.setTimeout(60_000)
  const userData = mkdtempSync(join(tmpdir(), 'tora-e2e-rail-'))
  const first = await launchApp({ userData })
  await first.page.getByRole('button', { name: 'Collapse sidebar' }).click()
  await expect(first.page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible()
  await closeApp(first)

  const second = await launchApp({ userData })
  await expect(second.page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible({
    timeout: 10000,
  })
  await closeApp(second)
})
