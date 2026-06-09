-- ============================================================
-- Distribution Proof Photos
-- Jalankan di: Supabase Dashboard > SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS distribution_photos (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch                  TEXT NOT NULL,
  date                    DATE NOT NULL,
  uploaded_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  photos                  JSONB NOT NULL DEFAULT '[]',
  distribution_session_id UUID REFERENCES order_sessions(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE distribution_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON distribution_photos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Index for common query patterns
CREATE INDEX IF NOT EXISTS idx_distribution_photos_branch_date ON distribution_photos (branch, date);
CREATE INDEX IF NOT EXISTS idx_distribution_photos_date ON distribution_photos (date DESC);
