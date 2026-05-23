'use strict'
// Pure Node.js app icon generator — no npm dependencies.
// Creates build/icon.png and build/icon.ico (ICO wrapping the PNG).
// Design: GitHub-style contribution calendar grid on a dark rounded background.
const zlib = require('zlib')
const fs = require('fs')
const path = require('path')

const SIZE = 512
const rgba = Buffer.alloc(SIZE * SIZE * 4, 0) // transparent canvas

function px(x, y, r, g, b, a = 255) {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return
  const i = (y * SIZE + x) * 4
  rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = a
}

// ── Rounded dark background ──────────────────────────────────────────────────
const BG_RADIUS = 80
const [bgR, bgG, bgB] = [13, 17, 23] // #0d1117 GitHub dark
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let inside = true
    const inTL = x < BG_RADIUS && y < BG_RADIUS
    const inTR = x >= SIZE - BG_RADIUS && y < BG_RADIUS
    const inBL = x < BG_RADIUS && y >= SIZE - BG_RADIUS
    const inBR = x >= SIZE - BG_RADIUS && y >= SIZE - BG_RADIUS
    if (inTL) inside = Math.hypot(x - BG_RADIUS, y - BG_RADIUS) <= BG_RADIUS
    else if (inTR) inside = Math.hypot(x - (SIZE - BG_RADIUS), y - BG_RADIUS) <= BG_RADIUS
    else if (inBL) inside = Math.hypot(x - BG_RADIUS, y - (SIZE - BG_RADIUS)) <= BG_RADIUS
    else if (inBR) inside = Math.hypot(x - (SIZE - BG_RADIUS), y - (SIZE - BG_RADIUS)) <= BG_RADIUS
    if (inside) px(x, y, bgR, bgG, bgB, 255)
  }
}

// ── Contribution grid ─────────────────────────────────────────────────────────
// GitHub contribution graph colors (level 0–4)
const COLORS = [
  [22, 27, 34],    // #161b22  empty
  [14, 68, 41],    // #0e4429  level 1
  [0, 109, 50],    // #006d32  level 2
  [38, 166, 65],   // #26a641  level 3
  [57, 211, 83],   // #39d353  level 4
]

// 7×7 grid — diamond-shaped intensity radiates from the center (visually clean).
const PATTERN = [
  [0, 0, 1, 2, 1, 0, 0],
  [0, 1, 2, 3, 2, 1, 0],
  [1, 2, 3, 4, 3, 2, 1],
  [2, 3, 4, 4, 4, 3, 2],
  [1, 2, 3, 4, 3, 2, 1],
  [0, 1, 2, 3, 2, 1, 0],
  [0, 0, 1, 2, 1, 0, 0],
]

const COLS = 7, ROWS = 7
const CELL = 52, GAP = 10
const CELL_R = 8 // cell corner radius

const GRID_W = COLS * CELL + (COLS - 1) * GAP
const GRID_H = ROWS * CELL + (ROWS - 1) * GAP
const GX = Math.round((SIZE - GRID_W) / 2)
const GY = Math.round((SIZE - GRID_H) / 2)

for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    const [r, g, b] = COLORS[PATTERN[row][col]]
    const ox = GX + col * (CELL + GAP)
    const oy = GY + row * (CELL + GAP)
    for (let dy = 0; dy < CELL; dy++) {
      for (let dx = 0; dx < CELL; dx++) {
        const inTL = dx < CELL_R && dy < CELL_R
        const inTR = dx >= CELL - CELL_R && dy < CELL_R
        const inBL = dx < CELL_R && dy >= CELL - CELL_R
        const inBR = dx >= CELL - CELL_R && dy >= CELL - CELL_R
        let inside = true
        if (inTL) inside = Math.hypot(dx - CELL_R, dy - CELL_R) <= CELL_R
        else if (inTR) inside = Math.hypot(dx - (CELL - CELL_R), dy - CELL_R) <= CELL_R
        else if (inBL) inside = Math.hypot(dx - CELL_R, dy - (CELL - CELL_R)) <= CELL_R
        else if (inBR) inside = Math.hypot(dx - (CELL - CELL_R), dy - (CELL - CELL_R)) <= CELL_R
        if (inside) px(ox + dx, oy + dy, r, g, b, 255)
      }
    }
  }
}

// ── PNG encoder (raw Node.js + built-in zlib) ─────────────────────────────────
const CRC_TABLE = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
  CRC_TABLE[n] = c >>> 0
}

function crc32(data) {
  let c = 0xFFFFFFFF
  for (const b of data) c = (CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8)) >>> 0
  return (c ^ 0xFFFFFFFF) >>> 0
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const lenBuf = Buffer.allocUnsafe(4)
  lenBuf.writeUInt32BE(data.length)
  const crcBuf = Buffer.allocUnsafe(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
}

// Build raw scanline data: filter byte (0 = none) + RGBA row
const scanlines = []
for (let y = 0; y < SIZE; y++) {
  const row = Buffer.allocUnsafe(1 + SIZE * 4)
  row[0] = 0
  rgba.copy(row, 1, y * SIZE * 4, (y + 1) * SIZE * 4)
  scanlines.push(row)
}
const compressed = zlib.deflateSync(Buffer.concat(scanlines), { level: 9 })

const ihdr = Buffer.allocUnsafe(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8  // bit depth
ihdr[9] = 6  // RGBA color type
ihdr[10] = 0 // compression method
ihdr[11] = 0 // filter method
ihdr[12] = 0 // interlace method

const pngBuf = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // PNG magic
  pngChunk('IHDR', ihdr),
  pngChunk('IDAT', compressed),
  pngChunk('IEND', Buffer.alloc(0)),
])

// ── ICO wrapper (embeds the PNG, avoids re-encoding) ─────────────────────────
// Format: 6-byte header + 16-byte entry per image + image bytes
const icoHeader = Buffer.from([0, 0, 1, 0, 1, 0]) // reserved, type=1(ICO), count=1

const icoEntry = Buffer.allocUnsafe(16)
icoEntry[0] = 0   // width:  0 → 256
icoEntry[1] = 0   // height: 0 → 256
icoEntry[2] = 0   // color count
icoEntry[3] = 0   // reserved
icoEntry.writeUInt16LE(1, 4)               // color planes
icoEntry.writeUInt16LE(32, 6)              // bits per pixel
icoEntry.writeUInt32LE(pngBuf.length, 8)  // size of image data
icoEntry.writeUInt32LE(6 + 16, 12)        // offset to image data (header + 1 entry)

const icoBuf = Buffer.concat([icoHeader, icoEntry, pngBuf])

// ── Write output ──────────────────────────────────────────────────────────────
const outDir = path.join(__dirname, '..', 'build')
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'icon.png'), pngBuf)
fs.writeFileSync(path.join(outDir, 'icon.ico'), icoBuf)
console.log(`  icon.png  ${(pngBuf.length / 1024).toFixed(1)} kB`)
console.log(`  icon.ico  ${(icoBuf.length / 1024).toFixed(1)} kB`)
