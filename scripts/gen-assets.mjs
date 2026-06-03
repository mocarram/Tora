// Generates Tora's raster assets from code so no opaque binaries are committed
// by hand: the app icon (a macOS-style glass tile + amber bars) and a
// monochrome macOS menu-bar template icon. Run: node scripts/gen-assets.mjs
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
    rgba.copy
      ? rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
      : Buffer.from(rgba.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// Rounded-rect fill helper (used by the flat menu-bar template).
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
      const i = (y * w + x) * 4
      buf[i] = colour[0]
      buf[i + 1] = colour[1]
      buf[i + 2] = colour[2]
      buf[i + 3] = colour[3]
    }
  }
}

// --- small helpers for the glass renderer ---
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const lerp = (a, b, t) => a + (b - a) * t
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
const smooth = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

// HSL (h deg, s/l 0..1) -> [r,g,b] 0..255. Lets the per-accent icon shades be
// derived from the same hue/saturation knobs the renderer uses (tokens.css).
function hsl(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (hp < 1) [r, g, b] = [c, x, 0]
  else if (hp < 2) [r, g, b] = [x, c, 0]
  else if (hp < 3) [r, g, b] = [0, c, x]
  else if (hp < 4) [r, g, b] = [0, x, c]
  else if (hp < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const m = l - c / 2
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

// Bar gradient + warm under-glow for an accent hue. Amber (the brand default)
// keeps its exact tuned RGB so the shipped bundle icon is unchanged.
function vibe(h, s) {
  return { bar: [hsl(h, s, 0.67), hsl(h, s * 0.95, 0.5)], glow: hsl(h, Math.min(1, s), 0.6) }
}
const VIBES = {
  amber: { bar: [[247, 172, 96], [212, 110, 46]], glow: [236, 150, 82] },
  rose: vibe(350, 0.72),
  violet: vibe(265, 0.58),
  ocean: vibe(205, 0.7),
  forest: vibe(150, 0.48),
  graphite: vibe(220, 0.14),
}

// Signed distance to a rounded rectangle (negative inside). One primitive gives
// us crisp fills, soft shadows, and a beveled rim.
function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - hw + r
  const qy = Math.abs(py - cy) - hh + r
  const ax = Math.max(qx, 0)
  const ay = Math.max(qy, 0)
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r
}

// Alpha-composite a colour (straight alpha) over the working RGBA buffer.
function over(buf, i, r, g, b, a) {
  if (a <= 0) return
  const da = buf[i + 3] / 255
  const outA = a + da * (1 - a)
  if (outA <= 0) return
  const k = da * (1 - a)
  buf[i] = Math.round(((r / 255) * a + (buf[i] / 255) * k) * (255 / outA))
  buf[i + 1] = Math.round(((g / 255) * a + (buf[i + 1] / 255) * k) * (255 / outA))
  buf[i + 2] = Math.round(((b / 255) * a + (buf[i + 2] / 255) * k) * (255 / outA))
  buf[i + 3] = Math.round(outA * 255)
}

// App icon, built to the macOS icon grid: an 824x824 squircle inside the 1024
// canvas (100px gutter) with a baked soft drop shadow so it sits on the Dock
// like a native icon. The tile is a top-lit charcoal "glass" with a broad
// specular sheen and a crisp bright top rim; the three Tora bars are bold amber
// with a gentle vertical gradient, a soft top sheen, and a tight contact shadow
// for separation - depth from light, not heavy bevels. Rendered at SS x and
// box-downsampled for clean, alive edges.
function appIcon(canvas, shade) {
  const SS = 4
  const N = canvas * SS
  const s = N / 1024 // map the 1024 grid spec onto any canvas
  const hi = Buffer.alloc(N * N * 4)

  // Palette: warm charcoal glass with accent-coloured bars. Only the bars and
  // their under-glow change per accent; the glass tile stays constant.
  const bgTop = [45, 39, 33]
  const bgBot = [20, 17, 14]
  const amberTop = shade.bar[0]
  const amberBot = shade.bar[1]
  const glow = shade.glow

  const gutter = 100 * s
  const tile = 824 * s
  const x0 = gutter
  const y0 = gutter
  const cx = x0 + tile / 2
  const cy = y0 + tile / 2
  const half = tile / 2
  const radius = 185.4 * s // Apple squircle corner radius for the 824 tile

  // Centred block of three rounded amber bars.
  const stripeH = tile * 0.108
  const gap = tile * 0.072
  const left = x0 + tile * 0.205
  const widths = [0.52, 0.34, 0.46]
  const blockH = stripeH * 3 + gap * 2
  const blockTop = y0 + (tile - blockH) / 2
  const bars = widths.map((wf, k) => {
    const w = tile * wf
    const sy = blockTop + k * (stripeH + gap)
    return { bcx: left + w / 2, bcy: sy + stripeH / 2, hw: w / 2, hh: stripeH / 2, sy }
  })
  const blockCy = blockTop + blockH / 2

  // Drop shadow (HIG: ~28px blur, ~12px down, black ~50%).
  const shadowBlur = 30 * s
  const shadowOff = 14 * s

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4
      const fx = x + 0.5
      const fy = y + 0.5

      // Baked drop shadow in the gutter (covered where the tile is opaque).
      const dShadow = sdRoundRect(fx, fy, cx, cy + shadowOff, half, half, radius)
      const shA = 0.5 * (1 - smooth(0, shadowBlur, dShadow))
      if (shA > 0) over(hi, i, 0, 0, 0, shA)

      const dTile = sdRoundRect(fx, fy, cx, cy, half, half, radius)
      if (dTile > 0) continue // outside the tile only the shadow shows

      // 1. Background: clean top-lit vertical gradient.
      let col = mix(bgTop, bgBot, smooth(0, 1, clamp01((y - y0) / tile)))
      over(hi, i, col[0], col[1], col[2], 1)

      // 2. Warm under-glow centred on the bars so the amber feels lit.
      const gd = Math.hypot(x - cx, y - blockCy) / (tile * 0.5)
      over(hi, i, glow[0], glow[1], glow[2], Math.max(0, 1 - gd * gd) * 0.08)

      // 3. Broad specular sheen across the top (glass reflection).
      const ex = (x - cx) / (tile * 0.62)
      const ey = (y - (y0 + tile * 0.04)) / (tile * 0.5)
      over(hi, i, 255, 255, 255, Math.max(0, 1 - (ex * ex + ey * ey)) * 0.08)

      // 4. Glass rim: a crisp bright top edge, a soft dark bottom edge.
      const rim = tile * 0.02
      const edge = clamp01(1 - -dTile / rim) // 1 at the boundary, 0 inward
      if (edge > 0) {
        const vy = (y - cy) / half
        if (vy < 0) over(hi, i, 255, 252, 245, edge * edge * -vy * 0.5)
        else over(hi, i, 0, 0, 0, edge * vy * 0.22)
      }

      // 5. Bars: a tight contact shadow for separation, then the amber fill.
      for (const b of bars) {
        const dsh = sdRoundRect(fx, fy, b.bcx, b.bcy + stripeH * 0.07, b.hw, b.hh, b.hh)
        const ca = (1 - smooth(0, stripeH * 0.3, dsh)) * 0.14
        if (ca > 0) over(hi, i, 0, 0, 0, ca)
      }
      for (const b of bars) {
        const dBar = sdRoundRect(fx, fy, b.bcx, b.bcy, b.hw, b.hh, b.hh)
        if (dBar < 0) {
          const hy = clamp01((y - b.sy) / stripeH)
          col = mix(amberTop, amberBot, smooth(0, 1, hy))
          over(hi, i, col[0], col[1], col[2], 1)
          over(hi, i, 255, 244, 228, Math.max(0, 1 - hy / 0.45) * 0.18) // top sheen
        }
      }
    }
  }

  // Box-downsample SS x SS with premultiplied alpha (clean edges, no fringe).
  const out = Buffer.alloc(canvas * canvas * 4)
  const n2 = SS * SS
  for (let y = 0; y < canvas; y++) {
    for (let x = 0; x < canvas; x++) {
      let r = 0
      let g = 0
      let bl = 0
      let a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const j = ((y * SS + sy) * N + (x * SS + sx)) * 4
          const sa = hi[j + 3] / 255
          r += (hi[j] / 255) * sa
          g += (hi[j + 1] / 255) * sa
          bl += (hi[j + 2] / 255) * sa
          a += sa
        }
      }
      const o = (y * canvas + x) * 4
      if (a > 0) {
        out[o] = Math.round((r / a) * 255)
        out[o + 1] = Math.round((g / a) * 255)
        out[o + 2] = Math.round((bl / a) * 255)
      }
      out[o + 3] = Math.round((a / n2) * 255)
    }
  }
  return encodePng(canvas, canvas, out)
}

// Menu-bar template: transparent with black bars (macOS recolours it).
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
mkdirSync(join(root, 'build', 'icons'), { recursive: true })

// Default bundle icon (amber) -> build/icon.png, baked into the .icns at package
// time. Per-accent variants -> build/icons/<accent>.png, bundled as resources
// and swapped onto the Dock at runtime when the user changes their accent.
writeFileSync(join(root, 'build', 'icon.png'), appIcon(1024, VIBES.amber))
for (const [name, shade] of Object.entries(VIBES)) {
  writeFileSync(join(root, 'build', 'icons', `${name}.png`), appIcon(1024, shade))
}
writeFileSync(join(root, 'build', 'trayTemplate.png'), trayTemplate(22))
writeFileSync(join(root, 'build', 'trayTemplate@2x.png'), trayTemplate(44))
console.log(
  `Wrote build/icon.png, build/icons/{${Object.keys(VIBES).join(',')}}.png, build/trayTemplate*.png`,
)
