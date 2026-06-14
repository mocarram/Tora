import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkLatestRelease, compareVersions, RELEASES_URL } from './releaseCheck'

describe('compareVersions', () => {
  it('orders by numeric precedence, not string', () => {
    expect(compareVersions('0.10.0', '0.9.0')).toBe(1)
    expect(compareVersions('0.9.0', '0.10.0')).toBe(-1)
  })

  it('treats equal versions as 0 and ignores a leading v', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
    expect(compareVersions('v1.2.3', '1.2.3')).toBe(0)
    expect(compareVersions('v2.0.0', 'v1.9.9')).toBe(1)
  })

  it('handles differing segment counts and prerelease suffixes', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0)
    expect(compareVersions('1.2.1', '1.2')).toBe(1)
    expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBe(0) // suffix ignored
    expect(compareVersions('1.0.0', '0.9.0-rc.4')).toBe(1)
  })

  it('treats malformed segments as 0 instead of poisoning the compare with NaN', () => {
    // Were a segment to parse to NaN, both > and < are false; guard it to 0.
    expect(compareVersions('1.x.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.2.0', '1.x.9')).toBe(1)
  })
})

describe('checkLatestRelease', () => {
  afterEach(() => vi.unstubAllGlobals())

  const stubFetch = (impl: () => Promise<Response>): void => {
    vi.stubGlobal('fetch', vi.fn(impl))
  }

  it('reports outdated when the latest tag is newer', async () => {
    stubFetch(() => Promise.resolve(new Response(JSON.stringify({ tag_name: 'v0.2.0' }))))
    const r = await checkLatestRelease('0.1.0')
    expect(r).toEqual({
      current: '0.1.0',
      latest: 'v0.2.0',
      isOutdated: true,
      releasesUrl: RELEASES_URL,
    })
  })

  it('reports up to date when on the latest tag', async () => {
    stubFetch(() => Promise.resolve(new Response(JSON.stringify({ tag_name: 'v0.1.0' }))))
    const r = await checkLatestRelease('0.1.0')
    expect(r.latest).toBe('v0.1.0')
    expect(r.isOutdated).toBe(false)
  })

  it('degrades to unknown (latest null) on a non-200 (e.g. private repo 404)', async () => {
    stubFetch(() => Promise.resolve(new Response('nope', { status: 404 })))
    const r = await checkLatestRelease('0.1.0')
    expect(r.latest).toBeNull()
    expect(r.isOutdated).toBe(false)
  })

  it('degrades to unknown when fetch throws (offline / aborted)', async () => {
    stubFetch(() => Promise.reject(new Error('network down')))
    const r = await checkLatestRelease('0.1.0')
    expect(r.latest).toBeNull()
  })

  it('degrades to unknown when the payload has no tag_name', async () => {
    stubFetch(() => Promise.resolve(new Response(JSON.stringify({ nope: true }))))
    const r = await checkLatestRelease('0.1.0')
    expect(r.latest).toBeNull()
  })
})
