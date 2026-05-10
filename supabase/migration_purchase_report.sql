-- ============================================================
-- Migration: Purchase Report + Report Resets Tables
-- Jalankan di: Supabase Dashboard > SQL Editor
-- ============================================================

-- ============================================================
-- 11. PURCHASE REPORT — Catatan barang masuk per outlet
-- ============================================================
DROP TABLE IF EXISTS purchase_report CASCADE;

CREATE TABLE IF NOT EXISTS purchase_report (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id      UUID NOT NULL REFERENCES outlets(id),
  material_id    UUID NOT NULL REFERENCES materials(id),
  variant_id     UUID REFERENCES material_variants(id),
  supplier_id    UUID REFERENCES suppliers(id),
  qty            NUMERIC NOT NULL CHECK (qty > 0),
  unit           TEXT NOT NULL,
  price_per_unit NUMERIC NOT NULL DEFAULT 0,
  date           DATE NOT NULL DEFAULT CURRENT_DATE,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE purchase_report ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON purchase_report FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_purchase_report_date       ON purchase_report(date);
CREATE INDEX IF NOT EXISTS idx_purchase_report_outlet_id  ON purchase_report(outlet_id);

-- ============================================================
-- 12. REPORT RESETS — Audit log of report reset events
-- ============================================================
CREATE TABLE IF NOT EXISTS report_resets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reset_type  TEXT NOT NULL DEFAULT 'all',
  reset_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  reset_by    TEXT,
  notes       TEXT
);

ALTER TABLE report_resets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all" ON report_resets;
CREATE POLICY "auth_all" ON report_resets FOR ALL TO authenticated USING (true) WITH CHECK (true);
