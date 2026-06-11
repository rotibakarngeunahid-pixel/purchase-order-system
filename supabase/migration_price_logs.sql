-- ============================================================
-- Migration: Log Harga Bahan Baku (Auto Price Update + History)
-- Jalankan di: Supabase Dashboard > SQL Editor
--
-- Mencatat setiap perubahan harga bahan baku:
--   - po_receive : harga aktual saat Catat Penerimaan berbeda dari master
--   - manual     : harga diubah manual lewat Master Data
--   - initial    : harga awal saat bahan/merk baru dibuat
-- Harga master (materials / material_variants) ikut di-update
-- otomatis oleh server saat penerimaan dicatat.
-- ============================================================

CREATE TABLE IF NOT EXISTS material_price_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id   UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  variant_id    UUID REFERENCES material_variants(id) ON DELETE SET NULL,
  supplier_id   UUID REFERENCES suppliers(id),
  po_id         UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  -- Snapshot merk saat dicatat — varian bisa dihapus permanen,
  -- log harus tetap bisa menampilkan merk historis
  brand         TEXT,
  old_price     NUMERIC,            -- NULL = harga awal (bahan/merk baru)
  new_price     NUMERIC NOT NULL,
  -- Selisih harga; 0 untuk entri harga awal. Kolom generated agar
  -- filter naik/turun bisa langsung di query (change_amount > 0 / < 0).
  change_amount NUMERIC GENERATED ALWAYS AS (new_price - COALESCE(old_price, new_price)) STORED,
  source        TEXT NOT NULL DEFAULT 'po_receive',  -- po_receive | manual | initial
  note          TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE material_price_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON material_price_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Index untuk performa query log & analisa
CREATE INDEX IF NOT EXISTS idx_mpl_material_id ON material_price_logs(material_id);
CREATE INDEX IF NOT EXISTS idx_mpl_supplier_id ON material_price_logs(supplier_id);
CREATE INDEX IF NOT EXISTS idx_mpl_created_at  ON material_price_logs(created_at DESC);
