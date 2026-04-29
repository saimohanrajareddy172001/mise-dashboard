'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, Printer } from 'lucide-react'

type Line = {
  id: string
  item_name: string
  display_name: string | null
  category: string
  purchase_unit: string | null
  unit_qty: number
  case_qty: number
  unit_price: number
  total: number
}
type Header = { invoice_date: string; invoice_number: string; vendor: string; total: number }

const CATEGORY_COLORS: Record<string, string> = {
  Protein: 'bg-red-100 text-red-700',
  Produce: 'bg-green-100 text-green-700',
  Dairy: 'bg-blue-100 text-blue-700',
  'Dry Goods': 'bg-yellow-100 text-yellow-700',
  Frozen: 'bg-indigo-100 text-indigo-700',
  Beverages: 'bg-cyan-100 text-cyan-700',
  Supplies: 'bg-gray-100 text-gray-600',
  Other: 'bg-amber-100 text-amber-700',
}

function qtyLabel(line: Line): string {
  const unit = line.purchase_unit
  if (unit === 'lb' && line.unit_qty) return `${line.unit_qty} lb`
  if (unit === 'case' && line.case_qty) return `${line.case_qty} case`
  if (unit === 'each' && line.unit_qty) return `${line.unit_qty} ea`
  if (line.unit_qty) return `${line.unit_qty}`
  if (line.case_qty) return `${line.case_qty} case`
  return '—'
}

export default function InvoiceDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const [header, setHeader] = useState<Header | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('invoice_headers').select('*').eq('id', id).single(),
      supabase.from('invoice_lines').select('*').eq('header_id', id).order('total', { ascending: false }),
    ]).then(([{ data: h }, { data: l }]) => {
      setHeader(h)
      setLines(l || [])
      setLoading(false)
    })
  }, [id])

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>
  if (!header) return <div className="p-8 text-gray-400">Invoice not found.</div>

  const regular = lines.filter(l => (l.total || 0) >= 0)
  const credits = lines.filter(l => (l.total || 0) < 0)
  const creditTotal = credits.reduce((s, l) => s + (l.total || 0), 0)

  return (
    <div className="p-8 print:p-4">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-500 hover:text-gray-800 text-sm transition">
          <ArrowLeft size={14} /> Back to Invoices
        </button>
        <button onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 bg-white border rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition">
          <Printer size={14} /> Print / PDF
        </button>
      </div>

      <div className="bg-white rounded-xl border p-6 mb-6 print:border-0 print:p-0 print:mb-4">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Invoice #{header.invoice_number}</h1>
            <p className="text-gray-500 text-sm mt-1">{header.vendor} · {header.invoice_date}</p>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400 uppercase tracking-wide">Invoice Total</div>
            <div className="text-3xl font-bold text-amber-500">${Number(header.total).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
            {credits.length > 0 && (
              <div className="text-sm text-red-500 mt-0.5">
                Incl. {credits.length} credit{credits.length > 1 ? 's' : ''} (${creditTotal.toFixed(2)})
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden print:border-0">
        {regular.length > 0 && (
          <>
            <div className="px-5 py-3 border-b bg-gray-50">
              <h2 className="font-semibold text-gray-700 text-sm">{regular.length} Line Items</h2>
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
                {regular.map(line => (
                  <tr key={line.id} className="border-b last:border-0 hover:bg-gray-50 print:hover:bg-white">
                    <td className="px-5 py-3 font-medium text-gray-900">{line.display_name || line.item_name}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${CATEGORY_COLORS[line.category] || CATEGORY_COLORS.Other}`}>
                        {line.category || 'Other'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right text-gray-600">{qtyLabel(line)}</td>
                    <td className="px-5 py-3 text-right text-gray-600">{line.unit_price ? `$${Number(line.unit_price).toFixed(2)}` : '—'}</td>
                    <td className="px-5 py-3 text-right font-semibold text-gray-900">${Number(line.total).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {credits.length > 0 && (
          <>
            <div className="px-5 py-3 border-t border-b bg-red-50">
              <h2 className="font-semibold text-red-700 text-sm">{credits.length} Credit{credits.length > 1 ? 's' : ''} / Return{credits.length > 1 ? 's' : ''}</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="border-b bg-red-50">
                <tr className="text-red-400 text-xs uppercase tracking-wide">
                  <th className="text-left px-5 py-3">Item</th>
                  <th className="text-left px-5 py-3">Category</th>
                  <th className="text-right px-5 py-3">Qty</th>
                  <th className="text-right px-5 py-3">Unit Price</th>
                  <th className="text-right px-5 py-3">Credit</th>
                </tr>
              </thead>
              <tbody>
                {credits.map(line => (
                  <tr key={line.id} className="border-b last:border-0 bg-red-50/50">
                    <td className="px-5 py-3 font-medium text-red-800">{line.display_name || line.item_name}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${CATEGORY_COLORS[line.category] || CATEGORY_COLORS.Other}`}>
                        {line.category || 'Other'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right text-red-600">{qtyLabel(line)}</td>
                    <td className="px-5 py-3 text-right text-red-600">{line.unit_price ? `$${Number(line.unit_price).toFixed(2)}` : '—'}</td>
                    <td className="px-5 py-3 text-right font-semibold text-red-600">${Number(line.total).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-5 py-3 border-t bg-red-50 text-right text-sm font-semibold text-red-700">
              Total Credits: ${creditTotal.toFixed(2)}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
