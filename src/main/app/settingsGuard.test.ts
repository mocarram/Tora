import { describe, expect, it } from 'vitest'
import type { AppSettings } from '@shared/ipc'
import { sanitizeSettingsPatch } from './settingsGuard'

const loose = (v: unknown): Partial<AppSettings> => v as Partial<AppSettings>

describe('sanitizeSettingsPatch', () => {
  it('passes a fully valid patch through unchanged', () => {
    const patch: Partial<AppSettings> = {
      theme: 'dark',
      accent: 'ocean',
      globalHotkey: 'Cmd+Shift+V',
      launchAtLogin: true,
      retentionDays: 30,
      storageSoftCapBytes: 500_000_000,
      pasteFormatDefault: 'plain',
      excludedBundleIds: ['com.1password.1password'],
      captureEnabled: false,
      syncProvider: 'icloud',
      windowMode: 'window',
    }
    expect(sanitizeSettingsPatch(patch)).toEqual(patch)
  })

  it('drops unknown keys (no prototype-pollution style passthrough)', () => {
    const out = sanitizeSettingsPatch(loose({ theme: 'dark', evil: 'x', __proto__: { a: 1 } }))
    expect(out).toEqual({ theme: 'dark' })
  })

  it('drops wrong-typed and out-of-enum values', () => {
    const out = sanitizeSettingsPatch(
      loose({
        theme: 'neon',
        accent: 42,
        captureEnabled: 'yes',
        syncProvider: '../../evil',
        windowMode: 'fullscreen',
        globalHotkey: '',
      }),
    )
    expect(out).toEqual({})
  })

  it('bounds numerics: rejects NaN/Infinity/negatives/fractional retention', () => {
    expect(sanitizeSettingsPatch(loose({ retentionDays: Number.NaN }))).toEqual({})
    expect(sanitizeSettingsPatch(loose({ retentionDays: -5 }))).toEqual({})
    expect(sanitizeSettingsPatch(loose({ retentionDays: 1.5 }))).toEqual({})
    expect(sanitizeSettingsPatch(loose({ retentionDays: 99999 }))).toEqual({})
    expect(sanitizeSettingsPatch(loose({ retentionDays: null }))).toEqual({ retentionDays: null })
    expect(sanitizeSettingsPatch(loose({ storageSoftCapBytes: Infinity }))).toEqual({})
    expect(sanitizeSettingsPatch(loose({ storageSoftCapBytes: -1 }))).toEqual({})
  })

  it('cleans excludedBundleIds: non-arrays dropped, non-strings filtered', () => {
    expect(sanitizeSettingsPatch(loose({ excludedBundleIds: 'com.x' }))).toEqual({})
    expect(
      sanitizeSettingsPatch(loose({ excludedBundleIds: ['ok.app', 7, null, '', 'b'.repeat(300)] })),
    ).toEqual({ excludedBundleIds: ['ok.app'] })
  })

  it('rejects oversized hotkey strings', () => {
    expect(sanitizeSettingsPatch(loose({ globalHotkey: 'x'.repeat(65) }))).toEqual({})
  })
})
