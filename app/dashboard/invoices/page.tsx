'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Search, Download } from 'lucide-react'

type Invoice = { id: string; invoice_date: string; invoice_number: string; vendor: string; total: number }

export default function InvoicesPage() {
  const router = useRouter()
  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const { data: profile } = await supabase.from('profiles').select('restaurant_id').eq('id', data.user.id).single()
      if (profile) setRestaurantId(profile.restaurant_id)
    })
  }, [])

  useEffect(() => {
    if (!restaurantId) return
    supabase.from('invoice_headers').select('*').eq('restaurant_id', restaurantId)
      .order('invoice_date', { ascending: false }).then(({ data }) => {
        setInvoices(data || [])
        setLoading(false)
      })
  }, [restaurantId])

  const filtered = invoices.filter(inv =>
    inv.invoice_number?.toString().includes(search) ||
    inv.vendor?.toLowerCase().includes(search.toLowerCase()) ||
    inv.invoice_date?.includes(search)
  )

  async function exportCSV() {
    if (!restaurantId) return
    const { data: lines } = await supabase
      .from('invoice_lines')
      .select('invoice_date, item_name, category, unit_qty, case_qty, unit_price, total, invoice_headers!header_id(invoice_number, vendor)')
      .eq('restaurant_id', restaurantId)
      .order('invoice_date', { ascending: false })
    if (!lines) return
    const rows = [
      ['Date', 'Invoice #', 'Vendor', 'Item', 'Category', 'Unit Qty', 'Case Qty', 'Unit Price', 'Total'],
      ...lines.map((l: any) => [
        l.invoice_date, l.invoice_headers?.invoice_number, l.invoice_headers?.vendor,
        l.item_name, l.category, l.unit_qty, l.case_qty, l.unit_price, l.total
      ])
    ]
    const csv = rows.map(r => r.map((v: any) => `"${v ?? ''}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `invoices-${new Date().toISOString().split('T')[0]}.csv`; a.click()
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Invoices</h1>
          <p className="text-gray-500 text-sm">All invoices — click to see line items.</p>
        </div>
        <button onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2 bg-white border rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition">
          <Download size={14} /> Export CSV
        </button>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by date, invoice #, or vendor..."
          className="w-full border rounded-lg pl-9 pr-4 py-2 text-sm text-gray-700 focus:outline-none focus:border-amber-500" />
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr className="text-gray-500 text-xs uppercase tracking-wide">
              <th className="text-left px-4 py-3">Date</th>
              <th className="text-left px-4 py-3">Invoice #</th>
              <th className="text-left px-4 py-3">Vendor</th>
              <th className="text-right px-4 py-3">Total</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="text-center py-8 text-gray-400">Loading...</td></tr>
            ) : filtered.map(inv => (
              <tr key={inv.id} onClick={() => router.push(`/dashboard/invoices/${inv.id}`)}
                className="border-b last:border-0 hover:bg-amber-50 cursor-pointer transition">
                <td className="px-4 py-3 text-gray-600">{inv.invoice_date}</td>
                <td className="px-4 py-3 font-medium text-gray-900">#{inv.invoice_number}</td>
                <td className="px-4 py-3 text-gray-600">{inv.vendor}</td>
                <td className="px-4 py-3 text-right font-semibold text-gray-900">${Number(inv.total).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
