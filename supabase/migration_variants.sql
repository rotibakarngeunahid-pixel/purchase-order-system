-- ============================================================
-- Migration: Material Variants (Multi-merk per Bahan)
-- Jalankan di: Supabase Dashboard > SQL Editor
-- ============================================================

-- Tabel varian merk per bahan baku
CREATE TABLE IF NOT EXISTS material_variants (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id             UUID REFERENCES materials(id) ON DELETE CASCADE,
  brand                   TEXT NOT NULL,
  supplier_id             UUID REFERENCES suppliers(id),
  price_per_purchase_unit NUMERIC DEFAULT 0,
  is_active               BOOLEAN DEFAULT true,
  created_at              TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE material_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON material_variants FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tambah kolom variant_id ke purchase_order_items (nullable)
ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES material_variants(id);

-- Index untuk performa query
CREATE INDEX IF NOT EXISTS idx_material_variants_material_id ON material_variants(material_id);
CREATE INDEX IF NOT EXISTS idx_poi_variant_id ON purchase_order_items(variant_id);
