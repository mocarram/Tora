import { describe, it, expect } from 'vitest'
import { isPrivateIp, isBlockedHost, resolvesToPublicHost } from './ssrfGuard'

describe('isPrivateIp', () => {
  it('flags loopback, private, and link-local IPv4', () => {
    for (const ip of [
      '127.0.0.1',
      '10.0.0.1',
      '172.16.5.4',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254', // cloud metadata
      '100.64.0.1', // CGNAT
      '0.0.0.0',
      '224.0.0.1', // multicast
      '255.255.255.255',
    ]) {
      expect(isPrivateIp(ip), ip).toBe(true)
    }
  })

  it('allows public IPv4', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1']) {
      expect(isPrivateIp(ip), ip).toBe(false)
    }
  })

  it('flags loopback, link-local, and unique-local IPv6', () => {
    for (const ip of [
      '::1',
      '::',
      'fe80::1',
      'fc00::1',
      'fd12:3456::1',
      '::ffff:127.0.0.1',
      '::ffff:169.254.169.254',
    ]) {
      expect(isPrivateIp(ip), ip).toBe(true)
    }
  })

  it('allows public IPv6', () => {
    expect(isPrivateIp('2606:4700:4700::1111')).toBe(false)
  })

  it('treats non-IP strings as unsafe', () => {
    expect(isPrivateIp('not-an-ip')).toBe(true)
  })
})

describe('isBlockedHost', () => {
  it('blocks local hostnames', () => {
    for (const h of [
      'localhost',
      'LOCALHOST',
      'foo.localhost',
      'router.local',
      'db.internal',
      'localhost.',
    ]) {
      expect(isBlockedHost(h), h).toBe(true)
    }
  })
  it('allows normal hostnames', () => {
    for (const h of ['example.com', 'sub.example.org', 'localhost.example.com']) {
      expect(isBlockedHost(h), h).toBe(false)
    }
  })
})

describe('resolvesToPublicHost', () => {
  it('rejects an IP literal in private space without a DNS lookup', async () => {
    expect(await resolvesToPublicHost('169.254.169.254')).toBe(false)
    expect(await resolvesToPublicHost('[::1]')).toBe(false)
  })
  it('rejects blocked hostnames', async () => {
    expect(await resolvesToPublicHost('localhost')).toBe(false)
  })
  it('accepts a public IP literal', async () => {
    expect(await resolvesToPublicHost('1.1.1.1')).toBe(true)
  })
})
