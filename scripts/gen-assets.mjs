// Generates Tora's raster assets from code so no opaque binaries are committed
// by hand: the app icon (dark tile + amber stripes) and a monochrome
// macOS menu-bar template icon. Run: node scripts/gen-assets.mjs
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

// rgba: Uint8Array of size w*h*4
function encodePng(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type RGBA
  const stride = w * 4
  const raw = Buffer.alloc((stride + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0 // filter none
    rgba.copy ? rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
             : Buffer.from(rgba.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function px(buf, w, x, y, [r, g, b, a]) {
  const i = (y * w + x) * 4
  buf[i] = r
  buf[i + 1] = g
  buf[i + 2] = b
  buf[i + 3] = a
}

// Rounded-rect fill helper.
function fillRoundRect(buf, w, x0, y0, rw, rh, radius, colour) {
  for (let y = y0; y < y0 + rh; y++) {
    for (let x = x0; x < x0 + rw; x++) {
      const dx = Math.min(x - x0, x0 + rw - 1 - x)
      const dy = Math.min(y - y0, y0 + rh - 1 - y)
      if (dx < radius && dy < radius) {
        const cx = x0 + (x - x0 < radius ? radius : rw - radius - 1)
        const cy = y0 + (y - y0 < radius ? radius : rh - radius - 1)
        if (Math.hypot(x - cx, y - cy) > radius) continue
      }
      px(buf, w, x, y, colour)
    }
  }
}

// App icon: a macOS-style rounded tile with transparent padding (the art fills
// ~80% of the canvas, matching Apple's icon grid so it sizes like other Dock
// icons), bearing the three amber Tora stripes.
function appIcon(canvas) {
  const buf = Buffer.alloc(canvas * canvas * 4)
  const ink = [21, 18, 14, 255]
  const amber = [232, 132, 60, 255]

  // ~10% transparent margin each side -> tile is ~80% of the canvas.
  const margin = Math.round(canvas * 0.1)
  const tile = canvas - margin * 2
  const x0 = margin
  const y0 = margin
  const radius = Math.round(tile * 0.2237) // Apple squircle corner ratio
  fillRoundRect(buf, canvas, x0, y0, tile, tile, radius, ink)

  // Three stripes, centred within the tile.
  const stripeH = Math.round(tile * 0.1)
  const gap = Math.round(tile * 0.075)
  const left = x0 + Math.round(tile * 0.2)
  const widths = [0.52, 0.34, 0.46]
  const blockH = stripeH * 3 + gap * 2
  let y = y0 + Math.round((tile - blockH) / 2)
  for (const wf of widths) {
    fillRoundRect(buf, canvas, left, y, Math.round(tile * wf), stripeH, Math.round(stripeH / 2), amber)
    y += stripeH + gap
  }
  return encodePng(canvas, canvas, buf)
}

// Menu-bar template: transparent with black stripes (macOS recolours it).
function trayTemplate(size) {
  const buf = Buffer.alloc(size * size * 4)
  const black = [0, 0, 0, 255]
  const stripeH = Math.max(1, Math.round(size * 0.12))
  const gap = Math.max(1, Math.round(size * 0.1))
  const left = Math.round(size * 0.22)
  const widths = [0.56, 0.36, 0.48]
  let y = Math.round(size * 0.28)
  for (const wf of widths) {
    fillRoundRect(buf, size, left, y, Math.round(size * wf), stripeH, Math.floor(stripeH / 2), black)
    y += stripeH + gap
  }
  return encodePng(size, size, buf)
}

mkdirSync(join(root, 'build'), { recursive: true })
writeFileSync(join(root, 'build', 'icon.png'), appIcon(1024))
writeFileSync(join(root, 'build', 'trayTemplate.png'), trayTemplate(22))
writeFileSync(join(root, 'build', 'trayTemplate@2x.png'), trayTemplate(44))
console.log('Wrote build/icon.png, build/trayTemplate.png, build/trayTemplate@2x.png')
