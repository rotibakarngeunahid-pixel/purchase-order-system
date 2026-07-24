-- ============================================================
-- Migration: Mapping Supplier per Outlet + Bahan
-- Tujuan: memungkinkan 1 bahan dipesan dari supplier berbeda
-- tergantung outlet/cabang (mis. lebih dekat = lebih murah/cepat).
-- Jika tidak ada mapping, sistem tetap pakai supplier default bahan.
-- Jalankan di: Supabase Dashboard > SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS outlet_material_suppliers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id   UUID NOT NULL REFERENCES outlets(id),
  material_id UUID NOT NULL REFERENCES materials(id),
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (outlet_id, material_id)
);

ALTER TABLE outlet_material_suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON outlet_material_suppliers FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_oms_outlet_material ON outlet_material_suppliers(outlet_id, material_id);
CREATE INDEX IF NOT EXISTS idx_oms_active ON outlet_material_suppliers(is_active);
