-- ============================================================
-- Migration: Hapus Paksa Outlet (Cascade Delete)
-- Jalankan di: Supabase Dashboard > SQL Editor
--
-- DELETE /api/outlets/:id (perilaku lama) menolak menghapus outlet yang
-- masih punya data terkait (order, PO, mapping supplier, dll) -- FK
-- constraint melempar error 23503. Itu perilaku aman untuk outlet yang
-- masih aktif dipakai, TAPI untuk outlet yang salah buat / percobaan /
-- sudah tutup permanen, admin butuh cara menghapusnya beserta seluruh
-- data terkait sekaligus.
--
-- Fungsi ini menghapus, dalam SATU transaksi (rollback total kalau error):
--   - Semua data yang sudah dicakup _reset_data_apply (lihat
--     migration_reset_data.sql): sesi order, PO + item + distribusi cabang,
--     laporan barang masuk, foto distribusi, hari libur one-time, log akses
--     portal keuangan -- KHUSUS outlet ini. material_price_logs (price_log)
--     SENGAJA tidak diikutkan karena tabel itu global (harga bahan lintas
--     cabang), tidak boleh ikut terhapus hanya karena satu outlet dihapus.
--   - outlet_material_suppliers: mapping supplier per outlet+bahan.
--   - mitra_purchases (+ mitra_purchase_items ikut lewat ON DELETE CASCADE
--     bawaan tabel itu): transaksi pembelian mitra outlet ini. Login mitra
--     sendiri TIDAK disimpan di database ini lagi (sudah dipindah ke
--     investor-dashboard eksternal sejak migration_mitra_purchase_v2 --
--     tabel mitra_accounts sudah di-drop), jadi tidak ada akun login yang
--     perlu ikut dibersihkan di sini.
--   - branch_holidays (semua, termasuk hari libur mingguan berulang) ikut
--     terhapus otomatis lewat ON DELETE CASCADE saat baris outlet dihapus
--     di langkah terakhir -- dihitung manual di sini supaya angkanya bisa
--     ditampilkan ke user sebelum konfirmasi.
--   - Baris outlet itu sendiri, di langkah PALING TERAKHIR.
--
-- Kalau ada tabel LAIN yang ternyata masih mereferensikan outlet ini dan
-- belum tercakup di atas, DELETE FROM outlets di langkah terakhir akan
-- gagal dengan FK violation -- seluruh transaksi otomatis rollback (aman,
-- tidak ada penghapusan parsial/data yatim).
-- ============================================================

CREATE OR REPLACE FUNCTION public._outlet_delete_cascade_apply(
  p_outlet_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_result      jsonb := '{}'::jsonb;
  v_count       bigint;
  v_outlet_name text;
BEGIN
  SELECT name INTO v_outlet_name FROM outlets WHERE id = p_outlet_id;
  IF v_outlet_name IS NULL THEN
    RAISE EXCEPTION 'Outlet tidak ditemukan' USING ERRCODE = 'OD404';
  END IF;

  -- Sama persis dengan yang dipakai fitur "Hapus Data", diarahkan ke SATU
  -- outlet ini saja, semua jenis data kecuali price_log (global).
  v_result := public._reset_data_apply(
    ARRAY[p_outlet_id],
    ARRAY['order', 'purchase_order', 'purchase_report', 'distribution_photo', 'branch_holiday', 'finance_log'],
    NULL, NULL
  );

  DELETE FROM outlet_material_suppliers WHERE outlet_id = p_outlet_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('outlet_material_suppliers', v_count);

  -- Login mitra TIDAK disimpan di database ini lagi (sudah dipindah ke
  -- investor-dashboard eksternal sejak migration_mitra_purchase_v2 -- tabel
  -- mitra_accounts sudah di-drop), jadi cukup hapus transaksinya saja.
  DELETE FROM mitra_purchases WHERE outlet_id = p_outlet_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('mitra_purchases', v_count);

  SELECT count(*) INTO v_count FROM branch_holidays WHERE outlet_id = p_outlet_id;
  v_result := v_result || jsonb_build_object('branch_holidays', v_count);

  DELETE FROM outlets WHERE id = p_outlet_id;

  v_result := v_result || jsonb_build_object('outlet_name', to_jsonb(v_outlet_name));
  RETURN v_result;
END;
$$;

-- Preview -- jalankan logika IDENTIK lalu ROLLBACK, supaya angka yang
-- ditampilkan ke user dijamin sama dengan yang benar-benar akan terhapus.
CREATE OR REPLACE FUNCTION public.outlet_delete_cascade_preview(
  p_outlet_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_result jsonb;
BEGIN
  BEGIN
    v_result := public._outlet_delete_cascade_apply(p_outlet_id);
    RAISE EXCEPTION 'outlet_delete_preview_rollback_sentinel' USING ERRCODE = 'RD999';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'RD999' THEN
      RETURN v_result;
    END IF;
    RAISE;
  END;
END;
$$;

-- Execute -- benar-benar menghapus.
CREATE OR REPLACE FUNCTION public.outlet_delete_cascade_execute(
  p_outlet_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN public._outlet_delete_cascade_apply(p_outlet_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public._outlet_delete_cascade_apply(uuid)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.outlet_delete_cascade_preview(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.outlet_delete_cascade_execute(uuid) TO authenticated, service_role;
