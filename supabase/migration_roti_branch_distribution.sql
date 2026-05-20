-- Migration: Distribusi penerimaan roti per cabang
-- Jalankan di Supabase Dashboard > SQL Editor

-- Tabel ini menyimpan berapa pcs roti yang dikirim ke setiap cabang
-- saat mencatat penerimaan barang dari supplier.
-- Contoh: PO item roti received 136 pcs → Buduk 20, Dalung 25, dst.

CREATE TABLE IF NOT EXISTS purchase_item_branch_distribution (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  po_item_id  UUID NOT NULL REFERENCES purchase_order_items(id) ON DELETE CASCADE,
  outlet_id   UUID NOT NULL REFERENCES outlets(id),
  qty         NUMERIC NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(po_item_id, outlet_id)
);

ALTER TABLE purchase_item_branch_distribution ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON purchase_item_branch_distribution
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
