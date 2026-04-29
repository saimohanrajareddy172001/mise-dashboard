import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!

export async function POST(req: NextRequest) {
  const { restaurant_id } = await req.json()
  if (!restaurant_id) return NextResponse.json({ error: 'restaurant_id required' }, { status: 400 })

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  const { data: settings } = await sb
    .from('restaurant_settings')
    .select('clover_merchant_id, clover_api_key')
    .eq('restaurant_id', restaurant_id)
    .single()

  if (!settings?.clover_merchant_id || !settings?.clover_api_key) {
    return NextResponse.json({ error: 'Clover not configured' }, { status: 400 })
  }

  const { clover_merchant_id: merchantId, clover_api_key: token } = settings

  // Pull last 30 days of orders from Clover
  const since = Date.now() - 30 * 24 * 60 * 60 * 1000
  const url = `https://api.clover.com/v3/merchants/${merchantId}/orders?filter=createdTime>=${since}&expand=lineItems&limit=1000`

  const cloverResp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })

  if (!cloverResp.ok) {
    const err = await cloverResp.text()
    return NextResponse.json({ error: `Clover API error: ${err}` }, { status: cloverResp.status })
  }

  const cloverData = await cloverResp.json()
  const orders = cloverData.elements || []

  // Aggregate by date + item name
  const salesMap: Record<string, { sale_date: string; item_name: string; quantity: number; revenue: number }> = {}

  for (const order of orders) {
    const date = new Date(order.createdTime).toISOString().split('T')[0]
    for (const li of order.lineItems?.elements || []) {
      const name = li.name || 'Unknown'
      const key = `${date}__${name}`
      if (!salesMap[key]) salesMap[key] = { sale_date: date, item_name: name, quantity: 0, revenue: 0 }
      salesMap[key].quantity += li.quantity || 1
      salesMap[key].revenue += (li.price || 0) / 100 // Clover stores cents
    }
  }

  const rows = Object.values(salesMap).map(r => ({ ...r, restaurant_id, category: 'Other' }))
  if (rows.length === 0) return NextResponse.json({ count: 0 })

  // Upsert — avoid duplicates on re-sync
  const { error } = await sb
    .from('pos_sales')
    .upsert(rows, { onConflict: 'restaurant_id,sale_date,item_name', ignoreDuplicates: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ count: rows.length })
}
