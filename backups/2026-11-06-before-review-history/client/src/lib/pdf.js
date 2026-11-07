// "Print" part of a page to a PDF file and download it.
// The element is rendered in light mode on a copy of the page, with [data-pdf-exclude] elements removed
// and [data-pdf-only] elements shown. Page breaks fall between cards rather than through them.
// jsPDF and html2canvas-pro are loaded on demand so they don't weigh down the app bundle.

const A4 = { width: 210, height: 297 } // mm
const MARGIN = 12 // mm
const SCALE = 2 // render at 2x for sharp text

export async function downloadPdf(element, fileName) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')])

  let boxes = []
  let cssHeight = 0
  const canvas = await html2canvas(element, {
    scale: SCALE,
    backgroundColor: '#ffffff',
    useCORS: true,
    onclone: (doc, clone) => {
      doc.documentElement.classList.remove('dark')
      doc.documentElement.style.colorScheme = 'light'
      clone.querySelectorAll('[data-pdf-exclude]').forEach(el => el.remove())
      clone.querySelectorAll('[data-pdf-only]').forEach(el => el.classList.remove('hidden'))
      // A grid left with a single card (its partner was excluded) lets that card use the full width.
      clone.querySelectorAll('[data-pdf-grid]').forEach(grid => {
        if (grid.children.length === 1) grid.firstElementChild.style.gridColumn = '1 / -1'
        if (grid.children.length === 0) grid.remove()
      })
      // Blocks that must not be split across pages, relative to the top of the element.
      const top = clone.getBoundingClientRect().top
      cssHeight = clone.getBoundingClientRect().height
      boxes = [...clone.querySelectorAll('[data-slot="card"], [data-pdf-block]')].map(el => {
        const r = el.getBoundingClientRect()
        return { top: r.top - top, bottom: r.bottom - top }
      })
    },
  })

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const contentW = A4.width - MARGIN * 2
  const contentH = A4.height - MARGIN * 2 - 6 // room for the page number
  const pxPerCss = canvas.height / (cssHeight || canvas.height / SCALE)
  const totalCss = canvas.height / pxPerCss
  const pageCss = (contentH / contentW) * (canvas.width / pxPerCss)

  // Cut points: the top of a block (minus part of the gap above it) when no other block spans it.
  const safe = y => !boxes.some(b => b.top < y - 1 && b.bottom > y + 1)
  const cuts = [...new Set(boxes.map(b => Math.max(0, b.top - 6)))].filter(safe).sort((a, b) => a - b)

  const slices = []
  for (let start = 0; start < totalCss - 1; ) {
    const limit = start + pageCss
    let end = totalCss
    if (limit < totalCss) {
      const fits = cuts.filter(c => c > start + 20 && c <= limit)
      end = fits.length ? fits[fits.length - 1] : limit
    }
    slices.push([start, end])
    start = end
  }

  slices.forEach(([start, end], i) => {
    const sy = Math.round(start * pxPerCss)
    const sh = Math.round(end * pxPerCss) - sy
    const page = document.createElement('canvas')
    page.width = canvas.width
    page.height = sh
    const ctx = page.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, page.width, page.height)
    ctx.drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh)
    if (i > 0) pdf.addPage()
    pdf.addImage(page.toDataURL('image/jpeg', 0.92), 'JPEG', MARGIN, MARGIN, contentW, (sh / canvas.width) * contentW)
    pdf.setFontSize(8)
    pdf.setTextColor(120)
    pdf.text(`Page ${i + 1} of ${slices.length}`, A4.width - MARGIN, A4.height - MARGIN / 2, { align: 'right' })
  })

  pdf.save(fileName)
}
