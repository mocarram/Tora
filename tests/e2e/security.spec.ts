import { test, expect } from '@playwright/test'
import { statSync } from 'node:fs'
import { join } from 'node:path'
import { launchApp, closeApp, seedClip, type AppHandle } from './helpers'

/** Security posture that can be checked at runtime against the real renderer. */
let h: AppHandle

test.beforeAll(async () => {
  h = await launchApp()
})
test.afterAll(async () => {
  await closeApp(h)
})

test('the renderer has no Node access, only the typed bridge', async () => {
  const probe = await h.page.evaluate(() => {
    const w = globalThis as unknown as Record<string, unknown>
    return {
      require: typeof w.require,
      module: typeof w.module,
      process: typeof w.process,
      tora: typeof w.tora,
    }
  })
  expect(probe.require).toBe('undefined')
  expect(probe.module).toBe('undefined')
  expect(probe.process).toBe('undefined')
  // The single typed IPC bridge is the only injected surface.
  expect(probe.tora).toBe('object')
})

test('on-disk data is owner-only (dir 0700, db 0600)', async () => {
  await seedClip(h, `perms probe ${Date.now()}`) // ensures the db file exists
  const dirMode = statSync(h.userData).mode & 0o777
  const dbMode = statSync(join(h.userData, 'tora.db')).mode & 0o777
  expect(dirMode).toBe(0o700)
  expect(dbMode).toBe(0o600)
})
