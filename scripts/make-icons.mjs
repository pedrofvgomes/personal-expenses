import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

function crc32(buf) {
  let c = ~0
  for (const b of buf) {
    c ^= b
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const t = Buffer.from(type)
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crc])
}

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  const bg = [15, 110, 107]
  const cream = [244, 239, 230]
  const cx = size / 2
  const top = size * 0.3
  const mid = size * 0.48
  const bot = size * 0.68
  const half = size * 0.16
  const radius = size * 0.36
  for (let y = 0; y < size; y++) {
    raw[(size * 4 + 1) * y] = 0
    for (let x = 0; x < size; x++) {
      const o = (size * 4 + 1) * y + 1 + x * 4
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cx
      let col = bg
      if (dx * dx + dy * dy < radius * radius) col = cream
      let house = false
      if (y >= top && y <= mid) {
        const w = ((y - top) / (mid - top)) * half
        if (Math.abs(x + 0.5 - cx) <= w) house = true
      }
      if (y > mid && y <= bot && Math.abs(x + 0.5 - cx) <= half) house = true
      const door = x > size * 0.46 && x < size * 0.54 && y > size * 0.54 && y <= bot
      if (house) col = bg
      if (door) col = cream
      raw[o] = col[0]
      raw[o + 1] = col[1]
      raw[o + 2] = col[2]
      raw[o + 3] = 255
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

writeFileSync('public/icon-192.png', png(192))
writeFileSync('public/icon-512.png', png(512))
