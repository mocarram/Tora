import { test, expect } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp, closeApp, seedClip, deck, cardWith } from './helpers'

/**
 * Deck open/selection/scroll behavior (the autoscroll + stale-selection fixes).
 */

test('on open, the newest (current-clipboard) item is selected at the front', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'tora-e2e-open-'))
  const first = await launchApp({ userData })
  await seedClip(first, 'open behaviour older one')
  await seedClip(first, 'open behaviour NEWEST current clipboard')
  await closeApp(first)

  // Relaunch: the panel-summon path should select the newest item and sit at the
  // front, not restore a stale selection/scroll.
  const h = await launchApp({ userData })
  try {
    await expect(cardWith(h.page, 'NEWEST current clipboard')).toHaveAttribute(
      'aria-selected',
      'true',
    )
    const left = await deck(h.page).evaluate(
      (el) => (el as unknown as { scrollLeft: number }).scrollLeft,
    )
    expect(left).toBeLessThan(20)
  } finally {
    await closeApp(h)
  }
})

test('capturing a new clip does not autoscroll the deck', async () => {
  const h = await launchApp()
  try {
    for (let i = 0; i < 14; i++) await seedClip(h, `autoscroll guard item ${i} ${Date.now()}`)
    const listbox = deck(h.page)
    type Scroller = { scrollLeft: number; scrollTo: (o: { left: number }) => void }
    // Scroll the deck away from the front and let it settle.
    await listbox.evaluate((el) => (el as unknown as Scroller).scrollTo({ left: 900 }))
    await h.page.waitForTimeout(150)
    const before = await listbox.evaluate((el) => (el as unknown as Scroller).scrollLeft)
    expect(before).toBeGreaterThan(100)

    // A new capture must not move the viewport.
    await h.app.evaluate(({ clipboard }) => clipboard.writeText(`late arrival ${Date.now()}`))
    await h.page.waitForTimeout(900) // > one 500ms poll
    const after = await listbox.evaluate((el) => (el as unknown as Scroller).scrollLeft)
    expect(Math.abs(after - before)).toBeLessThan(8)
  } finally {
    await closeApp(h)
  }
})
