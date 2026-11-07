// Renders Zendesk comment HTML safely: DOMPurify removes scripts, event handlers and other unsafe
// markup, and inline styles/classes are dropped so the text follows the app theme (dark mode).
// Long content is collapsed with a "Show more" link.
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import DOMPurify from 'dompurify'
import { cn } from '@/lib/utils'

// Links open in a new tab without access to this page.
DOMPurify.addHook('afterSanitizeAttributes', node => {
  if (node.tagName === 'A' && node.getAttribute('href')) {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
  if (node.tagName === 'IMG') node.setAttribute('loading', 'lazy')
})

export function sanitizeHtml(html) {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['style', 'class', 'id', 'width', 'height', 'bgcolor', 'color', 'face', 'size'],
    ADD_ATTR: ['target'],
  })
}

const COLLAPSED_PX = 320

export default function RichText({ html, expanded, className }) {
  const clean = useMemo(() => sanitizeHtml(html), [html])
  const ref = useRef(null)
  const [tall, setTall] = useState(false)
  const [open, setOpen] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setTall(el.scrollHeight > COLLAPSED_PX + 40)
    measure()
    // Re-measure when images finish loading.
    const imgs = [...el.querySelectorAll('img')]
    imgs.forEach(img => img.addEventListener('load', measure))
    return () => imgs.forEach(img => img.removeEventListener('load', measure))
  }, [clean])

  const collapsed = tall && !open && !expanded
  return (
    <div className="space-y-1">
      <div
        ref={ref}
        className={cn('rich-text relative', collapsed && 'overflow-hidden', className)}
        style={collapsed ? { maxHeight: COLLAPSED_PX, maskImage: 'linear-gradient(to bottom, black 75%, transparent)' } : undefined}
        dangerouslySetInnerHTML={{ __html: clean }}
      />
      {tall && !expanded && (
        <button type="button" className="text-info text-xs hover:underline" onClick={() => setOpen(o => !o)}>
          {open ? 'Show Less' : 'Show More'}
        </button>
      )}
    </div>
  )
}
