-- ============================================================
-- Migration v2: Pembelian Mitra dipindah ke investor-dashboard
-- Jalankan di: Supabase Dashboard > SQL Editor (project purchase_order,
-- SAMA seperti migration_mitra_purchase.sql sebelumnya)
--
-- Konteks: mitra ternyata sudah punya akun sendiri di investor-dashboard
-- (dashboard-mitra.rotibakarngeunah.my.id, role 'investor', outlet-scoped
-- via investor_outlet_access). Login terpisah (mitra_accounts) yang dibuat
-- di migration sebelumnya jadi tidak perlu — dibongkar di sini. Backend
-- (create_mitra_purchase/update_mitra_purchase, sinkron stok POS) TETAP
-- dipakai apa adanya, hanya dipanggil server-to-server dari investor-dashboard
-- (bukan lewat JWT login mitra) — lihat server/middleware/dualActorAuth.js.
--
-- Data test (2 transaksi cancelled dari akun test_mitra_e2e/e2e_2) ikut
-- dibersihkan di sini karena mereferensikan mitra_accounts yang akan dihapus.
-- ============================================================

-- 1. Bersihkan data test yang mereferensikan mitra_accounts
DELETE FROM mitra_purchases WHERE mitra_account_id IS NOT NULL;

-- 2. Lepas kolom mitra_account_id, ganti dengan referensi opaque ke profil
--    investor-dashboard (project Supabase BERBEDA, jadi bukan FK sungguhan —
--    hanya disimpan sebagai teks untuk audit trail/telusur).
ALTER TABLE mitra_purchases DROP COLUMN IF EXISTS mitra_account_id;
ALTER TABLE mitra_purchases ADD COLUMN IF NOT EXISTS investor_profile_id TEXT;

CREATE INDEX IF NOT EXISTS idx_mitra_purchases_investor_profile ON mitra_purchases(investor_profile_id);

-- 3. Drop tabel akun mitra lama — tidak dipakai lagi
DROP TABLE IF EXISTS mitra_accounts CASCADE;

-- 4. Update create_mitra_purchase — p_mitra_account_id -> p_investor_profile_id (text, opsional)
DROP FUNCTION IF EXISTS public.create_mitra_purchase(uuid, uuid, date, text, text, text, text, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.create_mitra_purchase(
  p_outlet_id          uuid,
  p_investor_profile_id text,
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
    outlet_id, investor_profile_id, purchase_date, invoice_number, supplier_name, notes,
    grand_total, status, created_by_name, created_ip, created_user_agent
  ) VALUES (
    p_outlet_id, NULLIF(p_investor_profile_id, ''), p_purchase_date,
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

GRANT EXECUTE ON FUNCTION public.create_mitra_purchase(uuid, text, date, text, text, text, text, text, text, jsonb) TO authenticated, service_role;

SELECT 'Migration mitra_purchase v2 (investor-dashboard) selesai' AS result;
