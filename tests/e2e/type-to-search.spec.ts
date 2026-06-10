import { test, expect } from '@playwright/test'
import { launchApp, closeApp, seedClip, deck, cardWith, type AppHandle } from './helpers'

/**
 * Type-to-search: with the deck focused, just typing lands in the search bar
 * and filters; card actions live behind Cmd so they keep working mid-query.
 */
let h: AppHandle

test.beforeAll(async () => {
  h = await launchApp()
  await seedClip(h, 'tts alpha lorem-one')
  await seedClip(h, 'tts beta lorem-two')
})
test.afterAll(async () => {
  await closeApp(h)
})

const search = () => h.page.getByRole('textbox', { name: 'Search' })

test.beforeEach(async () => {
  // Start each test from a clean, deck-focused state.
  const clear = h.page.getByRole('button', { name: 'Clear search' })
  if (await clear.isVisible().catch(() => false)) await clear.click()
  await deck(h.page).click()
})

test('typing with the deck focused goes straight into search and filters', async () => {
  await expect(search()).not.toBeFocused()
  await h.page.keyboard.type('lorem-two', { delay: 20 })

  await expect(search()).toBeFocused()
  await expect(search()).toHaveValue('lorem-two')
  await expect(cardWith(h.page, 'lorem-two')).toBeVisible()
  await expect(cardWith(h.page, 'lorem-one')).toHaveCount(0)
})

test('bare letters no longer trigger card actions (typing "p" does not pin)', async () => {
  const card = cardWith(h.page, 'lorem-one')
  await card.click()
  await h.page.keyboard.type('p')
  await expect(search()).toHaveValue('p')
  await expect(card.locator('[title="Pinned"]')).toHaveCount(0)
})

test('Cmd+C copies the selected card even while the search field is focused', async () => {
  const body = 'tts copy-target lorem-three'
  await seedClip(h, body)
  await cardWith(h.page, body).click()

  // Focus search via typing (a query that still matches the card), then Cmd+C.
  await h.page.keyboard.type('lorem-three')
  await expect(search()).toBeFocused()
  await h.page.keyboard.press('Meta+c')

  // The card's content is on the system clipboard.
  const onClipboard = await h.app.evaluate(({ clipboard }) => clipboard.readText())
  expect(onClipboard).toBe(body)
})

test('Space still expands the preview from the deck (not typed into search)', async () => {
  await cardWith(h.page, 'lorem-one').click()
  await h.page.keyboard.press(' ')
  await expect(h.page.getByRole('dialog')).toBeVisible()
  await expect(search()).not.toBeFocused()
  await h.page.keyboard.press('Escape')
  await expect(h.page.getByRole('dialog')).toBeHidden()
})

test('arrow keys still navigate while a query is active', async () => {
  // Select the oldest match first so the query-reload keeps it selected: it
  // lands LAST in the filtered results, so ArrowUp always has room to move
  // (ArrowDown from the last item clamps in place by design).
  await cardWith(h.page, 'lorem-one').click()
  await h.page.keyboard.type('tts', { delay: 20 })
  await expect(search()).toBeFocused()

  const options = deck(h.page).getByRole('option')
  const selectedId = (): Promise<string | null> =>
    deck(h.page)
      .locator('[role="option"][aria-selected="true"]')
      .first()
      .getAttribute('data-item-id')

  // Let the debounced query land before sampling the selection.
  await expect.poll(() => options.count()).toBeGreaterThanOrEqual(2)
  const before = await selectedId()
  await h.page.keyboard.press('ArrowUp')
  await expect.poll(selectedId).not.toBe(before)
  await expect(search()).toBeFocused() // navigating did not steal focus
})
