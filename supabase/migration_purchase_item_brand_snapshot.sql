-- ============================================================
-- Migration: Snapshot Merk (Brand) pada Item PO
--
-- Bug: Catat Penerimaan menampilkan merk/supplier/harga dari master bahan
-- (materials.*), bukan dari mapping aktif outlet_material_suppliers, karena
-- purchase_order_items tidak pernah menyimpan merk hasil mapping saat PO
-- dibuat — hanya purchase_unit/package_qty/package_unit/price_estimated yang
-- di-snapshot (lihat migration_outlet_material_purchase_config.sql).
--
-- Migration ini melengkapi snapshot itu dengan kolom brand, mengikuti pola
-- yang sama: NULL = PO lama sebelum migration ini, fallback ke materials.brand.
--
-- Jalankan di: Supabase Dashboard > SQL Editor
-- ============================================================

ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS brand TEXT;

COMMENT ON COLUMN purchase_order_items.brand IS
  'Snapshot merk (outlet_material_suppliers.brand jika mapping aktif ada, '
  'kalau tidak materials.brand) pada saat PO dibuat. NULL = PO lama sebelum '
  'migration ini, fallback ke materials.brand.';
