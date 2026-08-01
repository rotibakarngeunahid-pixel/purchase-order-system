-- ============================================================
-- Migration: Snapshot Permintaan per Outlet pada Item PO
--
-- Bug: "Distribusi Bahan ke Cabang" di Catat Penerimaan bisa menampilkan
-- total terdistribusi jauh melebihi qty yang diterima. Root cause: auto-isi
-- distribusi mengambil SEMUA order_request_items satu sesi yang material_id-nya
-- sama, tanpa peduli supplier. Karena mapping outlet_material_suppliers bisa
-- membuat outlet berbeda untuk bahan yang SAMA dialihkan ke SUPPLIER berbeda
-- (dipecah jadi PO/baris terpisah oleh calculatePOs), auto-isi lama menjumlah
-- ulang permintaan outlet yang sebenarnya masuk PO/supplier LAIN — dobel hitung.
--
-- Migration ini menambah kolom snapshot outlet_requests (JSONB) berisi persis
-- outlet + qty yang dikelompokkan ke item PO ini SAAT PO dibuat (lihat
-- calculator.js groups[key].outletRequests) — jadi auto-isi distribusi tidak
-- perlu lagi menebak-nebak dari data sesi mentah yang tidak tahu soal routing
-- supplier.
--
-- Jalankan di: Supabase Dashboard > SQL Editor
-- ============================================================

ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS outlet_requests JSONB;

COMMENT ON COLUMN purchase_order_items.outlet_requests IS
  'Snapshot [{outlet_id, outlet_name, qty_requested, qty_requested_purchase_unit}] '
  'hasil pengelompokan calculatePOs saat PO dibuat — source of truth untuk auto-isi '
  'Distribusi Bahan ke Cabang di Catat Penerimaan (menghindari dobel hitung outlet '
  'yang bahannya sama tapi dipecah ke supplier lain lewat mapping). NULL = PO lama '
  'sebelum migration ini, fallback ke data sesi mentah (bisa dobel hitung).';
