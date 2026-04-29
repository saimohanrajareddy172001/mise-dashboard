-- Run this in your Supabase SQL Editor
-- Adds wastage tracking tables + missing invoice columns

-- 1. Add missing columns to invoice_lines (if not already done)
ALTER TABLE invoice_lines
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS purchase_unit TEXT;

-- 2. Clover POS sales
CREATE TABLE IF NOT EXISTS pos_sales (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id    UUID NOT NULL,
  sale_date        DATE NOT NULL,
  item_name        TEXT NOT NULL,
  category         TEXT DEFAULT 'Other',
  quantity         NUMERIC DEFAULT 0,
  revenue          NUMERIC DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (restaurant_id, sale_date, item_name)
);

ALTER TABLE pos_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "restaurant sees own sales" ON pos_sales
  FOR ALL USING (
    restaurant_id IN (
      SELECT restaurant_id FROM profiles WHERE id = auth.uid()
    )
  );

-- 3. Restaurant settings (Clover credentials, etc.)
CREATE TABLE IF NOT EXISTS restaurant_settings (
  restaurant_id       UUID PRIMARY KEY,
  clover_merchant_id  TEXT,
  clover_api_key      TEXT,
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE restaurant_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "restaurant sees own settings" ON restaurant_settings
  FOR ALL USING (
    restaurant_id IN (
      SELECT restaurant_id FROM profiles WHERE id = auth.uid()
    )
  );

-- 4. Grant service role access for Clover sync API route
GRANT ALL ON pos_sales TO service_role;
GRANT ALL ON restaurant_settings TO service_role;
