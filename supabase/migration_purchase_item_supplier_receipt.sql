-- ============================================================
-- Migration: Supplier Aktual per Item Penerimaan
-- Jalankan di: Supabase Dashboard > SQL Editor
-- ============================================================

ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id);

CREATE INDEX IF NOT EXISTS idx_poi_supplier_id ON purchase_order_items(supplier_id);
