'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { DollarSign, TrendingUp, ShoppingBag } from 'lucide-react'

type CategorySpend = { category: string; total: number }
type RecentInvoice = { id: string; invoice_date: string; invoice_number: string; vendor: string; total: number }

export default function DashboardPage() {
  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [range, setRange] = useState<'weekly' | 'monthly' | 'custom'>('monthly')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [totalSpend, setTotalSpend] = useState(0)
  const [prevSpend, setPrevSpend] = useState<number | null>(null)
  const [invoiceCount, setInvoiceCount] = useState(0)
  const [topCategory, setTopCategory] = useState('-')
  const [categoryData, setCategoryData] = useState<CategorySpend[]>([])
  const [recentInvoices, setRecentInvoices] = useState<RecentInvoice[]>([])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('restaurant_id')
        .eq('id', data.user.id)
        .single()
      if (profile) setRestaurantId(profile.restaurant_id)
    })
  }, [])

  useEffect(() => {
    if (!restaurantId) return
    loadData()
  }, [restaurantId, range, customStart, customEnd])

  function localDate(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  function getDateRange() {
    const now = new Date()
    if (range === 'weekly') {
      const start = new Date(now); start.setDate(now.getDate() - 7)
      return { start: localDate(start), end: localDate(now) }
    }
    if (range === 'monthly') {
      return { start: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, end: localDate(now) }
    }
    return { start: customStart, end: customEnd }
  }

  function getPrevDateRange() {
    const now = new Date()
    if (range === 'weekly') {
      const end = new Date(now); end.setDate(now.getDate() - 7)
      const start = new Date(now); start.setDate(now.getDate() - 14)
      return { start: localDate(start), end: localDate(end) }
    }
    if (range === 'monthly') {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0)
      return { start: localDate(d), end: localDate(lastDay) }
    }
    return null
  }

  async function loadData() {
    const { start, end } = getDateRange()
    if (!start || !end) return

    const { data: headers } = await supabase
      .from('invoice_headers')
      .select('id, invoice_date, invoice_number, vendor, total')
      .eq('restaurant_id', restaurantId)
      .gte('invoice_date', start)
      .lte('invoice_date', end)
      .order('invoice_date', { ascending: false })

    if (!headers) return
    const total = headers.reduce((s, h) => s + (h.total || 0), 0)
    setTotalSpend(total)
    setInvoiceCount(headers.length)
    setRecentInvoices(headers.slice(0, 8))

    const headerIds = headers.map(h => h.id)
    const prev = getPrevDateRange()

    const [linesResult, prevResult] = await Promise.all([
      headerIds.length > 0
        ? supabase.from('invoice_lines').select('category, total').in('header_id', headerIds)
        : Promise.resolve({ data: null }),
      prev?.start && prev?.end
        ? supabase.from('invoice_headers').select('total').eq('restaurant_id', restaurantId).gte('invoice_date', prev.start).lte('invoice_date', prev.end)
        : Promise.resolve({ data: null }),
    ])

    if (linesResult.data) {
      const catMap: Record<string, number> = {}
      linesResult.data.forEach((l: any) => { catMap[l.category || 'Other'] = (catMap[l.category || 'Other'] || 0) + (l.total || 0) })
      const sorted = Object.entries(catMap).sort((a, b) => b[1] - a[1])
      setCategoryData(sorted.map(([category, total]) => ({ category, total: Math.round(total * 100) / 100 })))
      setTopCategory(sorted[0]?.[0] || '-')
    }

    setPrevSpend(prevResult.data ? prevResult.data.reduce((s: number, h: any) => s + (h.total || 0), 0) : null)
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm">Spend, categories, and recent invoices at a glance.</p>
        </div>
        <div className="flex gap-2">
          {(['weekly', 'monthly'] as const).map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition ${range === r ? 'bg-amber-500 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}>
              {r}
            </button>
          ))}
          <button onClick={() => setRange('custom')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${range === 'custom' ? 'bg-amber-500 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}>
            Custom
          </button>
        </div>
      </div>

      {range === 'custom' && (
        <div className="flex gap-3 mb-6">
          <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm text-gray-700" />
          <span className="text-gray-400 self-center">to</span>
          <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm text-gray-700" />
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign size={16} className="text-amber-500" />
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Total Spend</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">${totalSpend.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-gray-400">{invoiceCount} invoices</span>
            {prevSpend !== null && prevSpend > 0 && (
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${totalSpend > prevSpend ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'}`}>
                {totalSpend > prevSpend ? '+' : ''}{(((totalSpend - prevSpend) / prevSpend) * 100).toFixed(1)}% vs prev
              </span>
            )}
          </div>
        </div>
        {[
          { label: 'Avg per Invoice', value: invoiceCount ? `$${(totalSpend / invoiceCount).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '$0.00', sub: 'this period', icon: TrendingUp },
          { label: 'Top Category', value: topCategory, sub: 'by spend', icon: ShoppingBag },
        ].map(({ label, value, sub, icon: Icon }) => (
          <div key={label} className="bg-white rounded-xl border p-5">
            <div className="flex items-center gap-2 text-amber-500 mb-3">
              <Icon size={16} />
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{value}</div>
            <div className="text-xs text-gray-400 mt-1">{sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-xl border p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Spend by Category</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={categoryData}>
              <XAxis dataKey="category" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => `$${Number(v).toLocaleString()}`} />
              <Bar dataKey="total" fill="#F59E0B" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Recent Invoices</h2>
          <table className="w-full text-sm">
            <thead><tr className="text-gray-400 text-xs border-b">
              <th className="text-left pb-2">Date</th>
              <th className="text-left pb-2">Invoice #</th>
              <th className="text-right pb-2">Total</th>
            </tr></thead>
            <tbody>
              {recentInvoices.map(inv => (
                <tr key={inv.id} className="border-b last:border-0">
                  <td className="py-2 text-gray-600">{inv.invoice_date}</td>
                  <td className="py-2 text-gray-800">#{inv.invoice_number}</td>
                  <td className="py-2 text-right font-medium text-gray-900">${Number(inv.total).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
