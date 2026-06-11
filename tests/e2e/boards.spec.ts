import { test, expect } from '@playwright/test'
import { launchApp, closeApp, seedClip, cardWith, type AppHandle } from './helpers'

/**
 * Boards live in the topbar pill strip: create, add a clip via
 * the save menu, filter to it, compose with category filters, rename and
 * delete via the pill's context menu (mouse and keyboard).
 */
let h: AppHandle
let savedBody: string

test.beforeAll(async () => {
  h = await launchApp()
})
test.afterAll(async () => {
  await closeApp(h)
})

const pills = (h2: AppHandle) => h2.page.getByRole('group', { name: 'Boards' })

test('create a board from the pill strip', async () => {
  await h.page.getByRole('button', { name: 'New board' }).click()
  const dialog = h.page.getByRole('dialog', { name: 'New board' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('textbox').fill('Receipts')
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(pills(h).getByRole('button', { name: 'Receipts', exact: true })).toBeVisible()
})

test('add a clip to a board and filter to it', async () => {
  savedBody = `board item ${Date.now()}`
  await seedClip(h, savedBody)
  await cardWith(h.page, savedBody).getByRole('button', { name: 'Save to board' }).click()
  const menu = h.page.getByRole('menu')
  await expect(menu).toBeVisible()
  await menu.getByRole('menuitem', { name: 'Receipts', exact: true }).click()

  // Filter to the board: only its items show.
  await pills(h).getByRole('button', { name: 'Receipts', exact: true }).click()
  await expect(cardWith(h.page, savedBody)).toBeVisible()
})

test('category filters compose with the active board', async () => {
  // Still on Receipts (it holds one text clip). The Images category empties
  // the view but stays on the board instead of bouncing back to the library.
  await h.page
    .getByRole('navigation', { name: 'Library' })
    .getByRole('button', { name: 'Images' })
    .click()
  await expect(h.page.getByText('This board is empty')).toBeVisible()
  await expect(pills(h).getByRole('button', { name: 'Receipts', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await h.page
    .getByRole('navigation', { name: 'Library' })
    .getByRole('button', { name: 'All' })
    .click()
  await expect(cardWith(h.page, savedBody)).toBeVisible()
})

test('the context menu opens from the keyboard and Escape returns focus', async () => {
  const pill = pills(h).getByRole('button', { name: 'Receipts', exact: true })
  await pill.focus()
  await h.page.keyboard.press('Shift+F10')

  const menu = h.page.getByRole('menu', { name: 'Receipts actions' })
  await expect(menu).toBeVisible()
  // The first menu item takes focus so arrow/tab keys work immediately.
  await expect(menu.getByRole('menuitem', { name: 'Rename' })).toBeFocused()

  await h.page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(pill).toBeFocused()
})

test('rename a board from its context menu', async () => {
  await pills(h).getByRole('button', { name: 'History' }).click()
  await pills(h).getByRole('button', { name: 'Receipts', exact: true }).click({ button: 'right' })
  await h.page
    .getByRole('menu', { name: 'Receipts actions' })
    .getByRole('menuitem', { name: 'Rename' })
    .click()

  const dialog = h.page.getByRole('dialog', { name: 'Rename board' })
  await expect(dialog).toBeVisible()
  const input = dialog.getByRole('textbox')
  await expect(input).toHaveValue('Receipts')
  await input.fill('Invoices')
  await dialog.getByRole('button', { name: 'Rename' }).click()
  await expect(pills(h).getByRole('button', { name: 'Invoices', exact: true })).toBeVisible()
})

test('delete a board from its context menu', async () => {
  await pills(h).getByRole('button', { name: 'Invoices', exact: true }).click({ button: 'right' })
  await h.page
    .getByRole('menu', { name: 'Invoices actions' })
    .getByRole('menuitem', { name: 'Delete' })
    .click()
  const confirm = h.page.getByRole('alertdialog')
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: /Delete/ }).click()
  await expect(pills(h).getByRole('button', { name: 'Invoices', exact: true })).toHaveCount(0)

  // The clip itself survives in the library.
  await expect(cardWith(h.page, savedBody)).toBeVisible()
})
