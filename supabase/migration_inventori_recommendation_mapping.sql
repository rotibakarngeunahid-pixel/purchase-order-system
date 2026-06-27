-- ============================================================
-- Mapping rekomendasi Inventori → Purchase Order (tahan beda nama)
-- Jalankan di: Supabase Dashboard > SQL Editor
-- Idempoten: aman dijalankan berulang.
--
-- Tujuan:
--   Rekomendasi order dari sistem Inventori membawa branch_id & material_id
--   milik Inventori. Agar cocok ke Outlet & Bahan di Purchase Order tanpa
--   bergantung pada kecocokan NAMA (yang rapuh: "Dalung 1" vs "Bunderan Dalung",
--   "Susu" vs "Susu Kental Manis"), simpan ID Inventori secara eksplisit.
--   Nama tetap dipertahankan sebagai label/fallback.
-- ============================================================

-- Outlet PO ← cabang Inventori (sumber kebenaran utama: ID; nama hanya fallback)
ALTER TABLE outlets
  ADD COLUMN IF NOT EXISTS inventori_branch_id TEXT;

COMMENT ON COLUMN outlets.inventori_branch_id IS
  'ID cabang di sistem Inventori (branch_id). Dipakai memetakan rekomendasi staff ke outlet ini. Sumber kebenaran utama; inventori_cabang_name hanya label/fallback.';

-- Bahan PO ← bahan Inventori (opsional override; default tetap cocok nama)
ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS inventory_material_id TEXT,
  ADD COLUMN IF NOT EXISTS inventory_material_name TEXT;

COMMENT ON COLUMN materials.inventory_material_id IS
  'ID bahan di sistem Inventori (material_id). Bila diisi, jadi acuan utama mapping rekomendasi; jika kosong, sistem mencocokkan berdasarkan nama.';
