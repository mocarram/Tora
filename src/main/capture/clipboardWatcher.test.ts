import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CaptureInput } from '@core/capture'

/**
 * Mutable fake pasteboard the mocked electron clipboard reads from. Each test
 * sets the fields it cares about in beforeEach-reset state.
 */
const fake = {
  text: '',
  html: '',
  rtf: '',
  formats: [] as string[],
  concealedTypes: [] as string[],
  // null = no image on the pasteboard. Otherwise raw bitmap bytes plus the
  // reported dimensions, so a test can hold dimensions fixed while changing
  // pixel content (the multi-photo regression scenario).
  image: null as { bytes: number[]; width: number; height: number } | null,
}

/** Build a fake NativeImage view over the current fake.image bytes. */
function makeNativeImage(bytes: number[]) {
  return {
    isEmpty: () => bytes.length === 0,
    getSize: () => ({
      width: fake.image?.width ?? 0,
      height: fake.image?.height ?? 0,
    }),
    toPNG: () => Buffer.from(bytes),
    toBitmap: () => Buffer.from(bytes),
    // Downscaling is a no-op for the fake: hashing the (already tiny) bytes is
    // enough to prove content sensitivity without a real raster pipeline.
    resize: () => makeNativeImage(bytes),
  }
}

vi.mock('electron', () => ({
  clipboard: {
    readText: () => fake.text,
    readHTML: () => fake.html,
    readRTF: () => fake.rtf,
    availableFormats: () => fake.formats,
    readImage: () => makeNativeImage(fake.image ? fake.image.bytes : []),
    has: (t: string) => fake.concealedTypes.includes(t),
    read: () => '',
    readBuffer: () => Buffer.alloc(0),
  },
}))

// Imported after the mock is registered.
const { ClipboardWatcher } = await import('./clipboardWatcher')

function snapshot(): CaptureInput | null {
  const w = new ClipboardWatcher(() => {})
  return (w as unknown as { readSnapshot(): CaptureInput | null }).readSnapshot()
}

describe('ClipboardWatcher.readSnapshot', () => {
  beforeEach(() => {
    fake.text = ''
    fake.html = ''
    fake.rtf = ''
    fake.formats = []
    fake.concealedTypes = []
    fake.image = null
  })

  it('treats plain text as plain text even when macOS synthesises an HTML read', () => {
    // pbcopy / any plain copy exposes only text/plain, yet Electron's readHTML()
    // returns a synthesised copy of that text on macOS. The snapshot must not
    // carry the phantom HTML, otherwise every plain copy becomes richText.
    fake.text = 'just plain text'
    fake.html = 'just plain text'
    fake.rtf = ''
    fake.formats = ['text/plain']

    const snap = snapshot()
    expect(snap?.text).toBe('just plain text')
    expect(snap?.html).toBeNull()
    expect(snap?.rtf).toBeNull()
  })

  it('keeps real HTML and RTF when the pasteboard advertises them', () => {
    fake.text = 'bold text'
    fake.html = "<meta charset='utf-8'><b>bold text</b>"
    fake.rtf = '{\\rtf1 bold text}'
    fake.formats = ['text/plain', 'text/html', 'text/rtf']

    const snap = snapshot()
    expect(snap?.html).toContain('<b>bold text</b>')
    expect(snap?.rtf).toContain('rtf1')
  })

  it('returns the concealed marker without reading content', () => {
    fake.concealedTypes = ['org.nspasteboard.ConcealedType']
    fake.text = 'secret'

    const snap = snapshot()
    expect(snap).toEqual({ concealed: true })
  })

  it('captures a second image with identical dimensions but different pixels', async () => {
    // Universal Clipboard regression: copy several iPhone photos in a row and
    // they often share the exact same width x height. A dimensions-only
    // signature treats the second photo as "no change" and silently drops it.
    const captured: CaptureInput[] = []
    const w = new ClipboardWatcher((input) => {
      captured.push(input)
    })
    const tick = () => (w as unknown as { tick(): Promise<void> }).tick()

    fake.formats = ['image/png']
    fake.image = { bytes: [1, 2, 3, 4], width: 4032, height: 3024 }
    await tick()

    // Second photo: same reported size, different bitmap bytes.
    fake.image = { bytes: [9, 8, 7, 6], width: 4032, height: 3024 }
    await tick()

    expect(captured).toHaveLength(2)
    expect(captured[0]?.image?.hash).not.toBe(captured[1]?.image?.hash)
  })
})
