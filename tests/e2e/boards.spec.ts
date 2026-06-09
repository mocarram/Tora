import { test, expect } from '@playwright/test'
import { launchApp, closeApp, seedClip, cardWith, type AppHandle } from './helpers'

/** Boards: create, add a clip via the save menu, filter to it, rename, delete. */
let h: AppHandle

test.beforeAll(async () => {
  h = await launchApp()
})
test.afterAll(async () => {
  await closeApp(h)
})

const nav = (h2: AppHandle) => h2.page.getByRole('navigation', { name: 'Filters and boards' })

test('create a board from the sidebar', async () => {
  await h.page.getByRole('button', { name: 'New board' }).click()
  const dialog = h.page.getByRole('dialog', { name: 'New board' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('textbox').fill('Receipts')
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(nav(h).getByRole('button', { name: 'Receipts', exact: true })).toBeVisible()
})

test('add a clip to a board and filter to it', async () => {
  const body = `board item ${Date.now()}`
  await seedClip(h, body)
  await cardWith(h.page, body).getByRole('button', { name: 'Save to board' }).click()
  const menu = h.page.getByRole('menu')
  await expect(menu).toBeVisible()
  await menu.getByRole('menuitem', { name: 'Receipts', exact: true }).click()

  // Filter to the board: only its items show.
  await nav(h).getByRole('button', { name: 'Receipts', exact: true }).click()
  await expect(cardWith(h.page, body)).toBeVisible()
})

test('rename a board', async () => {
  await nav(h).getByRole('button', { name: 'All' }).click()
  const row = nav(h).getByRole('button', { name: 'Receipts', exact: true })
  await row.hover()
  await nav(h)
    .getByRole('button', { name: /^Rename Receipts/ })
    .click()
  const input = nav(h).getByRole('textbox', { name: /^Rename/ })
  await input.fill('Invoices')
  await input.press('Enter')
  await expect(nav(h).getByRole('button', { name: 'Invoices', exact: true })).toBeVisible()
})

test('delete a board', async () => {
  const row = nav(h).getByRole('button', { name: 'Invoices', exact: true })
  await row.hover()
  await nav(h)
    .getByRole('button', { name: /^Delete Invoices/ })
    .click()
  const confirm = h.page.getByRole('alertdialog')
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: /Delete/ }).click()
  await expect(nav(h).getByRole('button', { name: 'Invoices', exact: true })).toHaveCount(0)
})
