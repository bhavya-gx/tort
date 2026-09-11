/* Writes assets/iconTemplate.png (and @2x), a black-with-alpha menu bar shape.
   macOS recolours template images for light and dark menu bars automatically.
   No image libraries, just zlib. Run: npm run icon */
const zlib = require('zlib')
const fs = require('fs')
const path = require('path')

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/* Coverage of the turtle silhouette at a point, 0 to 1, sampled 3x3 per pixel. */
function alphaAt (x, y, s) {
  const u = x / s, v = y / s
  const inShell = ((u - 0.54) ** 2) / 0.20 + ((v - 0.66) ** 2) / 0.13 <= 1 && v <= 0.70
  const inBase = v > 0.60 && v < 0.74 && u > 0.16 && u < 0.94
  const inHead = ((u - 0.19) ** 2) / 0.016 + ((v - 0.60) ** 2) / 0.020 <= 1
  return inShell || inBase || inHead ? 1 : 0
}

function png (size) {
  const rows = []
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4)
    for (let x = 0; x < size; x++) {
      let hits = 0
      for (let sy = 0; sy < 3; sy++) {
        for (let sx = 0; sx < 3; sx++) {
          hits += alphaAt(x + (sx + 0.5) / 3, y + (sy + 0.5) / 3, size)
        }
      }
      row[1 + x * 4 + 3] = Math.round((hits / 9) * 255) // black, varying alpha
    }
    rows.push(row)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 6 // 8 bit, RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const dir = path.join(__dirname, '..', 'assets')
fs.mkdirSync(dir, { recursive: true })
fs.writeFileSync(path.join(dir, 'iconTemplate.png'), png(22))
fs.writeFileSync(path.join(dir, 'iconTemplate@2x.png'), png(44))
console.log('wrote assets/iconTemplate.png and @2x')
