import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/**
 * SSRF guard for the opt-in link-preview fetcher. A user can copy any URL, so
 * when previews are enabled the app would otherwise fetch arbitrary hosts -
 * including internal services or the cloud metadata endpoint (169.254.169.254).
 * This blocks requests that resolve to private, loopback, link-local, or
 * reserved address space, and is applied to every redirect hop (see
 * linkPreview.ts), not just the first URL.
 *
 * The IP-range classification is pure and unit-tested; the DNS resolution that
 * maps a hostname to addresses is the only side-effecting part.
 *
 * Residual risk: a DNS-rebinding attacker could return a public address to this
 * lookup and a private one to the subsequent connect. Fully closing that needs
 * IP pinning at the socket layer, which `fetch` does not expose; for an opt-in,
 * off-by-default preview feature this allowlist-by-exclusion is proportionate.
 */

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let n = 0
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null
    const octet = Number(part)
    if (octet > 255) return null
    n = n * 256 + octet
  }
  return n >>> 0
}

function inV4Range(value: number, base: string, bits: number): boolean {
  const baseInt = ipv4ToInt(base)
  if (baseInt === null) return false
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
  return (value & mask) === (baseInt & mask)
}

function isPrivateIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip)
  if (n === null) return true // unparseable: treat as unsafe
  return (
    inV4Range(n, '0.0.0.0', 8) || // "this network"
    inV4Range(n, '10.0.0.0', 8) || // private
    inV4Range(n, '100.64.0.0', 10) || // carrier-grade NAT
    inV4Range(n, '127.0.0.0', 8) || // loopback
    inV4Range(n, '169.254.0.0', 16) || // link-local (incl. cloud metadata)
    inV4Range(n, '172.16.0.0', 12) || // private
    inV4Range(n, '192.0.0.0', 24) || // IETF protocol assignments
    inV4Range(n, '192.168.0.0', 16) || // private
    inV4Range(n, '198.18.0.0', 15) || // benchmarking
    inV4Range(n, '224.0.0.0', 4) || // multicast
    inV4Range(n, '240.0.0.0', 4) // reserved (incl. 255.255.255.255)
  )
}

function isPrivateIpv6(ip: string): boolean {
  let addr = ip.toLowerCase()
  const zone = addr.indexOf('%')
  if (zone >= 0) addr = addr.slice(0, zone) // strip scope id
  // IPv4-mapped / -compatible (e.g. ::ffff:169.254.169.254): classify the v4 part.
  const embedded = addr.match(/(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (embedded && embedded[1] && (addr.startsWith('::ffff:') || addr.startsWith('::'))) {
    return isPrivateIpv4(embedded[1])
  }
  if (addr === '::' || addr === '::1') return true // unspecified / loopback
  if (
    addr.startsWith('fe8') ||
    addr.startsWith('fe9') ||
    addr.startsWith('fea') ||
    addr.startsWith('feb')
  ) {
    return true // fe80::/10 link-local
  }
  if (addr.startsWith('fc') || addr.startsWith('fd')) return true // fc00::/7 unique local
  return false
}

/** True if an IP literal is in private/reserved/loopback/link-local space. */
export function isPrivateIp(ip: string): boolean {
  const version = isIP(ip)
  if (version === 4) return isPrivateIpv4(ip)
  if (version === 6) return isPrivateIpv6(ip)
  return true // not a valid IP: unsafe to proceed
}

/** True for hostnames that are inherently local and must never be fetched. */
export function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '')
  return (
    h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')
  )
}

/**
 * Resolve a host (or accept an IP literal) and report whether EVERY address it
 * maps to is publicly routable. Returns false on any private address, a blocked
 * name, an empty result, or a lookup failure (fail closed).
 */
export async function resolvesToPublicHost(host: string): Promise<boolean> {
  const bare = host.replace(/^\[|\]$/g, '') // strip IPv6 literal brackets
  if (isBlockedHost(bare)) return false
  if (isIP(bare)) return !isPrivateIp(bare)
  try {
    const addresses = await lookup(bare, { all: true })
    if (addresses.length === 0) return false
    return addresses.every((a) => !isPrivateIp(a.address))
  } catch {
    return false
  }
}
