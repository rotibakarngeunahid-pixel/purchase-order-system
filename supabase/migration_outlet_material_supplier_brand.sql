-- ============================================================
-- Migration: Merk per Konfigurasi Pembelian (Outlet + Bahan + Supplier)
--
-- Tujuan: bahan yang sama secara master bisa dijual dengan merk berbeda
-- oleh supplier berbeda (mis. Supplier A jual Mentega merk "Wisman",
-- Supplier B jual Mentega merk "Blue Band"). Merk ini perlu melekat pada
-- konfigurasi outlet+bahan+supplier, bukan pada bahan itu sendiri, karena
-- merk yang dibeli bergantung supplier mana yang dipilih untuk outlet itu.
--
-- NULL = ikut materials.brand (perilaku lama, tidak berubah untuk mapping
-- yang belum diisi merk-nya).
--
-- Jalankan di: Supabase Dashboard > SQL Editor
-- (independen dari migration_outlet_material_purchase_config.sql — aman
-- dijalankan baik sebelum maupun sesudahnya)
-- ============================================================

ALTER TABLE outlet_material_suppliers
  ADD COLUMN IF NOT EXISTS brand TEXT;

COMMENT ON COLUMN outlet_material_suppliers.brand IS
  'Merk yang dijual supplier ini untuk kombinasi outlet+bahan ini. NULL = ikut materials.brand.';
