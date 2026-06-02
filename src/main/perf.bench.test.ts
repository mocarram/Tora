import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Storage } from './storage'
import { SearchIndex } from './services/searchIndex'

/**
 * Performance pass. Builds a realistic 10k-item store and measures the
 * latency-critical paths. Numbers are printed for SUMMARY.md and asserted
 * against the spec budgets. Run: npx vitest run src/main/perf.bench.test.ts
 */
const N = 10_000
let dir: string
let storage: Storage
let index: SearchIndex

const WORDS = [
  'design',
  'tora',
  'spring',
  'amber',
  'clipboard',
  'token',
  'paste',
  'board',
  'search',
  'card',
]
const TYPES = ['text', 'url', 'code', 'color'] as const

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'tora-perf-'))
  storage = new Storage({ dbFile: join(dir, 'tora.db'), blobDir: join(dir, 'blobs') })
  const insert = storage.db.transaction(() => {
    for (let i = 0; i < N; i++) {
      const type = TYPES[i % TYPES.length]!
      const text = `${WORDS[i % WORDS.length]} ${WORDS[(i * 3) % WORDS.length]} item ${i}`
      storage.items.insert({
        id: storage.newId(),
        type,
        createdAt: Date.now() - i * 1000,
        sourceApp: i % 2 ? 'VS Code' : 'Safari',
        sourceBundleId: null,
        previewText: text,
        contentRef: null,
        contentHash: `h${i}`,
        byteSize: text.length,
        metadata: { kind: 'text', charCount: text.length, wordCount: 4 },
      })
    }
  })
  const t0 = performance.now()
  insert()
  const insertMs = performance.now() - t0
  console.log(
    `[perf] inserted ${N} items in ${insertMs.toFixed(0)}ms (${(insertMs / N).toFixed(3)}ms each)`,
  )
  index = new SearchIndex(storage)
})

afterAll(() => {
  storage.close()
  rmSync(dir, { recursive: true, force: true })
})

describe(`performance at ${N} items`, () => {
  it('pages the history list well under one frame', () => {
    const runs = 50
    const t0 = performance.now()
    for (let i = 0; i < runs; i++) {
      storage.items.query({
        filter: 'all',
        boardId: null,
        pinnedOnly: false,
        limit: 120,
        offset: 0,
      })
    }
    const avg = (performance.now() - t0) / runs
    console.log(`[perf] queryItems(page 120) avg ${avg.toFixed(2)}ms`)
    expect(avg).toBeLessThan(16)
  })

  it('keystroke-to-results stays under 50ms', () => {
    index.search('warm') // prime/build the index
    const queries = ['design', 'spring tok', 'tora item', 'amber', 'cl bo']
    let worst = 0
    for (const q of queries) {
      const t0 = performance.now()
      index.search(q)
      worst = Math.max(worst, performance.now() - t0)
    }
    console.log(`[perf] worst search latency (warm index) ${worst.toFixed(2)}ms`)
    expect(worst).toBeLessThan(50)
  })

  it('builds the search index quickly from cold', () => {
    const cold = new SearchIndex(storage)
    const t0 = performance.now()
    cold.search('design') // forces a rebuild
    const ms = performance.now() - t0
    console.log(`[perf] cold index build + first search ${ms.toFixed(2)}ms`)
    expect(ms).toBeLessThan(120)
  })
})
