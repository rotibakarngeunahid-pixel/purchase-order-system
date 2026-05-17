-- ============================================================
-- Migration: Hari Libur Cabang & Metadata Holiday Order
-- Jalankan di: Supabase Dashboard > SQL Editor
-- ============================================================

-- ============================================================
-- 1. BRANCH_HOLIDAYS — Kalender Hari Libur per Outlet
-- ============================================================
CREATE TABLE IF NOT EXISTS branch_holidays (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id    UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  holiday_date DATE NOT NULL,
  holiday_name TEXT,
  note         TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_by   UUID REFERENCES auth.users(id),
  updated_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (outlet_id, holiday_date)
);

ALTER TABLE branch_holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON branch_holidays FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Index untuk performa query holiday per outlet dan tanggal
CREATE INDEX IF NOT EXISTS idx_branch_holidays_outlet_id ON branch_holidays (outlet_id);
CREATE INDEX IF NOT EXISTS idx_branch_holidays_date ON branch_holidays (holiday_date);
CREATE INDEX IF NOT EXISTS idx_branch_holidays_outlet_date_active ON branch_holidays (outlet_id, holiday_date, is_active);

-- ============================================================
-- 2. ORDER_OUTLET_HOLIDAY_METADATA — Metadata Holiday per Outlet per Sesi Order
-- ============================================================
CREATE TABLE IF NOT EXISTS order_outlet_holiday_metadata (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID NOT NULL REFERENCES order_sessions(id) ON DELETE CASCADE,
  outlet_id             UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  holiday_detected      BOOLEAN NOT NULL DEFAULT false,
  override_holiday      BOOLEAN NOT NULL DEFAULT false,
  calculation_days      INTEGER NOT NULL DEFAULT 2,
  holiday_date_detected DATE,
  holiday_name_detected TEXT,
  holiday_id_detected   UUID REFERENCES branch_holidays(id),
  holiday_override_by   UUID REFERENCES auth.users(id),
  holiday_override_at   TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, outlet_id)
);

ALTER TABLE order_outlet_holiday_metadata ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON order_outlet_holiday_metadata FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_order_outlet_holiday_metadata_session ON order_outlet_holiday_metadata (session_id);
