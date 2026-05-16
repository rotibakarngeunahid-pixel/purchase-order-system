-- ============================================================
-- Migration: Adjustment Penerimaan Bahan
-- Tambah kolom source, adjustment_note, created_at
-- ke tabel purchase_order_items
-- Jalankan di: Supabase Dashboard > SQL Editor
-- ============================================================

ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'ordered',
  ADD COLUMN IF NOT EXISTS adjustment_note TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- Constraint: hanya nilai 'ordered' dan 'adjustment' yang valid
ALTER TABLE purchase_order_items
  ADD CONSTRAINT purchase_order_items_source_check
  CHECK (source IN ('ordered', 'adjustment'));

-- Index untuk query per PO + source
CREATE INDEX IF NOT EXISTS idx_poi_po_source
  ON purchase_order_items(po_id, source);
