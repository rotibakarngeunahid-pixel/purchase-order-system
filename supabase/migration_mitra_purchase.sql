-- ============================================================
-- Migration: Pembelian Bahan Baku oleh Mitra
-- Jalankan di: Supabase Dashboard > SQL Editor
--
-- Menambahkan:
--   - mitra_accounts        : login per-outlet untuk mitra/franchise
--   - mitra_purchases       : header transaksi pembelian bahan baku mitra
--   - mitra_purchase_items  : item per transaksi
--   - create_mitra_purchase(): insert header+items atomik (dipanggil dari
--     server setelah validasi request, sebelum sinkron stok POS)
--   - update_mitra_purchase(): edit header + item (admin only) atomik.
--     Scope sengaja dibatasi: item existing hanya bisa diubah nilainya
--     (qty/harga/merk/satuan/catatan) atau ditambah item baru — TIDAK ada
--     penghapusan item lewat edit (kalau perlu batal total, pakai endpoint
--     cancel yang me-rollback seluruh stok transaksi).
-- ============================================================

-- ============================================================
-- 1. MITRA_ACCOUNTS — satu akun = satu outlet
-- ============================================================
CREATE TABLE IF NOT EXISTS mitra_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id     UUID NOT NULL REFERENCES outlets(id),
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE mitra_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON mitra_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_mitra_accounts_outlet ON mitra_accounts(outlet_id);

-- ============================================================
-- 2. MITRA_PURCHASES — header transaksi
-- ============================================================
CREATE TABLE IF NOT EXISTS mitra_purchases (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id          UUID NOT NULL REFERENCES outlets(id),
  mitra_account_id   UUID NOT NULL REFERENCES mitra_accounts(id),
  purchase_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  invoice_number     TEXT,
  supplier_name      TEXT,
  notes              TEXT,
  grand_total        NUMERIC NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded', 'cancelled')),

  -- Status sinkron ke stok POS (diisi oleh server setelah panggil RPC POS)
  sync_status        TEXT,
  sync_message       TEXT,
  synced_at          TIMESTAMPTZ,

  -- Audit trail
  created_by_name       TEXT NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_ip             TEXT,
  created_user_agent     TEXT,
  updated_by_name        TEXT,
  updated_at             TIMESTAMPTZ,
  updated_ip             TEXT,
  updated_user_agent     TEXT,
  cancelled_at           TIMESTAMPTZ,
  cancelled_by_name      TEXT,
  cancel_reason          TEXT
);

ALTER TABLE mitra_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON mitra_purchases FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_mitra_purchases_outlet_date ON mitra_purchases(outlet_id, purchase_date);
CREATE INDEX IF NOT EXISTS idx_mitra_purchases_mitra_account ON mitra_purchases(mitra_account_id);
CREATE INDEX IF NOT EXISTS idx_mitra_purchases_date ON mitra_purchases(purchase_date);

-- ============================================================
-- 3. MITRA_PURCHASE_ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS mitra_purchase_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id  UUID NOT NULL REFERENCES mitra_purchases(id) ON DELETE CASCADE,
  material_id  UUID NOT NULL REFERENCES materials(id),
  brand        TEXT,
  unit         TEXT NOT NULL,
  qty          NUMERIC NOT NULL CHECK (qty > 0),
  unit_price   NUMERIC NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  total_price  NUMERIC GENERATED ALWAYS AS (qty * unit_price) STORED,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE mitra_purchase_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON mitra_purchase_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_mitra_purchase_items_purchase ON mitra_purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_mitra_purchase_items_material ON mitra_purchase_items(material_id);

-- ============================================================
-- 4. create_mitra_purchase — insert header+items dalam satu transaksi.
--    Validasi ulang di server (Postgres) supaya tidak bergantung 100% pada
--    validasi client: qty>0, harga>=0, bahan wajib, minimal 1 item.
--    grand_total DIHITUNG DI SINI, tidak dipercaya dari payload.
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_mitra_purchase(
  p_outlet_id          uuid,
  p_mitra_account_id   uuid,
  p_purchase_date      date,
  p_invoice_number     text,
  p_supplier_name      text,
  p_notes              text,
  p_created_by_name    text,
  p_created_ip         text,
  p_created_user_agent text,
  p_items              jsonb
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_purchase_id UUID;
  v_grand_total NUMERIC := 0;
  v_item        JSONB;
  v_qty         NUMERIC;
  v_price       NUMERIC;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Minimal satu item wajib diisi' USING ERRCODE = 'MP400';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF (v_item->>'material_id') IS NULL OR (v_item->>'material_id') = '' THEN
      RAISE EXCEPTION 'Setiap item wajib memilih bahan baku' USING ERRCODE = 'MP400';
    END IF;
    v_qty   := COALESCE((v_item->>'qty')::numeric, 0);
    v_price := COALESCE((v_item->>'unit_price')::numeric, 0);
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Kuantitas harus lebih dari 0' USING ERRCODE = 'MP400';
    END IF;
    IF v_price < 0 THEN
      RAISE EXCEPTION 'Harga satuan tidak boleh negatif' USING ERRCODE = 'MP400';
    END IF;
    v_grand_total := v_grand_total + (v_qty * v_price);
  END LOOP;

  INSERT INTO mitra_purchases (
    outlet_id, mitra_account_id, purchase_date, invoice_number, supplier_name, notes,
    grand_total, status, created_by_name, created_ip, created_user_agent
  ) VALUES (
    p_outlet_id, p_mitra_account_id, p_purchase_date,
    NULLIF(p_invoice_number, ''), NULLIF(p_supplier_name, ''), NULLIF(p_notes, ''),
    v_grand_total, 'recorded', p_created_by_name, p_created_ip, p_created_user_agent
  ) RETURNING id INTO v_purchase_id;

  INSERT INTO mitra_purchase_items (purchase_id, material_id, brand, unit, qty, unit_price, notes)
  SELECT
    v_purchase_id,
    (item->>'material_id')::uuid,
    NULLIF(item->>'brand', ''),
    item->>'unit',
    (item->>'qty')::numeric,
    COALESCE((item->>'unit_price')::numeric, 0),
    NULLIF(item->>'notes', '')
  FROM jsonb_array_elements(p_items) AS item;

  RETURN jsonb_build_object('id', v_purchase_id, 'grand_total', v_grand_total);
END;
$$;

-- ============================================================
-- 5. update_mitra_purchase — admin only (dipanggil dari route yang sudah
--    dijaga authMiddleware admin). Item dengan "id" = update di tempat
--    (menjaga po_item_id stabil supaya sinkron delta ke POS tetap benar);
--    item tanpa "id" = insert baru. Tidak ada penghapusan item di sini.
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_mitra_purchase(
  p_id                  uuid,
  p_invoice_number      text,
  p_supplier_name       text,
  p_notes               text,
  p_updated_by_name     text,
  p_updated_ip          text,
  p_updated_user_agent  text,
  p_items               jsonb
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_grand_total NUMERIC := 0;
  v_item        JSONB;
  v_qty         NUMERIC;
  v_price       NUMERIC;
  v_item_id     UUID;
  v_status      TEXT;
BEGIN
  SELECT status INTO v_status FROM mitra_purchases WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaksi tidak ditemukan' USING ERRCODE = 'MP404';
  END IF;
  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'Transaksi yang sudah dibatalkan tidak bisa diedit' USING ERRCODE = 'MP409';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Minimal satu item wajib diisi' USING ERRCODE = 'MP400';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF (v_item->>'material_id') IS NULL OR (v_item->>'material_id') = '' THEN
      RAISE EXCEPTION 'Setiap item wajib memilih bahan baku' USING ERRCODE = 'MP400';
    END IF;
    v_qty   := COALESCE((v_item->>'qty')::numeric, 0);
    v_price := COALESCE((v_item->>'unit_price')::numeric, 0);
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Kuantitas harus lebih dari 0' USING ERRCODE = 'MP400';
    END IF;
    IF v_price < 0 THEN
      RAISE EXCEPTION 'Harga satuan tidak boleh negatif' USING ERRCODE = 'MP400';
    END IF;
    v_grand_total := v_grand_total + (v_qty * v_price);

    v_item_id := NULLIF(v_item->>'id', '')::uuid;
    IF v_item_id IS NOT NULL THEN
      UPDATE mitra_purchase_items SET
        material_id = (v_item->>'material_id')::uuid,
        brand       = NULLIF(v_item->>'brand', ''),
        unit        = v_item->>'unit',
        qty         = v_qty,
        unit_price  = v_price,
        notes       = NULLIF(v_item->>'notes', '')
      WHERE id = v_item_id AND purchase_id = p_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Item % bukan bagian dari transaksi ini', v_item_id USING ERRCODE = 'MP400';
      END IF;
    ELSE
      INSERT INTO mitra_purchase_items (purchase_id, material_id, brand, unit, qty, unit_price, notes)
      VALUES (
        p_id, (v_item->>'material_id')::uuid, NULLIF(v_item->>'brand', ''), v_item->>'unit',
        v_qty, v_price, NULLIF(v_item->>'notes', '')
      );
    END IF;
  END LOOP;

  UPDATE mitra_purchases SET
    invoice_number     = NULLIF(p_invoice_number, ''),
    supplier_name       = NULLIF(p_supplier_name, ''),
    notes               = NULLIF(p_notes, ''),
    grand_total         = v_grand_total,
    updated_by_name     = p_updated_by_name,
    updated_at          = now(),
    updated_ip          = p_updated_ip,
    updated_user_agent  = p_updated_user_agent
  WHERE id = p_id;

  RETURN jsonb_build_object('id', p_id, 'grand_total', v_grand_total);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_mitra_purchase(uuid, uuid, date, text, text, text, text, text, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_mitra_purchase(uuid, text, text, text, text, text, text, jsonb) TO authenticated, service_role;

SELECT 'Migration mitra_purchase selesai' AS result;
