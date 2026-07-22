'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  House,
  ChartLine,
  FileText,
  Building2,
  Bell,
  ChartColumn,
  Settings,
  LogOut,
  Search,
  Plus,
  ChevronsUpDown,
  Check,
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useRestaurant } from '@/lib/restaurant'
import AddRestaurantButton from '@/components/AddRestaurantButton'

// Live nav items — real routes only.
const mainNav = [
  { href: '/dashboard', label: 'Home', icon: House, exact: true },
  { href: '/dashboard/price-tracker', label: 'Price Tracker', icon: ChartLine },
  { href: '/dashboard/invoices', label: 'Invoices', icon: FileText },
]
// Roadmap items — shown in the nav for discoverability but not yet wired to a
// route. Click is disabled so they can't break navigation.
const soonNav = [
  { label: 'Vendors', icon: Building2 },
  { label: 'Alerts', icon: Bell },
  { label: 'Food cost %', icon: ChartColumn },
]

const navBase =
  'flex items-center gap-3 rounded-[8px] border-l-[3px] px-3 py-2.5 transition'
const navActive = 'border-terracotta bg-[rgba(217,119,66,.16)] font-semibold text-[#FBE5D8]'
const navIdle = 'border-transparent text-forest-light hover:bg-white/5 hover:text-cream'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  const two = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')
  return (two || name.slice(0, 2)).toUpperCase()
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { session, loading: authLoading, signOut } = useAuth()
  const { current, list, setCurrent, loading: restLoading } = useRestaurant()

  // Time-of-day greeting is set after mount to avoid an SSR/client hydration
  // mismatch on the rendered hour.
  const [daypart, setDaypart] = useState('')
  useEffect(() => {
    const h = new Date().getHours()
    setDaypart(h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening')
  }, [])

  // Custom restaurant-switcher dropdown (replaces an unstyleable native <select>).
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const switcherRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!switcherOpen) return
    function onDocClick(e: MouseEvent) {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) setSwitcherOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSwitcherOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [switcherOpen])

  // Display name from the existing auth session, in priority order:
  //   1. user_metadata.full_name
  //   2. user_metadata.name
  //   3. prettified email local-part (split on non-letters, capitalize each word)
  //   4. "there"
  const displayName = useMemo(() => {
    const meta = (session?.user?.user_metadata ?? {}) as { full_name?: string; name?: string }
    if (meta.full_name?.trim()) return meta.full_name.trim()
    if (meta.name?.trim()) return meta.name.trim()
    const prefix = session?.user?.email?.split('@')[0] ?? ''
    const words = prefix.split(/[^a-zA-Z]+/).filter(Boolean)
    if (words.length) return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
    return 'there'
  }, [session])

  // Greeting uses just the first token of the display name.
  const firstName = displayName === 'there' ? 'there' : displayName.split(' ')[0]

  if (authLoading)
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream font-sans text-sm text-ink-muted">
        Loading…
      </div>
    )

  // AuthProvider redirects unauthenticated users to /login; render nothing while that happens.
  if (!session) return null

  const greeting = daypart ? `Good ${daypart}, ${firstName}` : `Welcome, ${firstName}`
  const settingsActive = pathname.startsWith('/dashboard/settings')

  return (
    <div className="flex min-h-screen bg-cream font-sans text-ink">
      {/* SIDEBAR */}
      <aside className="fixed inset-y-0 left-0 z-10 flex w-60 flex-col bg-forest px-4 py-6 text-[#DDE7E0]">
        <Link href="/dashboard" className="mb-5 px-2 font-serif text-[26px] text-cream">
          mise<span className="text-terracotta-hover">.</span>
        </Link>

        {/* Restaurant switcher — same useRestaurant() wiring, custom dropdown for readability. */}
        <div className="relative mb-6" ref={switcherRef}>
          <button
            type="button"
            onClick={() => list.length > 1 && setSwitcherOpen((o) => !o)}
            aria-haspopup="listbox"
            aria-expanded={switcherOpen}
            title={list.length > 1 ? 'Switch restaurant' : undefined}
            className="flex w-full items-center gap-2.5 rounded-[10px] bg-[#FFFDF9] px-2.5 py-2.5 text-left"
          >
            <div className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-full bg-terracotta font-serif text-[15px] text-[#FDF8F0]">
              {current ? initials(current.name) : '—'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-semibold text-[#142821]">
                {current?.name ?? (restLoading ? 'Loading…' : 'Select restaurant')}
              </div>
            </div>
            {list.length > 1 && <ChevronsUpDown size={14} className="flex-shrink-0 text-[#142821]/50" />}
          </button>

          {switcherOpen && list.length > 1 && (
            <ul
              role="listbox"
              aria-label="Restaurants"
              className="absolute inset-x-0 top-[calc(100%+6px)] z-20 max-h-64 overflow-auto rounded-[10px] border border-[#142821]/10 bg-[#FFFDF9] p-1 shadow-[0_10px_30px_rgba(20,40,33,.25)]"
            >
              {list.map((r) => {
                const selected = r.id === current?.id
                return (
                  <li key={r.id} role="option" aria-selected={selected}>
                    <button
                      type="button"
                      onClick={() => {
                        setCurrent(r)
                        setSwitcherOpen(false)
                      }}
                      className={`flex w-full items-center gap-2 rounded-[7px] px-2.5 py-2 text-left text-[13.5px] transition hover:bg-[rgba(217,119,66,.12)] ${
                        selected ? 'font-semibold text-terracotta' : 'text-[#142821]'
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">{r.name}</span>
                      {selected && <Check size={15} className="flex-shrink-0 text-terracotta" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Main nav */}
        <nav className="flex flex-col gap-0.5 text-[14px]">
          {mainNav.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href)
            return (
              <Link key={href} href={href} className={`${navBase} ${active ? navActive : navIdle}`}>
                <Icon size={18} />
                {label}
              </Link>
            )
          })}
          {soonNav.map(({ label, icon: Icon }) => (
            <div
              key={label}
              className={`${navBase} cursor-default select-none border-transparent text-forest-light/60`}
              aria-disabled="true"
              title="Coming soon"
            >
              <Icon size={18} />
              <span className="flex-1">{label}</span>
              <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-forest-light">
                SOON
              </span>
            </div>
          ))}
        </nav>

        {/* Bottom group */}
        <div className="mt-auto flex flex-col gap-0.5 border-t border-white/10 pt-4 text-[14px]">
          <div className="px-3 pb-1">
            <p className="truncate text-[13px] font-semibold text-cream">{displayName}</p>
            <p className="truncate text-[11px] text-forest-light/70">{session.user.email}</p>
          </div>
          <Link
            href="/dashboard/settings"
            className={`${navBase} ${settingsActive ? navActive : navIdle}`}
          >
            <Settings size={18} />
            Settings
          </Link>
          <button
            onClick={signOut}
            className={`${navBase} ${navIdle} text-left`}
          >
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </aside>

      {/* CONTENT */}
      <div className="ml-60 flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-[5] flex items-center justify-between gap-4 border-b border-ink/[0.08] bg-cream/95 px-8 py-4 backdrop-blur">
          <div className="min-w-0">
            <h1 className="truncate font-serif text-[28px] leading-none text-ink">{greeting}</h1>
            {current && <p className="mt-1.5 truncate text-[13px] text-ink-muted">{current.name}</p>}
          </div>
          <div className="flex flex-shrink-0 items-center gap-3">
            <button
              type="button"
              aria-label="Search"
              className="flex h-10 w-10 items-center justify-center rounded-[9px] border border-ink/[0.14] bg-cream-surface text-ink-2 transition hover:bg-cream-surface-alt"
            >
              <Search size={18} />
            </button>
            <button
              type="button"
              aria-label="Notifications"
              className="flex h-10 w-10 items-center justify-center rounded-[9px] border border-ink/[0.14] bg-cream-surface text-ink-2 transition hover:bg-cream-surface-alt"
            >
              <Bell size={18} />
            </button>
            <Link
              href="/dashboard/upload"
              className="flex items-center gap-2 rounded-[10px] bg-terracotta px-4 py-2.5 text-[14px] font-semibold text-[#FDF8F0] shadow-[0_2px_8px_rgba(196,100,45,.3)] transition hover:bg-terracotta-hover"
            >
              <Plus size={16} strokeWidth={2.5} /> Add invoice
            </Link>
            {/* Preserves the existing create-restaurant wiring (its own styling). */}
            <AddRestaurantButton />
          </div>
        </header>

        {/* If there are no restaurants yet (RLS returns 0), prompt to create one. */}
        {!restLoading && list.length === 0 ? (
          <main className="flex flex-1 items-center justify-center p-8">
            <div className="max-w-md space-y-3 text-center">
              <h2 className="font-serif text-[24px] text-ink">No restaurants yet</h2>
              <p className="text-sm text-ink-3">
                You&apos;re signed in but not a member of any restaurant. Create one to get started,
                or ask your admin for an invite.
              </p>
              <div className="pt-2">
                <AddRestaurantButton />
              </div>
            </div>
          </main>
        ) : !current ? (
          <main className="flex flex-1 items-center justify-center text-sm text-ink-muted">
            Loading restaurant…
          </main>
        ) : (
          <main className="flex-1 overflow-auto">{children}</main>
        )}
      </div>
    </div>
  )
}
