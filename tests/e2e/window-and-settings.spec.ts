import { test, expect } from '@playwright/test'
import { launchApp, closeApp, seedClip, deck, getSetting, type AppHandle } from './helpers'

/** Window mode toggle and the settings surface (sections, toggles, clear data). */
let h: AppHandle

test.beforeAll(async () => {
  h = await launchApp()
})
test.afterAll(async () => {
  await closeApp(h)
})

test('Panel/Window mode toggle switches mode', async () => {
  await h.page.getByRole('tab', { name: 'Window' }).click()
  await expect.poll(() => getSetting(h.page, 'windowMode')).toBe('window')
  await expect(h.page.getByRole('tab', { name: 'Window' })).toHaveAttribute('aria-selected', 'true')

  await h.page.getByRole('tab', { name: 'Panel' }).click()
  await expect.poll(() => getSetting(h.page, 'windowMode')).toBe('panel')
})

test('window mode fills the grid width with no large right gap', async () => {
  for (let i = 0; i < 8; i++) await seedClip(h, `grid fill ${i} ${Date.now()}`)
  await h.page.getByRole('tab', { name: 'Window' }).click()
  await expect.poll(() => getSetting(h.page, 'windowMode')).toBe('window')

  const listbox = deck(h.page)
  await expect(listbox).toBeVisible()
  // The rightmost card's right edge should sit within a column's padding of the
  // listbox right edge - i.e. the columns fill the window, no ragged gap.
  await expect
    .poll(
      async () => {
        const lb = await listbox.boundingBox()
        if (!lb) return 9999
        const options = await listbox.getByRole('option').all()
        let maxRight = 0
        for (const o of options) {
          const b = await o.boundingBox()
          if (b) maxRight = Math.max(maxRight, b.x + b.width)
        }
        if (maxRight === 0) return 9999
        return lb.x + lb.width - maxRight
      },
      { timeout: 5000 },
    )
    .toBeLessThan(60)

  await h.page.getByRole('tab', { name: 'Panel' }).click()
})

test('settings opens, exposes every section, and closes', async () => {
  await h.page.getByRole('button', { name: 'Settings' }).first().click()
  const dialog = h.page.getByRole('dialog', { name: 'Settings' })
  await expect(dialog).toBeVisible()
  for (const s of [
    'General',
    'Appearance',
    'Capture',
    'Shortcuts',
    'Sync',
    'Privacy',
    'Data',
    'About',
  ]) {
    await expect(dialog.getByRole('button', { name: s })).toBeVisible()
  }
  await h.page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})

test('toggling reduce motion persists to settings', async () => {
  const before = await getSetting(h.page, 'reduceMotion')
  await h.page.getByRole('button', { name: 'Settings' }).first().click()
  const dialog = h.page.getByRole('dialog', { name: 'Settings' })
  await dialog.getByRole('button', { name: 'Appearance' }).click()
  await dialog.getByRole('switch', { name: 'Reduce motion' }).click()
  await expect.poll(() => getSetting(h.page, 'reduceMotion')).toBe(!before)
  await h.page.keyboard.press('Escape')
})

test('clear history empties the deck', async () => {
  await seedClip(h, `to be cleared ${Date.now()}`)
  await h.page.getByRole('button', { name: 'Settings' }).first().click()
  const dialog = h.page.getByRole('dialog', { name: 'Settings' })
  await dialog.getByRole('button', { name: 'Data' }).click()
  await dialog.getByRole('button', { name: 'Clear', exact: true }).click()

  const confirm = h.page.getByRole('alertdialog')
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: /Clear/ }).click()
  await h.page.keyboard.press('Escape').catch(() => {})

  // Deck is now empty.
  await expect(deck(h.page).getByRole('option')).toHaveCount(0)
  await expect(h.page.getByText('Nothing here yet')).toBeVisible()
})
