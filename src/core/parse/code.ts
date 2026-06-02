import type { CodeMetadata } from '../model'

/**
 * Heuristic code detection. Conservative: prose with the odd bracket should not
 * register as code. Returns metadata (with a best-effort language guess) or null.
 * Final, prettier highlighting is done in the renderer with highlight.js; this
 * only decides the item TYPE, so it must be pure and platform-agnostic.
 */

interface LangSignature {
  language: string
  patterns: RegExp[]
}

const SIGNATURES: LangSignature[] = [
  {
    language: 'typescript',
    patterns: [
      /\b(interface|type|enum)\s+\w+/,
      /:\s*(string|number|boolean)\b/,
      /\bimport\s.+from\s/,
    ],
  },
  {
    language: 'javascript',
    patterns: [
      /\b(const|let|var)\s+\w+\s*=/,
      /=>\s*[{(]/,
      /\bfunction\s*\w*\s*\(/,
      /\bconsole\.\w+/,
    ],
  },
  {
    language: 'python',
    patterns: [/\bdef\s+\w+\s*\(/, /\bimport\s+\w+/, /:\s*$/m, /\bself\b/, /\bprint\(/],
  },
  {
    language: 'rust',
    patterns: [/\bfn\s+\w+\s*\(/, /\blet\s+mut\b/, /\bimpl\b/, /->\s*\w+/, /::\w+/],
  },
  { language: 'go', patterns: [/\bfunc\s+\w+\s*\(/, /\bpackage\s+\w+/, /:=/, /\bimport\s+\(/] },
  {
    language: 'json',
    patterns: [/^\s*[{[]/, /"\w+"\s*:/],
  },
  {
    language: 'sql',
    patterns: [/\b(SELECT|INSERT|UPDATE|DELETE|CREATE TABLE)\b/i, /\bFROM\b/i, /\bWHERE\b/i],
  },
  {
    language: 'shell',
    patterns: [/^#!.*\b(sh|bash|zsh)\b/, /\$\(/, /\b(echo|cd|export|sudo|npm|git)\b\s/],
  },
  {
    language: 'css',
    patterns: [/[.#]?\w+\s*\{[^}]*:[^}]*;/, /:\s*(var\(--|#[0-9a-f]{3,8})/i],
  },
  {
    language: 'html',
    patterns: [/<\/?[a-z][\w-]*(\s[^>]*)?>/i, /<!DOCTYPE/i],
  },
]

const STRUCTURE = [
  /[;{}]/,
  /=>/,
  /\b(function|class|def|fn|func|return|import|export)\b/,
  /^\s{2,}\S/m,
]

export function detectCode(raw: string): CodeMetadata | null {
  const text = raw.replace(/\s+$/, '')
  if (text.length < 6 || text.length > 200_000) return null

  const lines = text.split('\n')
  const lineCount = lines.length

  let structureScore = 0
  for (const re of STRUCTURE) if (re.test(text)) structureScore++

  let best: { language: string; score: number } | null = null
  for (const sig of SIGNATURES) {
    let score = 0
    for (const re of sig.patterns) if (re.test(text)) score++
    if (score > 0 && (!best || score > best.score)) best = { language: sig.language, score }
  }

  const langScore = best?.score ?? 0
  const symbolDensity = (text.match(/[{}();=<>[\]]/g)?.length ?? 0) / text.length

  // Require either a strong language match or clear structural code signals.
  const looksLikeCode =
    langScore >= 2 ||
    (langScore >= 1 && structureScore >= 1) ||
    (structureScore >= 2 && symbolDensity > 0.02) ||
    (lineCount >= 3 && structureScore >= 2)

  if (!looksLikeCode) return null
  return { kind: 'code', language: best?.language ?? null, lineCount }
}
