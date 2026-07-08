'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  FileText,
  ShoppingCart,
  TrendingUp,
  LogOut,
  Search,
  UploadCloud,
  Trash2,
  Settings,
  Activity,
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useRestaurant } from '@/lib/restaurant'
import RestaurantSwitcher from '@/components/RestaurantSwitcher'
import AddRestaurantButton from '@/components/AddRestaurantButton'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/automation', label: 'AI Automation', icon: Activity },
  { href: '/dashboard/invoices', label: 'Invoices', icon: FileText },
  { href: '/dashboard/upload', label: 'Upload Invoice', icon: UploadCloud },
  { href: '/dashboard/most-purchased', label: 'Most Purchased', icon: ShoppingCart },
  { href: '/dashboard/price-tracker', label: 'Price Tracker', icon: TrendingUp },
  { href: '/dashboard/search', label: 'Item Search', icon: Search },
  { href: '/dashboard/wastage', label: 'Wastage', icon: Trash2 },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { session, loading: authLoading, signOut } = useAuth()
  const { current, list, loading: restLoading } = useRestaurant()

  if (authLoading)
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">
        Loading…
      </div>
    )

  // AuthProvider redirects unauthenticated users to /login; render nothing while that happens.
  if (!session) return null

  const activePage = navItems.find((n) =>
    n.exact ? pathname === n.href : pathname.startsWith(n.href)
  )

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="w-56 bg-gray-950 flex flex-col fixed inset-y-0 left-0 z-10">
        <div className="p-5 border-b border-gray-800">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center text-white font-bold">
              M
            </div>
            <div>
              <div className="text-white font-semibold text-sm">Mise</div>
              <div className="text-gray-500 text-xs">Invoice Analytics</div>
            </div>
          </Link>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                  active
                    ? 'bg-amber-500 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                <Icon size={16} />
                {label}
              </Link>
            )
          })}
        </nav>
        <div className="p-4 border-t border-gray-800">
          <p className="text-gray-500 text-xs truncate mb-2">
            {session.user.email}
          </p>
          <button
            onClick={signOut}
            className="flex items-center gap-2 text-gray-400 hover:text-white text-sm transition"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 ml-56 min-w-0 flex flex-col">
        <header className="h-14 bg-white border-b border-gray-200 flex items-center px-6 sticky top-0 z-[5]">
          <h1 className="text-sm font-medium text-gray-700">
            {activePage?.label ?? 'Dashboard'}
          </h1>
          <div className="ml-auto flex items-center gap-2">
            <RestaurantSwitcher />
            <AddRestaurantButton />
          </div>
        </header>

        {/* If there are no restaurants yet (RLS returns 0), prompt to create one. */}
        {!restLoading && list.length === 0 ? (
          <main className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-md text-center space-y-3">
              <h2 className="text-lg font-semibold">No restaurants yet</h2>
              <p className="text-sm text-gray-600">
                You&apos;re signed in but not a member of any restaurant. Create one to get started,
                or ask your admin for an invite.
              </p>
              <div className="pt-2">
                <AddRestaurantButton />
              </div>
            </div>
          </main>
        ) : !current ? (
          <main className="flex-1 flex items-center justify-center text-gray-500 text-sm">
            Loading restaurant…
          </main>
        ) : (
          <main className="flex-1 overflow-auto">{children}</main>
        )}
      </div>
    </div>
  )
}
