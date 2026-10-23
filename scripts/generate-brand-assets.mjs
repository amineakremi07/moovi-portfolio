#!/usr/bin/env node
/**
 * Derives every logo and icon file from the master artwork, public/logo.png (1024px square, transparent,
 * emblem on the left, "Moovi" wordmark on the right). Re-run after replacing the master:
 *
 *   npm run brand:assets
 *
 * The master's colours (navy text, slate bolt, emerald cells) are snapped to the DESIGN.md palette, and
 * its white anti-aliasing fringe is dropped (each pixel keeps its alpha, takes the palette colour):
 *  - public/brand/logo-dark.png   Obsidian Plum wordmark, Ash Mauve bolt: for the light surfaces;
 *  - public/brand/logo-light.png  Bone Linen wordmark, Driftwood bolt: for the Forest Depths hero/nav;
 *  - public/icons/*.png, app/favicon.ico: the emblem on a Forest Depths tile.
 * The cells are Lime Pulse in every variant. `maskable` keeps the emblem inside the central 80% safe zone.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'

const MASTER = 'public/logo.png'
const FOREST = '#1d3023'
const GREEN = [0x26, 0xd8, 0x62] // Lime Pulse
const TONES = {
  dark: { text: [0x2a, 0x1a, 0x1d], bolt: [0x64, 0x57, 0x57] }, // Obsidian Plum, Ash Mauve
  light: { text: [0xf7, 0xf5, 0xf2], bolt: [0xd7, 0xd2, 0xcc] }, // Bone Linen, Driftwood
}
const NOISE = 20 // the master carries a faint alpha haze over the whole canvas

const { data, info } = await sharp(MASTER).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const { width: W, height: H } = info

// Ink bounds, and the empty column run that separates the emblem from the wordmark.
const ink = (x, y) => data[(y * W + x) * 4 + 3] > NOISE
const cols = Array.from({ length: W }, (_, x) => {
  for (let y = 0; y < H; y++) if (ink(x, y)) return true
  return false
})
const rows = Array.from({ length: H }, (_, y) => cols.some((on, x) => on && ink(x, y)))
const top = rows.indexOf(true)
const bottom = rows.lastIndexOf(true)
const left = cols.indexOf(true)
const right = cols.lastIndexOf(true)
const emblemEnd = cols.indexOf(false, left) // first empty column after the emblem
const wordStart = cols.indexOf(true, emblemEnd)
if (emblemEnd < 0 || wordStart < 0) throw new Error('could not find the gap between emblem and wordmark')

/** The master recoloured for one tone, cropped to its ink (with a small margin). */
async function variant(tone, x0, x1) {
  const { text, bolt } = TONES[tone]
  const out = Buffer.alloc(data.length)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const a = data[i + 3]
      if (a <= NOISE) continue
      const [r, g, b] = data.subarray(i, i + 3)
      // Green test on the hue, so white-matted edge pixels of a cell still count as cell.
      const rgb = x >= wordStart ? text : g > r + 10 && g > b ? GREEN : bolt
      out.set([...rgb, a], i)
    }
  }
  const pad = 4
  const left0 = Math.max(0, x0 - pad)
  const top0 = Math.max(0, top - pad)
  return sharp(out, { raw: { width: W, height: H, channels: 4 } })
    .extract({ left: left0, top: top0, width: Math.min(W, x1 + pad + 1) - left0, height: Math.min(H, bottom + pad + 1) - top0 })
    .png({ compressionLevel: 9 })
    .toBuffer()
}

mkdirSync('public/brand', { recursive: true })
mkdirSync('public/icons', { recursive: true })

for (const tone of ['dark', 'light']) {
  const png = await variant(tone, left, right)
  writeFileSync(`public/brand/logo-${tone}.png`, png)
  const meta = await sharp(png).metadata()
  console.log(`wrote public/brand/logo-${tone}.png ${meta.width}x${meta.height}`)
}
// The emblem alone (light tone: the bolt must read on the forest tile).
const mark = await variant('light', left, emblemEnd - 1)

/** The emblem centred on a square Forest Depths tile, filling `scale` of its height. */
async function tile(px, scale) {
  const h = Math.round(px * scale)
  const emblem = await sharp(mark).resize({ height: h, kernel: 'lanczos3' }).toBuffer()
  const { width: w } = await sharp(emblem).metadata()
  return sharp({ create: { width: px, height: px, channels: 4, background: FOREST } })
    .composite([{ input: emblem, left: Math.round((px - w) / 2), top: Math.round((px - h) / 2) }])
    .png({ compressionLevel: 9 })
    .toBuffer()
}

for (const [name, px, scale] of [
  ['icon-192.png', 192, 0.66],
  ['icon-512.png', 512, 0.66],
  ['icon-maskable-512.png', 512, 0.52],
  ['apple-touch-icon.png', 180, 0.62],
]) {
  writeFileSync(`public/icons/${name}`, await tile(px, scale))
  console.log(`wrote public/icons/${name}`)
}

// favicon.ico: an ICONDIR with PNG-encoded entries (read by every current browser).
const sizes = [16, 32, 48]
const pngs = await Promise.all(sizes.map((px) => tile(px, 0.78)))
const header = Buffer.alloc(6 + 16 * sizes.length)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2) // type: icon
header.writeUInt16LE(sizes.length, 4)
let offset = header.length
sizes.forEach((px, n) => {
  const e = 6 + 16 * n
  header.writeUInt8(px, e)
  header.writeUInt8(px, e + 1)
  header.writeUInt16LE(1, e + 4) // planes
  header.writeUInt16LE(32, e + 6) // bits per pixel
  header.writeUInt32LE(pngs[n].length, e + 8)
  header.writeUInt32LE(offset, e + 12)
  offset += pngs[n].length
})
writeFileSync('app/favicon.ico', Buffer.concat([header, ...pngs]))
console.log('wrote app/favicon.ico (16, 32, 48)')
