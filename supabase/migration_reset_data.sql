-- ============================================================
-- Migration: Reset Data per Cabang & Jenis Data (Hard Delete + Transaksi)
-- Jalankan di: Supabase Dashboard > SQL Editor
--
-- Mengganti mekanisme lama fitur "Hapus Data" (hanya berdasarkan rentang
-- tanggal, tanpa transaksi database sungguhan) dengan:
--   - Filter cabang (outlet), bisa pilih satu/lebih atau kosong = semua cabang
--   - Filter jenis data, bisa kombinasi bebas
--   - Rentang tanggal OPSIONAL (kosong = semua waktu) sebagai filter tambahan
--   - Hard delete asli, dieksekusi dalam SATU transaksi Postgres — kalau ada
--     error di tengah proses, SELURUH perubahan di-rollback otomatis
--   - Tidak pernah menyentuh master data (Supplier, Bahan Baku, Outlet)
--
-- Jenis data (p_data_types), key yang valid:
--   'order'              -> order_sessions, order_request_items,
--                            order_outlet_holiday_metadata
--   'purchase_order'      -> purchase_orders, purchase_order_items,
--                            purchase_item_branch_distribution
--   'purchase_report'     -> purchase_report, report_resets
--   'price_log'           -> material_price_logs (global, TIDAK terikat cabang
--                            tertentu -- lihat catatan di bawah)
--   'distribution_photo'  -> distribution_photos (file di Supabase Storage
--                            dibersihkan terpisah dari Node, bukan di sini)
--   'branch_holiday'      -> branch_holidays (hanya yang one-time /
--                            recurrence_type = 'none'; hari libur mingguan
--                            yang berulang TIDAK ikut terhapus)
--   'finance_log'         -> finance_portal_access_logs
--
-- Catatan penting -- PO lintas-cabang:
--   Satu Purchase Order/item bisa didistribusikan ke banyak cabang sekaligus
--   (tabel purchase_item_branch_distribution). Saat cabang tertentu dipilih,
--   hanya baris distribusi ke cabang itu yang dihapus; item PO & PO induk
--   baru ikut terhapus kalau SELURUH cabang yang pernah menerima item itu
--   ada dalam pilihan (sehingga item benar-benar sudah tidak dipakai cabang
--   manapun). Ini mencegah data cabang lain ikut terhapus tanpa sengaja.
--
-- Catatan penting -- data yang tidak terikat cabang:
--   material_price_logs tidak punya kolom cabang sama sekali (harga bahan
--   bersifat global). Baris ini akan ikut terhapus setiap kali kategori
--   'price_log' dipilih, TERLEPAS dari cabang mana yang dipilih di filter.
--   report_resets juga tidak terikat cabang; baris ini hanya ikut terhapus
--   ketika filter cabang = "Semua Cabang" (tidak ada outlet_id spesifik
--   dipilih), supaya tidak salah menghapus log yang tidak bisa dipastikan
--   milik cabang mana.
-- ============================================================

-- ============================================================
-- 1. Fungsi inti -- benar-benar melakukan DELETE (dipakai bersama oleh
--    reset_data_preview dan reset_data_execute supaya logikanya identik).
-- ============================================================
CREATE OR REPLACE FUNCTION public._reset_data_apply(
  p_outlet_ids  uuid[],
  p_data_types  text[],
  p_date_from   date DEFAULT NULL,
  p_date_to     date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_all_outlets            boolean := (p_outlet_ids IS NULL OR array_length(p_outlet_ids, 1) IS NULL);
  v_result                 jsonb := '{}'::jsonb;
  v_count                  bigint;
  v_candidate_po_ids       uuid[];
  v_items_with_dist_before uuid[];
  v_outlet_names           text[];
  v_photo_files            jsonb;
  v_date_to_excl           timestamptz;
  v_valid_types            text[] := ARRAY['order', 'purchase_order', 'purchase_report',
                                            'price_log', 'distribution_photo',
                                            'branch_holiday', 'finance_log'];
  v_type                   text;
BEGIN
  IF p_data_types IS NULL OR array_length(p_data_types, 1) IS NULL THEN
    RAISE EXCEPTION 'Pilih minimal satu jenis data yang ingin dihapus' USING ERRCODE = 'RD400';
  END IF;

  FOREACH v_type IN ARRAY p_data_types LOOP
    IF NOT (v_type = ANY(v_valid_types)) THEN
      RAISE EXCEPTION 'Jenis data tidak dikenal: %', v_type USING ERRCODE = 'RD400';
    END IF;
  END LOOP;

  v_date_to_excl := CASE WHEN p_date_to IS NULL THEN NULL ELSE (p_date_to + INTERVAL '1 day') END;

  -- ── ORDER: permintaan bahan per cabang + metadata hari libur sesi ───────
  IF 'order' = ANY(p_data_types) THEN
    DELETE FROM order_request_items ori
    USING order_sessions os
    WHERE ori.session_id = os.id
      AND (p_date_from IS NULL OR os.order_date >= p_date_from)
      AND (p_date_to   IS NULL OR os.order_date <= p_date_to)
      AND (v_all_outlets OR ori.outlet_id = ANY(p_outlet_ids));
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result := v_result || jsonb_build_object('order_request_items', v_count);

    DELETE FROM order_outlet_holiday_metadata ohm
    USING order_sessions os
    WHERE ohm.session_id = os.id
      AND (p_date_from IS NULL OR os.order_date >= p_date_from)
      AND (p_date_to   IS NULL OR os.order_date <= p_date_to)
      AND (v_all_outlets OR ohm.outlet_id = ANY(p_outlet_ids));
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result := v_result || jsonb_build_object('order_outlet_holiday_metadata', v_count);
  END IF;

  -- ── PURCHASE_ORDER: distribusi cabang -> item -> PO (cascade jika orphan) ─
  IF 'purchase_order' = ANY(p_data_types) THEN
    SELECT array_agg(po.id) INTO v_candidate_po_ids
    FROM purchase_orders po
    JOIN order_sessions os ON os.id = po.session_id
    WHERE (p_date_from IS NULL OR os.order_date >= p_date_from)
      AND (p_date_to   IS NULL OR os.order_date <= p_date_to);

    IF v_candidate_po_ids IS NOT NULL THEN
      -- Snapshot item yang PUNYA baris distribusi SEBELUM dihapus -- dipakai
      -- untuk membedakan "item memang tidak pernah didistribusi per cabang"
      -- (jangan disentuh saat filter cabang spesifik) vs "item baru saja
      -- jadi orphan karena semua cabangnya terpilih" (boleh ikut terhapus).
      SELECT array_agg(DISTINCT poi.id) INTO v_items_with_dist_before
      FROM purchase_order_items poi
      JOIN purchase_item_branch_distribution pbd ON pbd.po_item_id = poi.id
      WHERE poi.po_id = ANY(v_candidate_po_ids);

      DELETE FROM purchase_item_branch_distribution pbd
      USING purchase_order_items poi
      WHERE pbd.po_item_id = poi.id
        AND poi.po_id = ANY(v_candidate_po_ids)
        AND (v_all_outlets OR pbd.outlet_id = ANY(p_outlet_ids));
      GET DIAGNOSTICS v_count = ROW_COUNT;
      v_result := v_result || jsonb_build_object('purchase_item_branch_distribution', v_count);

      IF v_all_outlets THEN
        -- Semua cabang: item apapun yang (sekarang) tidak lagi punya baris
        -- distribusi boleh dianggap selesai/orphan dan ikut dihapus.
        DELETE FROM purchase_order_items poi
        WHERE poi.po_id = ANY(v_candidate_po_ids)
          AND NOT EXISTS (SELECT 1 FROM purchase_item_branch_distribution d WHERE d.po_item_id = poi.id);
      ELSE
        -- Cabang spesifik: HANYA item yang tadinya punya distribusi dan kini
        -- benar-benar sudah nol (seluruh cabang pemakainya ada di pilihan).
        DELETE FROM purchase_order_items poi
        WHERE poi.po_id = ANY(v_candidate_po_ids)
          AND poi.id = ANY(COALESCE(v_items_with_dist_before, ARRAY[]::uuid[]))
          AND NOT EXISTS (SELECT 1 FROM purchase_item_branch_distribution d WHERE d.po_item_id = poi.id);
      END IF;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      v_result := v_result || jsonb_build_object('purchase_order_items', v_count);

      DELETE FROM purchase_orders po
      WHERE po.id = ANY(v_candidate_po_ids)
        AND NOT EXISTS (SELECT 1 FROM purchase_order_items i WHERE i.po_id = po.id);
      GET DIAGNOSTICS v_count = ROW_COUNT;
      v_result := v_result || jsonb_build_object('purchase_orders', v_count);
    ELSE
      v_result := v_result || jsonb_build_object(
        'purchase_item_branch_distribution', 0,
        'purchase_order_items', 0,
        'purchase_orders', 0
      );
    END IF;
  END IF;

  -- ── PURCHASE_REPORT: Laporan Barang Masuk + catatan reset laporan ──────
  IF 'purchase_report' = ANY(p_data_types) THEN
    DELETE FROM purchase_report pr
    WHERE (p_date_from IS NULL OR pr.date >= p_date_from)
      AND (p_date_to   IS NULL OR pr.date <= p_date_to)
      AND (v_all_outlets OR pr.outlet_id = ANY(p_outlet_ids));
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result := v_result || jsonb_build_object('purchase_report', v_count);

    IF v_all_outlets THEN
      DELETE FROM report_resets rr
      WHERE (p_date_from IS NULL OR rr.reset_at >= p_date_from)
        AND (v_date_to_excl IS NULL OR rr.reset_at < v_date_to_excl);
      GET DIAGNOSTICS v_count = ROW_COUNT;
    ELSE
      v_count := 0;
    END IF;
    v_result := v_result || jsonb_build_object('report_resets', v_count);
  END IF;

  -- ── PRICE_LOG: Log Harga Bahan (global, tidak terikat cabang) ───────────
  IF 'price_log' = ANY(p_data_types) THEN
    DELETE FROM material_price_logs mpl
    WHERE (p_date_from IS NULL OR mpl.created_at >= p_date_from)
      AND (v_date_to_excl IS NULL OR mpl.created_at < v_date_to_excl);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result := v_result || jsonb_build_object('material_price_logs', v_count);
  END IF;

  -- ── DISTRIBUTION_PHOTO: foto bukti distribusi (branch = nama outlet) ────
  IF 'distribution_photo' = ANY(p_data_types) THEN
    IF NOT v_all_outlets THEN
      SELECT array_agg(name) INTO v_outlet_names FROM outlets WHERE id = ANY(p_outlet_ids);
    END IF;

    SELECT COALESCE(jsonb_agg(photos), '[]'::jsonb) INTO v_photo_files
    FROM distribution_photos dp
    WHERE (p_date_from IS NULL OR dp.date >= p_date_from)
      AND (p_date_to   IS NULL OR dp.date <= p_date_to)
      AND (v_all_outlets OR dp.branch = ANY(v_outlet_names));

    DELETE FROM distribution_photos dp
    WHERE (p_date_from IS NULL OR dp.date >= p_date_from)
      AND (p_date_to   IS NULL OR dp.date <= p_date_to)
      AND (v_all_outlets OR dp.branch = ANY(v_outlet_names));
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result := v_result || jsonb_build_object(
      'distribution_photos', v_count,
      '_distribution_photo_files', v_photo_files
    );
  END IF;

  -- ── BRANCH_HOLIDAY: hari libur spesifik per cabang (one-time saja) ──────
  IF 'branch_holiday' = ANY(p_data_types) THEN
    DELETE FROM branch_holidays bh
    WHERE bh.recurrence_type = 'none'
      AND (p_date_from IS NULL OR bh.holiday_date >= p_date_from)
      AND (p_date_to   IS NULL OR bh.holiday_date <= p_date_to)
      AND (v_all_outlets OR bh.outlet_id = ANY(p_outlet_ids));
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result := v_result || jsonb_build_object('branch_holidays_onetime', v_count);
  END IF;

  -- ── FINANCE_LOG: log akses Portal Data Keuangan ─────────────────────────
  IF 'finance_log' = ANY(p_data_types) THEN
    DELETE FROM finance_portal_access_logs fl
    WHERE (p_date_from IS NULL OR fl.accessed_at >= p_date_from)
      AND (v_date_to_excl IS NULL OR fl.accessed_at < v_date_to_excl)
      AND (v_all_outlets OR fl.outlet_id = ANY(p_outlet_ids));
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result := v_result || jsonb_build_object('finance_portal_access_logs', v_count);
  END IF;

  -- ── ORDER lanjutan: bersihkan sesi order yang sudah jadi orphan ─────────
  -- Dijalankan TERAKHIR (setelah blok purchase_order) supaya sesi yang PO-nya
  -- baru saja habis di atas juga ikut diperiksa, tanpa peduli urutan kategori
  -- yang dikirim oleh pemanggil.
  IF 'order' = ANY(p_data_types) THEN
    DELETE FROM order_sessions os
    WHERE (p_date_from IS NULL OR os.order_date >= p_date_from)
      AND (p_date_to   IS NULL OR os.order_date <= p_date_to)
      AND NOT EXISTS (SELECT 1 FROM order_request_items x WHERE x.session_id = os.id)
      AND NOT EXISTS (SELECT 1 FROM purchase_orders x WHERE x.session_id = os.id);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result := v_result || jsonb_build_object('order_sessions', v_count);
  END IF;

  RETURN v_result;
END;
$$;

-- ============================================================
-- 2. Preview -- jalankan logika IDENTIK dengan eksekusi lalu ROLLBACK.
--    Karena memakai fungsi inti yang sama persis, angka preview dijamin
--    konsisten dengan angka yang benar-benar terhapus saat eksekusi.
-- ============================================================
CREATE OR REPLACE FUNCTION public.reset_data_preview(
  p_outlet_ids  uuid[],
  p_data_types  text[],
  p_date_from   date DEFAULT NULL,
  p_date_to     date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_result jsonb;
BEGIN
  BEGIN
    v_result := public._reset_data_apply(p_outlet_ids, p_data_types, p_date_from, p_date_to);
    RAISE EXCEPTION 'preview_rollback_sentinel' USING ERRCODE = 'RD999';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'RD999' THEN
      RETURN v_result;
    END IF;
    RAISE;
  END;
END;
$$;

-- ============================================================
-- 3. Execute -- benar-benar menghapus. Satu panggilan RPC = satu transaksi
--    Postgres/PostgREST: kalau _reset_data_apply melempar error di tengah
--    jalan, SELURUH DELETE di atasnya otomatis di-rollback oleh Postgres.
-- ============================================================
CREATE OR REPLACE FUNCTION public.reset_data_execute(
  p_outlet_ids  uuid[],
  p_data_types  text[],
  p_date_from   date DEFAULT NULL,
  p_date_to     date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN public._reset_data_apply(p_outlet_ids, p_data_types, p_date_from, p_date_to);
END;
$$;

GRANT EXECUTE ON FUNCTION public._reset_data_apply(uuid[], text[], date, date)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reset_data_preview(uuid[], text[], date, date)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reset_data_execute(uuid[], text[], date, date)  TO authenticated, service_role;
