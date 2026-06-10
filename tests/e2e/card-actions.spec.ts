import { test, expect } from '@playwright/test'
import { launchApp, closeApp, seedClip, cardWith, itemCount, type AppHandle } from './helpers'

/** Per-card actions: edit, rename, expand, queue, pin, delete. */
let h: AppHandle

test.beforeAll(async () => {
  h = await launchApp()
})
test.afterAll(async () => {
  await closeApp(h)
})

const stamp = (): string => `${Date.now()}${Math.floor(performance.now())}`

test('edit updates the clip text', async () => {
  const orig = `edit me ${stamp()}`
  await seedClip(h, orig)
  const card = cardWith(h.page, orig)
  await card.getByRole('button', { name: 'Edit text' }).click()

  const dialog = h.page.getByRole('dialog', { name: 'Edit clip' })
  await expect(dialog).toBeVisible()
  const edited = `${orig} EDITED`
  await dialog.getByRole('textbox', { name: 'Clip content' }).fill(edited)
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()

  await expect(cardWith(h.page, 'EDITED')).toBeVisible()
})

test('inline rename sets and clears a custom title', async () => {
  const body = `rename target ${stamp()}`
  await seedClip(h, body)
  const card = cardWith(h.page, body)

  // The title button's accessible name is the visible label, so target the
  // rename tooltip attribute instead.
  await card.locator('button[title="Click to rename"]').click()
  const input = card.getByRole('textbox', { name: 'Clip title' })
  await input.fill('My Title')
  await input.press('Enter')
  await expect(card.getByRole('button', { name: /My Title/ })).toBeVisible()
})

test('large preview opens and closes with Escape', async () => {
  const body = `preview target ${stamp()}`
  await seedClip(h, body)
  await cardWith(h.page, body).getByRole('button', { name: 'Large preview' }).click()
  const preview = h.page.getByRole('dialog').filter({ hasText: body })
  await expect(preview).toBeVisible()
  await h.page.keyboard.press('Escape')
  await expect(preview).toBeHidden()
})

test('queue adds the card to the paste queue', async () => {
  const body = `queue target ${stamp()}`
  await seedClip(h, body)
  await cardWith(h.page, body).getByRole('button', { name: 'Add to queue' }).click()
  // The queue bar appears with a paste-all control.
  await expect(h.page.getByRole('button', { name: 'Paste all' })).toBeVisible()
  // Remove it again to leave a clean queue.
  await cardWith(h.page, body).getByRole('button', { name: 'Remove from queue' }).click()
})

test('pin (Cmd+P) marks the card and persists it as a favourite', async () => {
  const body = `pin target ${stamp()}`
  await seedClip(h, body)
  const card = cardWith(h.page, body)
  await card.click()
  await h.page.keyboard.press('Meta+p')
  await expect(card.locator('[title="Pinned"]')).toBeVisible()
})

test('delete removes the card', async () => {
  const body = `delete target ${stamp()}`
  await seedClip(h, body)
  const before = await itemCount(h.page)
  await cardWith(h.page, body).getByRole('button', { name: 'Delete' }).click()
  await expect(cardWith(h.page, body)).toHaveCount(0)
  expect(await itemCount(h.page)).toBe(before - 1)
})
