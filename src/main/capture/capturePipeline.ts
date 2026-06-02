import type { ClipItem } from '@core/model'
import { classifyCapture, isDuplicate, type CaptureInput } from '@core/capture'
import type { Storage } from '../storage'

export interface CaptureResult {
  kind: 'added' | 'deduped' | 'ignored'
  item?: ClipItem
}

/**
 * Turns a raw pasteboard snapshot into a stored clip. Enforces privacy rules
 * (concealed content and excluded apps are dropped), dedups consecutive
 * identical copies by bumping the timestamp, and persists large payloads to the
 * blob store rather than inlining them.
 */
export class CapturePipeline {
  constructor(private readonly storage: Storage) {}

  async ingest(input: CaptureInput): Promise<CaptureResult> {
    // Honour concealed/transient markers and the exclusion list.
    if (input.concealed) return { kind: 'ignored' }
    const excluded = this.storage.settings.get().excludedBundleIds
    if (input.sourceBundleId && excluded.includes(input.sourceBundleId)) {
      return { kind: 'ignored' }
    }

    const classified = classifyCapture(input)
    if (!classified) return { kind: 'ignored' }

    // Dedup: identical to a live item -> just bump it to the top.
    const existing = this.storage.items.findByHash(classified.contentHash)
    if (existing && isDuplicate(existing.contentHash, classified.contentHash)) {
      const touched = this.storage.items.touch(existing.id)
      return touched ? { kind: 'deduped', item: touched } : { kind: 'ignored' }
    }

    const id = this.storage.newId()

    // Persist blob payloads (text/html/rtf) to disk; reference by item id.
    let contentRef: string | null = null
    const blob = classified.blob
    if (blob.text !== undefined || blob.html !== undefined || blob.rtf !== undefined) {
      contentRef = id
      if (blob.text !== undefined) await this.storage.blobs.writeText(id, 'text.txt', blob.text)
      if (blob.html !== undefined) await this.storage.blobs.writeText(id, 'content.html', blob.html)
      if (blob.rtf !== undefined) await this.storage.blobs.writeText(id, 'content.rtf', blob.rtf)
    }

    const item = this.storage.items.insert({
      id,
      type: classified.type,
      createdAt: Date.now(),
      sourceApp: input.sourceApp ?? null,
      sourceBundleId: input.sourceBundleId ?? null,
      previewText: classified.previewText,
      contentRef,
      contentHash: classified.contentHash,
      byteSize: classified.byteSize,
      metadata: classified.metadata,
    })

    return { kind: 'added', item }
  }

  /**
   * Persist a captured image blob (raw bytes + optional thumbnail) for an item
   * already classified as an image. Called by the platform watcher which holds
   * the decoded buffers.
   */
  async attachImage(
    itemId: string,
    image: { ext: string; full: Uint8Array; thumbnail?: Uint8Array },
  ): Promise<void> {
    await this.storage.blobs.writeBuffer(itemId, `image.${image.ext}`, image.full)
    if (image.thumbnail) {
      await this.storage.blobs.writeBuffer(itemId, 'thumb.png', image.thumbnail)
    }
  }
}
