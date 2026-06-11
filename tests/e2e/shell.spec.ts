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

test('sidebar collapse persists across relaunch', async () => {
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
