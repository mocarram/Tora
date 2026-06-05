import { useEffect, useState } from 'react'

/**
 * Looks up the source app's icon (a data-URL PNG) by bundle id and caches it
 * per app for the session. Many cards share the same few source apps, so the
 * cache and in-flight dedupe mean each app is resolved at most once. Returns
 * null until resolved, or permanently when the app cannot be resolved (the card
 * then shows nothing in that slot). Resolution is fully fault-isolated: it can
 * never throw into the render path.
 */

const cache = new Map<string, string | null>()
const inflight = new Map<string, Promise<string | null>>()

function load(bundleId: string): Promise<string | null> {
  let pending = inflight.get(bundleId)
  if (!pending) {
    // Fully isolated: the bridge call is wrapped in an async IIFE with optional
    // chaining and try/catch, so a missing method or any throw resolves to null
    // instead of escaping. This path must never be able to crash the renderer.
    pending = (async () => {
      try {
        return (await window.tora?.getAppIcon?.(bundleId)) ?? null
      } catch {
        return null
      }
    })().then((url) => {
      cache.set(bundleId, url)
      inflight.delete(bundleId)
      return url
    })
    inflight.set(bundleId, pending)
  }
  return pending
}

export function useAppIcon(bundleId: string | null): string | null {
  // The value is read straight from the cache on every render; the effect only
  // kicks off a one-time async resolve and bumps a counter to re-render when it
  // lands. This keeps state out of the effect body (no synchronous setState).
  const [, bump] = useState(0)

  useEffect(() => {
    if (!bundleId || cache.has(bundleId)) return
    let active = true
    load(bundleId)
      .then(() => {
        if (active) bump((n) => n + 1)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [bundleId])

  return bundleId ? (cache.get(bundleId) ?? null) : null
}
