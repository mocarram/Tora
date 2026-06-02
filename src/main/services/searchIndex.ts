import { rankItems, type SearchCandidate } from '@core/search'
import type { Storage } from '../storage'

/**
 * In-memory search index. Holds a lightweight candidate row per live item so
 * fuzzy ranking (in core) stays well under the 50ms budget at 10k+ items
 * without touching disk per keystroke. Rebuilt lazily and kept warm by the
 * capture/mutation events that mark it stale.
 */
export class SearchIndex {
  private candidates: SearchCandidate[] = []
  private stale = true

  constructor(private readonly storage: Storage) {}

  markStale(): void {
    this.stale = true
  }

  private rebuild(): void {
    const rows = this.storage.items.allSearchRows()
    this.candidates = rows.map((r) => ({
      id: r.id,
      text: r.previewText,
      secondary: r.sourceApp,
      updatedAt: r.updatedAt,
    }))
    this.stale = false
  }

  /** Returns item ids ranked for the query (best first). */
  search(query: string): string[] {
    if (this.stale) this.rebuild()
    return rankItems(query, this.candidates).map((r) => r.id)
  }
}
