import { describe, expect, it } from 'vitest'
import { mergeSnapshots, pickWinner, recordKey, type SyncRecord } from './sync'

const rec = (over: Partial<SyncRecord>): SyncRecord => ({
  type: 'item',
  id: 'a',
  rev: 1,
  updatedAt: 100,
  deleted: false,
  data: { v: 1 },
  ...over,
})

describe('pickWinner', () => {
  it('prefers the existing when other is null', () => {
    const a = rec({})
    expect(pickWinner(a, null)).toBe(a)
    expect(pickWinner(null, a)).toBe(a)
  })
  it('newer updatedAt wins', () => {
    expect(pickWinner(rec({ updatedAt: 100 }), rec({ updatedAt: 200 }))?.updatedAt).toBe(200)
  })
  it('higher rev breaks updatedAt ties', () => {
    expect(pickWinner(rec({ rev: 1 }), rec({ rev: 2 }))?.rev).toBe(2)
  })
  it('a delete wins an exact tie (no resurrection)', () => {
    const live = rec({ deleted: false })
    const dead = rec({ deleted: true, data: null })
    expect(pickWinner(live, dead)?.deleted).toBe(true)
  })
  it('is deterministic regardless of argument order', () => {
    const x = rec({ id: 'a', data: { v: 1 } })
    const y = rec({ id: 'a', data: { v: 2 } })
    expect(pickWinner(x, y)).toBe(pickWinner(y, x))
  })
})

describe('mergeSnapshots', () => {
  it('returns only records that change locally', () => {
    const local = new Map<string, SyncRecord>([
      [recordKey({ type: 'item', id: 'a' }), rec({ id: 'a', updatedAt: 100 })],
      [recordKey({ type: 'item', id: 'b' }), rec({ id: 'b', updatedAt: 100 })],
    ])
    const remote = new Map<string, SyncRecord>([
      [recordKey({ type: 'item', id: 'a' }), rec({ id: 'a', updatedAt: 200 })], // newer -> apply
      [recordKey({ type: 'item', id: 'b' }), rec({ id: 'b', updatedAt: 50 })], // older -> skip
      [recordKey({ type: 'item', id: 'c' }), rec({ id: 'c', updatedAt: 10 })], // new -> apply
    ])
    const toApply = mergeSnapshots(local, remote)
    expect(toApply.map((r) => r.id).sort()).toEqual(['a', 'c'])
  })
})
