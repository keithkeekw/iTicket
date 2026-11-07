import { Suspense, lazy, useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { NavLink, Navigate, useLocation } from 'react-router-dom'
import BackToTop from '@/components/BackToTop'
import { Spinner } from '@/components/common'
import { buttonVariants } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { LATEST_CHANGE } from '@/lib/changelog'
import { cn } from '@/lib/utils'

// Each page's code is a separate file loaded when the page is first opened, so the first page
// appears sooner. The rest are fetched quietly once the browser is idle (see usePrefetchPages).
const PAGE_LOADERS = {
  qualityReview: () => import('./pages/QualityReview.jsx'),
  ticketInspector: () => import('./pages/TicketInspector.jsx'),
  metadataQc: () => import('./pages/MetadataQC.jsx'),
  qaRubrics: () => import('./pages/QARubrics.jsx'),
  userGuide: () => import('./pages/UserGuide.jsx'),
  settings: () => import('./pages/Settings.jsx'),
  whatsNew: () => import('./pages/WhatsNew.jsx'),
}
const QualityReview = lazy(PAGE_LOADERS.qualityReview)
const TicketInspector = lazy(PAGE_LOADERS.ticketInspector)
const MetadataQC = lazy(PAGE_LOADERS.metadataQc)
const QARubrics = lazy(PAGE_LOADERS.qaRubrics)
const UserGuide = lazy(PAGE_LOADERS.userGuide)
const Settings = lazy(PAGE_LOADERS.settings)
const WhatsNew = lazy(PAGE_LOADERS.whatsNew)

// After the first page has loaded, fetch the other pages in the background so switching is instant.
function usePrefetchPages() {
  useEffect(() => {
    const prefetch = () => Object.values(PAGE_LOADERS).forEach(load => load().catch(() => {}))
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(prefetch, { timeout: 4000 })
      return () => window.cancelIdleCallback(id)
    }
    const id = setTimeout(prefetch, 2000)
    return () => clearTimeout(id)
  }, [])
}

const PageLoading = () => (
  <div className="text-muted-foreground flex items-center gap-2 text-sm">
    <Spinner /> Loading…
  </div>
)

function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('theme') || 'light'
    } catch {
      return 'light'
    }
  })
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try {
      localStorage.setItem('theme', theme)
    } catch {
      /* storage unavailable */
    }
  }, [theme])
  return [theme, setTheme]
}

// Page links on the dark navigation bar: the current page is a light pill, the others dimmed text.
const linkClass = ({ isActive }) =>
  cn(
    buttonVariants({ variant: 'ghost', size: 'sm' }),
    isActive
      ? 'bg-white/15 text-white hover:bg-white/20 dark:hover:bg-white/20'
      : 'text-white/75 hover:bg-white/10 hover:text-white dark:hover:bg-white/10',
  )

// Navigation order; the first page is the landing page.
const PAGES = [
  { path: '/quality-review', label: 'Quality Review', Page: QualityReview },
  { path: '/ticket-inspector', label: 'Ticket Inspector', Page: TicketInspector },
  { path: '/metadata-qc', label: 'Metadata QC', Page: MetadataQC },
  { path: '/qa-rubrics', label: 'QA Rubrics', Page: QARubrics },
  { path: '/user-guide', label: 'User Guide', Page: UserGuide },
  { path: '/settings', label: 'Settings', Page: Settings },
  // Opened from the What's New button beside the Dark switch, not from the page links.
  { path: '/whats-new', label: "What's New", Page: WhatsNew, inNav: false },
]
const LANDING = PAGES[0].path
const WHATS_NEW_SEEN_KEY = 'whatsNewSeen'

// True until the What's New page has been opened since the latest release notes were added.
function useUnseenChanges(current) {
  const [seen, setSeen] = useState(() => {
    try {
      return localStorage.getItem(WHATS_NEW_SEEN_KEY) || ''
    } catch {
      return ''
    }
  })
  useEffect(() => {
    if (current !== '/whats-new' || seen >= LATEST_CHANGE) return
    setSeen(LATEST_CHANGE)
    try {
      localStorage.setItem(WHATS_NEW_SEEN_KEY, LATEST_CHANGE)
    } catch {
      /* storage unavailable */
    }
  }, [current, seen])
  return seen < LATEST_CHANGE
}

// Old addresses that still work after a page was renamed or moved.
const LEGACY_PATHS = { '/ai-review': '/quality-review' }

export default function App() {
  const [theme, setTheme] = useTheme()
  const { pathname } = useLocation()
  const known = PAGES.some(p => p.path === pathname)
  const current = known ? pathname : LANDING
  const [visited, setVisited] = useState(() => new Set([current]))
  const unseen = useUnseenChanges(current)
  usePrefetchPages()

  useEffect(() => {
    setVisited(v => (v.has(current) ? v : new Set(v).add(current)))
  }, [current])

  // "/" and unknown addresses open the landing page.
  if (!known) return <Navigate to={LEGACY_PATHS[pathname] || LANDING} replace />

  return (
    <div className="bg-muted/40 min-h-screen">
      {/* .dark makes the controls inside use their dark-theme colours on the dark bar. */}
      <nav className="dark bg-nav border-nav-border text-foreground flex min-h-14 items-center gap-3 border-b px-4 py-1.5 sm:gap-6 sm:px-8">
        <span className="shrink-0 text-base font-semibold whitespace-nowrap sm:text-lg">XR Ticket Insight</span>
        {/* Scrolls sideways on narrow screens instead of widening the page. */}
        <div className="flex min-w-0 gap-1 overflow-x-auto">
          {PAGES.filter(p => p.inNav !== false).map(({ path, label }) => (
            <NavLink key={path} to={path} className={linkClass}>
              {label}
            </NavLink>
          ))}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <NavLink
            to="/whats-new"
            className={({ isActive }) =>
              cn(
                buttonVariants({ variant: 'outline', size: 'sm' }),
                'relative bg-transparent text-white hover:bg-white/10 dark:bg-transparent dark:hover:bg-white/10',
                isActive && 'bg-white/15 dark:bg-white/15',
              )
            }
            title={unseen ? "What's New — new changes since your last visit" : "What's New"}
          >
            <Sparkles />
            <span className="hidden sm:inline">What&apos;s New</span>
            {unseen && (
              <span className="bg-info absolute -top-1 -right-1 size-2.5 rounded-full ring-2 ring-nav" aria-label="New changes" />
            )}
          </NavLink>
          <Label htmlFor="dark-mode" className="text-sm">
            Dark
          </Label>
          <Switch
            id="dark-mode"
            checked={theme === 'dark'}
            onCheckedChange={on => setTheme(on ? 'dark' : 'light')}
          />
        </div>
      </nav>
      <main className="p-4 sm:p-8">
        {/* Pages stay mounted once opened and are only hidden when you navigate away, so their
            results, filters, selections and in-progress reviews survive switching pages. */}
        {PAGES.filter(p => visited.has(p.path)).map(({ path, Page }) => (
          <div key={path} hidden={path !== current}>
            <Suspense fallback={<PageLoading />}>
              <Page active={path === current} />
            </Suspense>
          </div>
        ))}
      </main>
      {/* Settings has a fixed save bar along the bottom, so the button sits above it there. */}
      <BackToTop raised={current === '/settings'} />
    </div>
  )
}
