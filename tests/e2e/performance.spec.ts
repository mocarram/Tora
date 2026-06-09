import { test, expect } from '@playwright/test'
import { launchApp, closeApp, seedClip, cardWith, measureQuery, type AppHandle } from './helpers'

/**
 * Performance signals e2e can measure for real: capture-to-render latency and
 * query round-trip. Large-history ranking perf is covered by the core unit test
 * (rankItems over 10k); seeding 10k via the clipboard is not feasible here.
 */
let h: AppHandle

test.beforeAll(async () => {
  h = await launchApp()
})
test.afterAll(async () => {
  await closeApp(h)
})

test('capture-to-render latency is well under a second of overhead', async () => {
  const body = `latency probe ${Date.now()}`
  const start = Date.now()
  await h.app.evaluate(({ clipboard }, t) => clipboard.writeText(t), body)
  await expect(cardWith(h.page, body)).toBeVisible({ timeout: 3000 })
  // 500ms watcher poll + capture + render. Generous ceiling that still catches a
  // real regression (e.g. a multi-second stall).
  expect(Date.now() - start).toBeLessThan(1800)
})

test('queryItems round-trips quickly over a populated history', async () => {
  for (let i = 0; i < 10; i++) await seedClip(h, `perf history entry number ${i} ${Date.now()}`)

  const ms = await measureQuery(h.page, 'entry number')
  expect(ms).toBeLessThan(400)
})
