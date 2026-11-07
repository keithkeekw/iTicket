// Image attachments for AI review: picks the useful images from a ticket's comments and side
// conversations, downloads them from Zendesk and returns them base64-encoded for Ollama.
// Email-signature logos/icons, duplicates, unsupported formats, oversized files and anything the
// Zendesk malware scan flagged are skipped and reported.
import { getSettings } from './settings.js'
import { authHeader } from './zendesk.js'

// Formats Ollama vision models accept.
const SUPPORTED = new Set(['image/png', 'image/jpeg', 'image/jpg'])
// Smaller than this (either side, in pixels) is treated as a logo or icon.
const MIN_SIDE = 100
// ...or when its longer side is shorter than this.
const MIN_LONG_SIDE = 250
// Files this small are almost always signature logos.
const MIN_BYTES = 5 * 1024

// Pixel size from PNG / JPEG headers (null if it can't be read).
function imageSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return null
      const marker = buf[i + 1]
      const length = buf.readUInt16BE(i + 2)
      // SOF0–SOF15 except DHT (C4), JPG (C8) and DAC (CC) carry the frame size.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) }
      }
      i += 2 + length
    }
  }
  return null
}

// When there are more images than allowed, keep the earliest and the latest ones: the customer's
// evidence usually comes first and the agent's resolution evidence last.
function pickSpread(list, max) {
  if (list.length <= max) return list
  const head = Math.ceil(max / 2)
  return [...list.slice(0, head), ...list.slice(list.length - (max - head))]
}

// candidates: [{ fileName, contentType, size, url, malware, source }] in conversation order.
// Returns { images: [{ number, fileName, source, base64 }], skipped: [{ fileName, reason }] }.
export async function collectImages(candidates) {
  const { ollama } = getSettings()
  const maxImages = Math.max(0, Number(ollama.maxImages) || 0)
  const maxBytes = (Number(ollama.maxImageMB) || 5) * 1024 * 1024
  const skipped = []
  const seen = new Set()
  const eligible = []

  for (const c of candidates) {
    const key = `${c.fileName}|${c.size}`
    if (seen.has(key)) continue // same file attached again
    seen.add(key)
    if (c.malware === 'malware_found') skipped.push({ fileName: c.fileName, reason: 'flagged by Zendesk malware scan' })
    else if (!SUPPORTED.has(String(c.contentType).toLowerCase())) skipped.push({ fileName: c.fileName, reason: `format not supported (${c.contentType})` })
    else if (c.size > maxBytes) skipped.push({ fileName: c.fileName, reason: `larger than ${ollama.maxImageMB} MB` })
    else if (c.size < MIN_BYTES) continue // signature logo/icon: not worth reporting
    else eligible.push(c)
  }

  const images = []
  const headers = eligible.length ? { Authorization: await authHeader() } : {}
  for (const c of eligible) {
    if (images.length >= maxImages * 2) break // enough downloaded to choose from
    try {
      // Zendesk redirects to its file host; fetch drops the Authorization header on that hop.
      const res = await fetch(c.url, { headers, signal: AbortSignal.timeout(20000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      const dims = imageSize(buf)
      // Logo/icon: too thin on one side, or small overall (signature social icons are ~100–200px squares).
      if (dims && (Math.min(dims.width, dims.height) < MIN_SIDE || Math.max(dims.width, dims.height) < MIN_LONG_SIDE)) continue
      images.push({ fileName: c.fileName, size: c.size, source: c.source, base64: buf.toString('base64'), mediaType: String(c.contentType).toLowerCase() === 'image/jpg' ? 'image/jpeg' : String(c.contentType).toLowerCase(), dims })
    } catch (err) {
      skipped.push({ fileName: c.fileName, reason: `could not be downloaded (${err.message})` })
    }
  }

  const chosen = pickSpread(images, maxImages)
  for (const img of images) {
    if (!chosen.includes(img)) skipped.push({ fileName: img.fileName, reason: `over the limit of ${maxImages} images per ticket` })
  }
  return { images: chosen.map((img, i) => ({ ...img, number: i + 1 })), skipped }
}
