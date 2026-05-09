-- ============================================================
-- Roti Bakar Ngeunah - Database Schema
-- Jalankan di: Supabase Dashboard > SQL Editor
-- ============================================================

-- ============================================================
-- 1. SUPPLIERS
-- ============================================================
CREATE TABLE IF NOT EXISTS suppliers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  wa_number  TEXT NOT NULL,
  is_active  BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON suppliers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 2. MATERIALS
-- ============================================================
CREATE TABLE IF NOT EXISTS materials (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                    TEXT UNIQUE NOT NULL,
  name                    TEXT NOT NULL,
  brand                   TEXT,
  supplier_id             UUID REFERENCES suppliers(id),
  package_qty             NUMERIC NOT NULL DEFAULT 1,
  package_unit            TEXT NOT NULL DEFAULT 'Pcs',
  purchase_unit           TEXT NOT NULL DEFAULT 'Pcs',
  price_per_purchase_unit NUMERIC DEFAULT 0,
  is_active               BOOLEAN DEFAULT true,
  created_at              TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON materials FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 3. OUTLETS
-- ============================================================
CREATE TABLE IF NOT EXISTS outlets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  is_active  BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE outlets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON outlets FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 4. ORDER SESSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS order_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status     TEXT DEFAULT 'draft',  -- draft | sent | completed
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  sent_at    TIMESTAMPTZ
);

ALTER TABLE order_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON order_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 5. ORDER REQUEST ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS order_request_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID REFERENCES order_sessions(id) ON DELETE CASCADE,
  outlet_id   UUID REFERENCES outlets(id),
  material_id UUID REFERENCES materials(id),
  qty         NUMERIC NOT NULL DEFAULT 0,
  UNIQUE(session_id, outlet_id, material_id)
);

ALTER TABLE order_request_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON order_request_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 6. PURCHASE ORDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID REFERENCES order_sessions(id),
  supplier_id     UUID REFERENCES suppliers(id),
  status          TEXT DEFAULT 'pending',  -- pending | confirmed | received
  wa_sent_at      TIMESTAMPTZ,
  total_estimated NUMERIC,
  total_actual    NUMERIC,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON purchase_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 7. PURCHASE ORDER ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id           UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
  material_id     UUID REFERENCES materials(id),
  qty_ordered     NUMERIC NOT NULL,
  qty_received    NUMERIC,
  price_actual    NUMERIC,
  subtotal_actual NUMERIC GENERATED ALWAYS AS (qty_received * price_actual) STORED
);

ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON purchase_order_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 8. APP SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON app_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Default settings
INSERT INTO app_settings (key, value) VALUES
  ('business_name', 'Roti Bakar Ngeunah'),
  ('admin_email', ''),
  ('smtp_host', ''),
  ('smtp_port', '587'),
  ('smtp_user', ''),
  ('smtp_pass', ''),
  ('smtp_from', ''),
  ('wa_greeting_text', 'Mohon konfirmasi ketersediaan. Terima kasih 🙏')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 9. ROTI TAWAR AUTO-CALC — Branch Mapping
-- ============================================================
CREATE TABLE IF NOT EXISTS roti_branch_mapping (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inv_cabang_id TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE roti_branch_mapping ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON roti_branch_mapping FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 10. ROTI TAWAR AUTO-CALC — Min Stock per Branch
-- ============================================================
CREATE TABLE IF NOT EXISTS roti_min_stock (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inv_cabang_id TEXT NOT NULL UNIQUE REFERENCES roti_branch_mapping(inv_cabang_id),
  min_stock     INTEGER NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE roti_min_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON roti_min_stock FOR ALL TO authenticated USING (true) WITH CHECK (true);
