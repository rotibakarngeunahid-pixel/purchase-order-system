-- ============================================================
-- Migration: Portal Data Keuangan
-- Jalankan di: Supabase Dashboard > SQL Editor
-- ============================================================

-- Konfigurasi akses Portal Data Keuangan.
-- API key disimpan agar admin bisa menyalin ulang kode akses dari UI.
CREATE TABLE IF NOT EXISTS finance_portal_config (
  id          TEXT PRIMARY KEY DEFAULT 'default',
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  api_key     TEXT NOT NULL DEFAULT ('rbn_fin_' || encode(gen_random_bytes(24), 'hex')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT finance_portal_config_singleton CHECK (id = 'default')
);

INSERT INTO finance_portal_config (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE finance_portal_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all" ON finance_portal_config;
CREATE POLICY "auth_all" ON finance_portal_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Log akses sederhana untuk admin.
CREATE TABLE IF NOT EXISTS finance_portal_access_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status      TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  message     TEXT,
  date_from   DATE,
  date_to     DATE,
  outlet_id   UUID REFERENCES outlets(id),
  outlet_name TEXT,
  requester_ip TEXT,
  user_agent   TEXT
);

ALTER TABLE finance_portal_access_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all" ON finance_portal_access_logs;
CREATE POLICY "auth_all" ON finance_portal_access_logs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_finance_portal_logs_accessed_at
  ON finance_portal_access_logs(accessed_at DESC);

CREATE INDEX IF NOT EXISTS idx_finance_portal_logs_period
  ON finance_portal_access_logs(date_from, date_to);
