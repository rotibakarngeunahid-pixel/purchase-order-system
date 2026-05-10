-- ============================================================
-- Migration: Purchase Report + Report Resets Tables
-- Jalankan di: Supabase Dashboard > SQL Editor
-- ============================================================

-- ============================================================
-- 11. PURCHASE REPORT — Manual incoming stock log
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_report (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name     TEXT NOT NULL,
  qty           NUMERIC NOT NULL CHECK (qty > 0),
  unit          TEXT NOT NULL,
  date          DATE NOT NULL DEFAULT CURRENT_DATE,
  supplier_name TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE purchase_report ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON purchase_report FOR ALL TO authenticated USING (true) WITH CHECK (true);

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
CREATE POLICY "auth_all" ON report_resets FOR ALL TO authenticated USING (true) WITH CHECK (true);
