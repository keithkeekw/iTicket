// Floating "back to top" button in the bottom-right corner. It appears once the page has been
// scrolled down a little and scrolls smoothly back to the top (instantly when the user prefers
// reduced motion). `raised` lifts it above a fixed bottom bar, such as the Settings save bar.
import { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const SHOW_AFTER_PX = 400

export default function BackToTop({ raised = false }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const update = () => setVisible(window.scrollY > SHOW_AFTER_PX)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])

  const toTop = () => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
  }

  return (
    <Button
      type="button"
      size="icon"
      onClick={toTop}
      aria-label="Back to top"
      title="Back to top"
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      className={cn(
        'fixed right-4 z-20 size-11 rounded-full shadow-lg transition-all duration-200 sm:right-6',
        // The Settings save bar wraps onto two lines on phones, so it needs more room there.
        raised ? 'bottom-32 sm:bottom-20' : 'bottom-4 sm:bottom-6',
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0',
      )}
    >
      <ArrowUp className="size-5" />
    </Button>
  )
}
