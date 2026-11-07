// Shared click-to-open table rows (Quality Review, Metadata QC).
import { cn } from '@/lib/utils'

// Props that make a table row open or close its details when clicked (or Enter/Space when the row
// has focus). Clicks on links, buttons and checkboxes, clicks inside dialogs opened from the row
// (React portals bubble up to it) and text selections are left alone.
const INTERACTIVE = 'a, button, input, select, textarea, label, [role="checkbox"], [role="button"], [role="menuitem"]'
export function rowToggleProps({ enabled, isOpen, onToggle, className }) {
  if (!enabled) return { className }
  return {
    className: cn('cursor-pointer', isOpen && 'bg-muted/50', className),
    tabIndex: 0,
    'aria-expanded': !!isOpen,
    onClick: e => {
      if (!e.currentTarget.contains(e.target) || e.target.closest(INTERACTIVE)) return
      if (window.getSelection?.()?.toString()) return
      onToggle()
    },
    onKeyDown: e => {
      if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
      e.preventDefault()
      onToggle()
    },
  }
}
