'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Search } from 'lucide-react'

type LineResult = {
  item_name: string
  category: string
  unit_price: number
  unit_qty: number
  case_qty: number
  total: number
  invoice_date: string
  invoice_number: string
  vendor: string
}

export default function SearchPage() {
  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<LineResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const { data: profile } = await supabase.from('profiles').select('restaurant_id').eq('id', data.user.id).single()
      if (profile) setRestaurantId(profile.restaurant_id)
    })
  }, [])

  async function search() {
    if (!restaurantId || !query.trim()) return
    setLoading(true)
    setSearched(true)
    const { data } = await supabase
      .from('invoice_lines')
      .select('item_name, category, unit_price, unit_qty, case_qty, total, invoice_date, invoice_headers!header_id(invoice_number, vendor)')
      .eq('restaurant_id', restaurantId)
      .ilike('item_name', `%${query.trim()}%`)
      .gt('total', 0)
      .order('invoice_date', { ascending: false })
      .limit(200)
    if (data) {
      setResults(data.map((r: any) => ({
        ...r,
        invoice_number: r.invoice_headers?.invoice_number ?? '',
        vendor: r.invoice_headers?.vendor ?? '',
      })))
    }
    setLoading(false)
  }

  const totalSpend = results.reduce((s, r) => s + (r.total || 0), 0)
  const avgPrice = results.length ? results.reduce((s, r) => s + (r.unit_price || 0), 0) / results.length : 0

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Item Search</h1>
      <p className="text-gray-500 text-sm mb-6">Search any ingredient across all invoices.</p>

      <div className="flex gap-2 mb-6">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
            placeholder="e.g. chicken, shrimp, cauliflower..."
            className="w-full border rounded-lg pl-9 pr-4 py-2 text-sm text-gray-700 focus:outline-none focus:border-amber-500"
          />
        </div>
        <button onClick={search}
          className="px-5 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition">
          Search
        </button>
      </div>

      {searched && !loading && results.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Purchases found', value: results.length.toString() },
            { label: 'Total spend', value: `$${totalSpend.toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
            { label: 'Avg unit price', value: `$${avgPrice.toFixed(2)}` },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white rounded-xl border p-4">
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</div>
              <div className="text-xl font-bold text-gray-900">{value}</div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Searching...</div>
      ) : searched && results.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No results found for "{query}"</div>
      ) : results.length > 0 ? (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr className="text-gray-500 text-xs uppercase tracking-wide">
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Invoice #</th>
                <th className="text-left px-4 py-3">Item</th>
                <th className="text-left px-4 py-3">Category</th>
                <th className="text-right px-4 py-3">Unit Price</th>
                <th className="text-right px-4 py-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500">{r.invoice_date}</td>
                  <td className="px-4 py-3 text-gray-600">#{r.invoice_number}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{r.item_name}</td>
                  <td className="px-4 py-3">
                    <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full">{r.category}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">${(r.unit_price ?? 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">${(r.total ?? 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
