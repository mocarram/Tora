import { test, expect } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp, closeApp, seedClip, cardWith, itemCount } from './helpers'

/** Stability: no renderer errors across a real session, and data survives relaunch. */

test('a representative session logs no renderer errors', async () => {
  // Launch + capture polls + a long interaction chain: fine in isolation but
  // tight against the default 30s under full-suite load (same allowance as
  // the deck-behavior tests).
  test.setTimeout(60_000)
  const h = await launchApp()
  try {
    await seedClip(h, 'stability note one')
    await seedClip(h, 'https://stability.example/two')

    await h.page.keyboard.press('/')
    await h.page.getByRole('textbox', { name: 'Search' }).fill('stability')
    await h.page.getByRole('button', { name: 'Clear search' }).click()

    await h.page.getByRole('button', { name: 'Links' }).click()
    await h.page.getByRole('button', { name: 'All' }).click()

    await cardWith(h.page, 'stability note one')
      .getByRole('button', { name: 'Large preview' })
      .click()
    await h.page.keyboard.press('Escape')

    await h.page.getByRole('button', { name: 'Settings' }).first().click()
    await h.page.keyboard.press('Escape')

    expect(h.errors, `renderer errors: ${h.errors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(h)
  }
})

test('quit and relaunch preserves history', async () => {
  // Two full app launches: comfortably fast in isolation (~8s) but tight
  // against the default 30s when the whole suite is loading the machine (same
  // allowance as the deck-behavior tests).
  test.setTimeout(60_000)
  const userData = mkdtempSync(join(tmpdir(), 'tora-e2e-persist-'))
  const first = await launchApp({ userData })
  await seedClip(first, 'persist me across relaunch')
  const count = await itemCount(first.page)
  await closeApp(first)

  const second = await launchApp({ userData })
  try {
    expect(await itemCount(second.page)).toBe(count)
    await expect(cardWith(second.page, 'persist me across relaunch')).toBeVisible()
  } finally {
    await closeApp(second)
  }
})
