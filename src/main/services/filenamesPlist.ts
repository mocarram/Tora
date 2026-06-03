/**
 * Builders/parsers for the macOS `NSFilenamesPboardType` pasteboard format (an
 * XML plist array of POSIX paths). Pure and Electron-free so it can be unit
 * tested; the Electron-dependent read/write lives in pasteboard.ts / the watcher.
 */

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

export function buildFilenamesPlist(paths: readonly string[]): string {
  const items = paths.map((p) => `\t<string>${escapeXml(p)}</string>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<array>
${items}
</array>
</plist>`
}

export function parseFilenamesPlist(xml: string): string[] {
  const matches = [...xml.matchAll(/<string>([\s\S]*?)<\/string>/g)]
  return matches.map((m) => unescapeXml((m[1] ?? '').trim())).filter((p) => p.length > 0)
}
