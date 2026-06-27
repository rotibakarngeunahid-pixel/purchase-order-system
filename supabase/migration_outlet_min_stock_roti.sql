-- Konsolidasi konfigurasi Roti Tawar Auto-Calc ke Master Data → Outlet.
-- Min stok roti per cabang sekarang menempel langsung di tabel outlets,
-- pemetaan cabang inventori memakai kolom outlets.inventori_cabang_name.
-- Tabel lama roti_branch_mapping & roti_min_stock tidak dipakai lagi
-- (dibiarkan ada agar aman; boleh di-drop manual setelah verifikasi).

ALTER TABLE outlets ADD COLUMN IF NOT EXISTS min_stock_roti integer NOT NULL DEFAULT 0;

-- Pindahkan nilai min stok yang sudah ada (cocokkan display_name lama ke nama
-- outlet). Dilewati otomatis bila tabel lama sudah tidak ada.
DO $$
BEGIN
  IF to_regclass('public.roti_min_stock') IS NOT NULL
     AND to_regclass('public.roti_branch_mapping') IS NOT NULL THEN
    UPDATE outlets o
    SET    min_stock_roti = COALESCE(rms.min_stock, 0)
    FROM   roti_min_stock rms
    JOIN   roti_branch_mapping rbm ON rbm.inv_cabang_id = rms.inv_cabang_id
    WHERE  lower(trim(o.name)) = lower(trim(rbm.display_name))
      AND  COALESCE(rms.min_stock, 0) > 0;
  END IF;
END $$;
