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
}

vi.mock('electron', () => ({
  clipboard: {
    readText: () => fake.text,
    readHTML: () => fake.html,
    readRTF: () => fake.rtf,
    availableFormats: () => fake.formats,
    readImage: () => ({
      isEmpty: () => true,
      getSize: () => ({ width: 0, height: 0 }),
      toPNG: () => Buffer.alloc(0),
    }),
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
})
