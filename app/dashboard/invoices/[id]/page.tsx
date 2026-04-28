'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ArrowLeft } from 'lucide-react'

type Line = { id: string; item_name: string; category: string; unit_qty: number; case_qty: number; unit_price: number; total: number }
type Header = { invoice_date: string; invoice_number: string; vendor: string; total: number }

export default function InvoiceDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const [header, setHeader] = useState<Header | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('invoice_headers').select('*').eq('id', id).single(),
      supabase.from('invoice_lines').select('*').eq('header_id', id).order('total', { ascending: false })
    ]).then(([{ data: h }, { data: l }]) => {
      setHeader(h)
      setLines(l || [])
      setLoading(false)
    })
  }, [id])

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>
  if (!header) return <div className="p-8 text-gray-400">Invoice not found.</div>

  return (
    <div className="p-8">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-500 hover:text-gray-800 text-sm mb-6 transition">
        <ArrowLeft size={14} /> Back to Invoices
      </button>

      <div className="bg-white rounded-xl border p-6 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Invoice #{header.invoice_number}</h1>
            <p className="text-gray-500 text-sm mt-1">{header.vendor} · {header.invoice_date}</p>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400 uppercase tracking-wide">Total</div>
            <div className="text-3xl font-bold text-amber-500">${Number(header.total).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50">
          <h2 className="font-semibold text-gray-700 text-sm">{lines.length} Line Items</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="border-b">
            <tr className="text-gray-400 text-xs uppercase tracking-wide">
              <th className="text-left px-5 py-3">Item</th>
              <th className="text-left px-5 py-3">Category</th>
              <th className="text-right px-5 py-3">Qty</th>
              <th className="text-right px-5 py-3">Unit Price</th>
              <th className="text-right px-5 py-3">Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(line => (
              <tr key={line.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-5 py-3 font-medium text-gray-900">{line.item_name}</td>
                <td className="px-5 py-3">
                  <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full">{line.category || 'Other'}</span>
                </td>
                <td className="px-5 py-3 text-right text-gray-600">{line.unit_qty || line.case_qty || '-'}</td>
                <td className="px-5 py-3 text-right text-gray-600">{line.unit_price ? `$${Number(line.unit_price).toFixed(2)}` : '-'}</td>
                <td className="px-5 py-3 text-right font-semibold text-gray-900">${Number(line.total).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
