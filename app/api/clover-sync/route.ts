import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cloverAdapter, type CloverCreds } from '@/lib/pos/clover'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!
const WINDOW_DAYS = 30
const INSERT_CHUNK = 500

export async function POST(req: NextRequest) {
  if (!SUPABASE_SERVICE_KEY) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_KEY not set' }, { status: 500 })
  }

  const { restaurant_id } = await req.json()
  if (!restaurant_id) {
    return NextResponse.json({ error: 'restaurant_id required' }, { status: 400 })
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  const { data: settings, error: settingsError } = await sb
    .from('restaurant_settings')
    .select('clover_merchant_id, clover_api_key')
    .eq('restaurant_id', restaurant_id)
    .single()

  if (settingsError || !settings?.clover_merchant_id || !settings?.clover_api_key) {
    return NextResponse.json(
      { error: 'Clover not configured for this restaurant' },
      { status: 400 },
    )
  }

  const sinceTs = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000
  const sinceDate = new Date(sinceTs).toISOString().slice(0, 10)

  let rows
  try {
    rows = await cloverAdapter.fetchSales({
      restaurant_id,
      creds: settings as CloverCreds,
      sinceTs,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }

  if (rows.length === 0) return NextResponse.json({ count: 0 })

  // pos_sales has a unique INDEX with coalesce(...) expressions that PostgREST
  // can't target for upsert. Delete-then-insert the window for this
  // (restaurant_id, pos_source). Cost: a partial-failure window can lose the
  // pre-existing rows for the window. A future migration adding a real
  // unique constraint or a SECURITY DEFINER RPC replaces this.
  const { error: delError } = await sb
    .from('pos_sales')
    .delete()
    .eq('restaurant_id', restaurant_id)
    .eq('pos_source', 'clover')
    .gte('sale_date', sinceDate)
  if (delError) return NextResponse.json({ error: delError.message }, { status: 500 })

  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const { error } = await sb.from('pos_sales').insert(rows.slice(i, i + INSERT_CHUNK))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ count: rows.length })
}
