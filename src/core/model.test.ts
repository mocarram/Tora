import { describe, expect, it } from 'vitest'
import { FAVOURITES_BOARD_ID } from './model'

describe('core model', () => {
  it('exposes a stable favourites board id', () => {
    expect(FAVOURITES_BOARD_ID).toBe('board-favourites')
  })
})
