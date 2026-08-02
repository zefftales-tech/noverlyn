import fs from 'fs'
import path from 'path'
import zlib from 'zlib'

// Pure Node.js PNG Encoder helper
function crc32(buf) {
  let c = 0xffffffff
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let k = n
    for (let m = 0; m < 8; m++) {
      k = (k & 1) ? (0xedb88320 ^ (k >>> 1)) : (k >>> 1)
    }
    table[n] = k
  }
  for (let i = 0; i < buf.length; i++) {
    c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32BE(data.length, 0)

  const crcBuf = Buffer.alloc(4)
  const checksum = crc32(Buffer.concat([typeBuf, data]))
  crcBuf.writeUInt32BE(checksum, 0)

  return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
}

function createPngBuffer(width, height, getPixelRgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  // IHDR
  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(width, 0)
  ihdrData.writeUInt32BE(height, 4)
  ihdrData[8] = 8 // bit depth
  ihdrData[9] = 6 // color type RGBA
  ihdrData[10] = 0 // compression
  ihdrData[11] = 0 // filter
  ihdrData[12] = 0 // interlace
  const ihdrChunk = makeChunk('IHDR', ihdrData)

  // IDAT - Scanlines
  const lineSize = width * 4 + 1
  const rawData = Buffer.alloc(height * lineSize)

  for (let y = 0; y < height; y++) {
    const lineOffset = y * lineSize
    rawData[lineOffset] = 0 // Filter type 0 (None)

    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixelRgba(x, y, width, height)
      const pxOffset = lineOffset + 1 + x * 4
      rawData[pxOffset] = r
      rawData[pxOffset + 1] = g
      rawData[pxOffset + 2] = b
      rawData[pxOffset + 3] = a
    }
  }

  const compressedData = zlib.deflateSync(rawData, { level: 9 })
  const idatChunk = makeChunk('IDAT', compressedData)

  // IEND
  const iendChunk = makeChunk('IEND', Buffer.alloc(0))

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk])
}

// Color interpolation helper
function lerpColor(c1, c2, t) {
  const r = Math.round(c1[0] + (c2[0] - c1[0]) * t)
  const g = Math.round(c1[1] + (c2[1] - c1[1]) * t)
  const b = Math.round(c1[2] + (c2[2] - c1[2]) * t)
  return [r, g, b]
}

// Noverlyn Ribbon Mark Renderer
function drawNoverlynLogoPixel(x, y, width, height, isMaskable = false) {
  // Normalize coordinates to 0..1
  const nx = (x + 0.5) / width
  const ny = (y + 0.5) / height

  // Dark Navy theme background
  const bgRgb = [15, 23, 42] // #0F172A

  // For non-maskable icons, apply rounded corners (radius ~20%)
  if (!isMaskable) {
    const margin = 0.02
    if (nx < margin || nx > 1 - margin || ny < margin || ny > 1 - margin) {
      return [0, 0, 0, 0]
    }
    const rx = Math.max(0.18 - nx, nx - 0.82, 0)
    const ry = Math.max(0.18 - ny, ny - 0.82, 0)
    if (rx > 0 && ry > 0) {
      const distSq = rx * rx + ry * ry
      if (distSq > 0.18 * 0.18) {
        return [0, 0, 0, 0] // Rounded transparent corner
      }
    }
  }

  // Safe area padding for maskable icons (center content in 65% radius)
  const scale = isMaskable ? 0.72 : 0.85
  const cx = 0.5 + (nx - 0.5) / scale
  const cy = 0.5 + (ny - 0.5) / scale

  // Out of scaled symbol bounds? Return background
  if (cx < 0 || cx > 1 || cy < 0 || cy > 1) {
    return [...bgRgb, 255]
  }

  // Symbol normalized coordinates (0..40 scale matching SVG viewBox)
  const sx = cx * 40
  const sy = cy * 40

  // 1. Left Stem: x in [8.5, 14.5], y in [8, 32]
  if (sx >= 8.5 && sx <= 14.5 && sy >= 8 && sy <= 32) {
    const t = (sy - 8) / 24
    const color = lerpColor([59, 130, 246], [29, 78, 216], t) // #3B82F6 -> #1D4ED8
    return [...color, 255]
  }

  // 2. Right Stem: x in [25.5, 31.5], y in [8, 32]
  if (sx >= 25.5 && sx <= 31.5 && sy >= 8 && sy <= 32) {
    const t = (sy - 8) / 24
    const color = lerpColor([37, 99, 235], [30, 64, 175], t) // #2563EB -> #1E40AF
    return [...color, 255]
  }

  // 3. Center Diagonal Fold: Ribbon path connecting (8.5, 8) to (31.5, 32)
  // Equation of top line: y - 8 = (32-8)/(31.5-8.5) * (x - 8.5) => y - 8 = (24/23) * (x - 8.5)
  // Distance to line x_diag = 8.5 + (sy - 8) * (23/24)
  const diagX = 8.5 + (sy - 8) * (23 / 24)
  if (sy >= 8 && sy <= 32 && sx >= diagX - 0.2 && sx <= diagX + 6.2) {
    const t = (sy - 8) / 24

    // Highlight overlay on upper diagonal fold
    if (sx >= diagX + 1.0 && sx <= diagX + 5.0 && sy <= 18) {
      const hlColor = lerpColor([255, 255, 255], [56, 189, 248], t)
      return [...hlColor, 255]
    }

    const color = lerpColor([56, 189, 248], [37, 99, 235], t) // #38BDF8 -> #2563EB
    return [...color, 255]
  }

  // Default: Dark Navy background
  return [...bgRgb, 255]
}

// Generate all required PWA PNG icon files
const publicDir = path.join(process.cwd(), 'public')
const iconsDir = path.join(publicDir, 'icons')

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true })
}

const targets = [
  { file: path.join(iconsDir, 'noverlyn-192.png'), size: 192, maskable: false },
  { file: path.join(iconsDir, 'noverlyn-512.png'), size: 512, maskable: false },
  { file: path.join(iconsDir, 'noverlyn-maskable-192.png'), size: 192, maskable: true },
  { file: path.join(iconsDir, 'noverlyn-maskable-512.png'), size: 512, maskable: true },
  { file: path.join(iconsDir, 'noverlyn-64.png'), size: 64, maskable: false },
  { file: path.join(iconsDir, 'noverlyn-32.png'), size: 32, maskable: false },
  { file: path.join(publicDir, 'apple-touch-icon.png'), size: 180, maskable: false },
  { file: path.join(publicDir, 'favicon-32x32.png'), size: 32, maskable: false },
  { file: path.join(publicDir, 'favicon-16x16.png'), size: 16, maskable: false },
]

console.log('Generating PNG PWA Icons...')

for (const t of targets) {
  const buf = createPngBuffer(t.size, t.size, (x, y, w, h) => drawNoverlynLogoPixel(x, y, w, h, t.maskable))
  fs.writeFileSync(t.file, buf)
  console.log(`Generated: ${path.relative(process.cwd(), t.file)} (${t.size}x${t.size})`)
}

console.log('All PWA PNG icons successfully created!')
