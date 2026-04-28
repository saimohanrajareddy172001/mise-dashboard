'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

type PriceEntry = { invoice_date: string; unit_price: number }
type TrackedItem = { item_name: string; category: string; prices: PriceEntry[]; current: number; previous: number; change: number }

export default function PriceTrackerPage() {
  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [items, setItems] = useState<TrackedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'up' | 'down'>('all')

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const { data: profile } = await supabase.from('profiles').select('restaurant_id').eq('id', data.user.id).single()
      if (profile) setRestaurantId(profile.restaurant_id)
    })
  }, [])

  useEffect(() => {
    if (!restaurantId) return
    supabase.from('invoice_lines')
      .select('item_name, category, unit_price, invoice_headers!header_id(invoice_date)')
      .eq('restaurant_id', restaurantId)
      .not('unit_price', 'is', null)
      .gt('unit_price', 0)
      .then(({ data }) => {
        if (!data) return
        const map: Record<string, { category: string; prices: PriceEntry[] }> = {}
        data.forEach((l: any) => {
          if (!l.item_name || !l.unit_price) return
          const date = l.invoice_headers?.invoice_date
          if (!date) return
          if (!map[l.item_name]) map[l.item_name] = { category: l.category || 'Other', prices: [] }
          map[l.item_name].prices.push({ invoice_date: date, unit_price: l.unit_price })
        })

        const tracked: TrackedItem[] = Object.entries(map)
          .filter(([, v]) => v.prices.length >= 2)
          .map(([item_name, { category, prices }]) => {
            const sorted = prices.sort((a, b) => a.invoice_date.localeCompare(b.invoice_date))
            const current = sorted[sorted.length - 1].unit_price
            const previous = sorted[sorted.length - 2].unit_price
            const change = ((current - previous) / previous) * 100
            return { item_name, category, prices: sorted, current, previous, change }
          })
          .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))

        setItems(tracked)
        setLoading(false)
      })
  }, [restaurantId])

  const filtered = items.filter(i => {
    if (filter === 'up') return i.change > 0
    if (filter === 'down') return i.change < 0
    return true
  })

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Price Tracker</h1>
      <p className="text-gray-500 text-sm mb-6">Track unit price changes across invoices for each item.</p>

      <div className="flex gap-2 mb-6">
        {([['all', 'All Items'], ['up', '↑ Price Increases'], ['down', '↓ Price Decreases']] as const).map(([val, label]) => (
          <button key={val} onClick={() => setFilter(val)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${filter === val ? 'bg-amber-500 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr className="text-gray-500 text-xs uppercase tracking-wide">
              <th className="text-left px-4 py-3">Item</th>
              <th className="text-left px-4 py-3">Category</th>
              <th className="text-right px-4 py-3">Previous</th>
              <th className="text-right px-4 py-3">Current</th>
              <th className="text-right px-4 py-3">Change</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">No price data available.</td></tr>
            ) : filtered.map(item => (
              <tr key={item.item_name} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{item.item_name}</td>
                <td className="px-4 py-3">
                  <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full">{item.category}</span>
                </td>
                <td className="px-4 py-3 text-right text-gray-500">${item.previous.toFixed(2)}</td>
                <td className="px-4 py-3 text-right font-semibold text-gray-900">${item.current.toFixed(2)}</td>
                <td className="px-4 py-3 text-right">
                  <span className={`flex items-center justify-end gap-1 font-semibold ${item.change > 0 ? 'text-red-500' : item.change < 0 ? 'text-green-500' : 'text-gray-400'}`}>
                    {item.change > 0 ? <TrendingUp size={14} /> : item.change < 0 ? <TrendingDown size={14} /> : <Minus size={14} />}
                    {item.change > 0 ? '+' : ''}{item.change.toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
