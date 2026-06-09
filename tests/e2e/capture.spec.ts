import { test, expect } from '@playwright/test'
import { launchApp, closeApp, seedClip, cardWith, itemCount, type AppHandle } from './helpers'

/**
 * Capture pipeline: every clipboard write is classified and rendered as the
 * right card type, and identical copies dedup instead of stacking.
 */
let h: AppHandle

test.beforeAll(async () => {
  h = await launchApp()
})
test.afterAll(async () => {
  await closeApp(h)
})

const stamp = (): string => `${Date.now()}${Math.floor(performance.now())}`

test('plain text captures as a text card', async () => {
  const s = `qa plain text ${stamp()}`
  await seedClip(h, s)
  await expect(cardWith(h.page, s).locator('[data-type="text"]')).toBeVisible()
})

test('a URL captures as a link card', async () => {
  const s = `https://tora-qa.example/${stamp()}`
  await seedClip(h, s)
  await expect(cardWith(h.page, 'tora-qa.example').locator('[data-type="url"]')).toBeVisible()
})

test('a hex colour captures as a colour card', async () => {
  // A bare hex is unambiguous; use a fresh value so it cannot dedup.
  const hex = `#${stamp()
    .slice(-6)
    .replace(/[^0-9a-f]/gi, 'a')}`
  await seedClip(h, hex)
  await expect(cardWith(h.page, hex.toUpperCase()).locator('[data-type="color"]')).toBeVisible()
})

test('a code snippet captures as a code card', async () => {
  const s = `function qa_${stamp()}(x) {\n  return x.map((y) => y.id)\n}`
  await seedClip(h, s)
  await expect(cardWith(h.page, 'function qa_').locator('[data-type="code"]')).toBeVisible()
})

test('an identical copy dedups instead of adding a second card', async () => {
  const a = `dedup target ${stamp()}`
  await seedClip(h, a) // count +1
  const afterA = await itemCount(h.page)

  // A different clip, then re-copy A. Re-copying A must bump, not duplicate.
  await seedClip(h, `dedup spacer ${stamp()}`) // count +1
  await h.app.evaluate(({ clipboard }, t) => clipboard.writeText(t), a)

  // Give the watcher poll a beat; the count must not exceed afterA + 1 (the spacer).
  await h.page.waitForTimeout(1500)
  expect(await itemCount(h.page)).toBe(afterA + 1)
  // And there is still exactly one card carrying A's text.
  await expect(cardWith(h.page, a)).toHaveCount(1)
})
