import { test, expect } from '@playwright/test'
import { launchApp, closeApp, seedClip, deck, cardWith, type AppHandle } from './helpers'

/** Browsing: search focus + query, quick filters, and keyboard selection. */
let h: AppHandle

test.beforeAll(async () => {
  h = await launchApp()
  await seedClip(h, 'navigation alpha note unique-aaa')
  await seedClip(h, 'https://nav-test.example/links-bbb')
  await seedClip(h, 'navigation gamma note unique-ccc')
})
test.afterAll(async () => {
  await closeApp(h)
})

test('"/" focuses search and a query narrows the deck', async () => {
  await h.page.keyboard.press('/')
  const search = h.page.getByRole('textbox', { name: 'Search' })
  await expect(search).toBeFocused()

  await search.fill('unique-aaa')
  await expect(cardWith(h.page, 'unique-aaa')).toBeVisible()
  await expect(cardWith(h.page, 'unique-ccc')).toHaveCount(0)

  // Clear restores the full deck.
  await h.page.getByRole('button', { name: 'Clear search' }).click()
  await expect(cardWith(h.page, 'unique-ccc')).toBeVisible()
})

test('the Links quick filter shows only link clips', async () => {
  await h.page.getByRole('button', { name: 'Links' }).click()
  await expect(cardWith(h.page, 'nav-test.example')).toBeVisible()
  await expect(cardWith(h.page, 'unique-aaa')).toHaveCount(0)

  // Back to All.
  await h.page.getByRole('button', { name: 'All' }).click()
  await expect(cardWith(h.page, 'unique-aaa')).toBeVisible()
})

test('arrow keys move the card selection', async () => {
  // Select the first card, then step selection with the keyboard.
  const first = deck(h.page).getByRole('option').first()
  await first.click()
  await expect(first).toHaveAttribute('aria-selected', 'true')

  await h.page.keyboard.press('ArrowRight')
  await expect(first).toHaveAttribute('aria-selected', 'false')
  await expect(deck(h.page).getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true')

  await h.page.keyboard.press('ArrowLeft')
  await expect(first).toHaveAttribute('aria-selected', 'true')
})

test('Aa and ab search toggles refine the matches', async () => {
  await seedClip(h, 'the cat sat on the mat')
  await seedClip(h, 'a long category list')
  await seedClip(h, 'CamelCaseToken value')

  // Expand the collapsed search field first (it is width-clipped until focused).
  await h.page.keyboard.press('/')
  const search = h.page.getByRole('textbox', { name: 'Search' })
  await expect(search).toBeFocused()

  // Default: case-insensitive substring - "cat" matches both "cat" and "category".
  await search.fill('cat')
  await expect(cardWith(h.page, 'the cat sat')).toBeVisible()
  await expect(cardWith(h.page, 'category list')).toBeVisible()

  // Whole word (ab): "cat" now matches only the standalone word.
  await h.page.getByRole('button', { name: 'Match whole word' }).click()
  await expect(cardWith(h.page, 'the cat sat')).toBeVisible()
  await expect(cardWith(h.page, 'category list')).toHaveCount(0)
  await h.page.getByRole('button', { name: 'Match whole word' }).click() // back off

  // Match case (Aa): "camelcase" stops matching "CamelCaseToken".
  await search.fill('camelcase')
  await expect(cardWith(h.page, 'CamelCaseToken')).toBeVisible()
  await h.page.getByRole('button', { name: 'Match case' }).click()
  await expect(cardWith(h.page, 'CamelCaseToken')).toHaveCount(0)
  await search.fill('CamelCase')
  await expect(cardWith(h.page, 'CamelCaseToken')).toBeVisible()
  await h.page.getByRole('button', { name: 'Match case' }).click() // back off

  // Clean up the query so later tests start fresh.
  await h.page.getByRole('button', { name: 'Clear search' }).click()
})
