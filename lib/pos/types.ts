export type PosSource = 'clover' | 'toast' | 'square' | 'csv'

export interface PosSaleRow {
  restaurant_id: string
  pos_source: PosSource
  pos_order_id: string | null
  pos_line_id: string | null
  sale_date: string
  sale_ts: string | null
  item_name: string
  category: string | null
  quantity: number
  unit: string | null
  unit_price: number | null
  revenue: number
  modifiers: string[] | null
  raw: unknown
}

export interface PosAdapterArgs<TCreds> {
  restaurant_id: string
  creds: TCreds
  sinceTs: number
}

export interface PosAdapter<TCreds = unknown> {
  source: PosSource
  fetchSales(args: PosAdapterArgs<TCreds>): Promise<PosSaleRow[]>
}
