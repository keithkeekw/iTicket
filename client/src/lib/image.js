// Saves part of a page as one PNG image. Like the PDF export (lib/pdf.js) the element is rendered in
// light mode on a copy of the page, with [data-pdf-exclude] elements removed and [data-pdf-only]
// elements shown. html2canvas-pro is loaded on demand.

// Browsers refuse canvases past a certain size (Chrome/Edge: 65,535 px a side and roughly
// 268 million pixels; Safari, and every browser on iPhone/iPad, which all use Safari's engine:
// 16,777,216 pixels in total). Staying under the limit keeps the export reliable; very long pages
// are rendered at a lower resolution instead of failing.
const MAX_SIDE = 32000

// Safari's engine, on a Mac or on iOS. Chrome, Edge and Firefox on a Mac use their own engines.
function usesSafariEngine() {
  const ua = navigator.userAgent
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const safari = /Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\/|OPR\/|Firefox\//.test(ua)
  return iOS || safari
}

// Total pixel budget for the saved image in this browser.
export const maxImagePixels = () => (usesSafariEngine() ? 16_000_000 : 120_000_000)
const PREFERRED_SCALE = 2 // sharp text when the page is short enough
const PADDING = 24 // px of white space around the content in the saved image

// Returns { scale } so the caller can tell the user when a long page had to be scaled down.
// Options: `prepare(clone)` changes the copy before it is drawn (e.g. removes parts), and `size`
// ({ width, height } in CSS px) is the size of what is left, when that is smaller than the element.
export async function downloadImage(element, fileName, { prepare, size } = {}) {
  const { default: html2canvas } = await import('html2canvas-pro')
  const rect = size || element.getBoundingClientRect()
  // Size of the saved image in CSS px, including the padding added below.
  const width = rect.width + PADDING * 2
  const height = rect.height + PADDING * 2
  const scale = Math.min(PREFERRED_SCALE, MAX_SIDE / height, MAX_SIDE / width, Math.sqrt(maxImagePixels() / (width * height)))

  const canvas = await html2canvas(element, {
    scale,
    backgroundColor: '#ffffff',
    useCORS: true,
    // Render the whole element, not only the part currently on screen.
    windowHeight: Math.max(window.innerHeight, Math.ceil(height) + 200),
    scrollY: -window.scrollY,
    onclone: (doc, clone) => {
      doc.documentElement.classList.remove('dark')
      doc.documentElement.style.colorScheme = 'light'
      clone.querySelectorAll('[data-pdf-exclude]').forEach(el => el.remove())
      clone.querySelectorAll('[data-pdf-only]').forEach(el => el.classList.remove('hidden'))
      prepare?.(clone)
      // A little breathing room around the content in the saved image.
      clone.style.padding = `${PADDING}px`
    },
  })

  const blob = await new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('The image could not be created.'))), 'image/png'),
  )
  const url = URL.createObjectURL(blob)
  const link = Object.assign(document.createElement('a'), { href: url, download: fileName })
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return { scale, width: canvas.width, height: canvas.height }
}
