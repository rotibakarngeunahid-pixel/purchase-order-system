-- ============================================================
-- Migration: Konfigurasi Pembelian per Outlet + Bahan + Supplier
--
-- Tujuan: satu bahan tetap punya satu identitas master (materials),
-- tetapi ATURAN PEMBELIANNYA bisa berbeda per outlet karena supplier
-- tiap cabang berbeda: satuan beli, isi kemasan (faktor konversi),
-- harga beli, minimum pembelian, dan kelipatan pembelian.
--
-- Tabel outlet_material_suppliers sebelumnya hanya mengalihkan
-- supplier_id per (outlet, bahan). Migration ini memperluasnya menjadi
-- konfigurasi pembelian penuh:
--
--   Outlet → Bahan → Supplier → Satuan Beli / Min Order → Harga Beli
--
-- SEMUA kolom baru nullable atau ber-default netral, sehingga baris
-- mapping lama dan bahan tanpa mapping tetap berperilaku persis seperti
-- sebelumnya (NULL = ikut master bahan, min 1, kelipatan 1).
--
-- Jalankan di: Supabase Dashboard > SQL Editor
-- ============================================================

-- ── 1. Kolom konfigurasi pembelian ──────────────────────────────────────────
-- NULL pada purchase_unit / package_qty / package_unit / price berarti
-- "ikut master bahan" (materials.*), bukan "kosong".
ALTER TABLE outlet_material_suppliers
  ADD COLUMN IF NOT EXISTS purchase_unit           TEXT,
  ADD COLUMN IF NOT EXISTS package_qty             NUMERIC,
  ADD COLUMN IF NOT EXISTS package_unit            TEXT,
  ADD COLUMN IF NOT EXISTS price_per_purchase_unit NUMERIC,
  ADD COLUMN IF NOT EXISTS min_order_qty           NUMERIC NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS order_multiple          NUMERIC NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS request_basis           TEXT NOT NULL DEFAULT 'purchase_unit',
  ADD COLUMN IF NOT EXISTS notes                   TEXT,
  ADD COLUMN IF NOT EXISTS updated_at              TIMESTAMPTZ DEFAULT NOW();

COMMENT ON COLUMN outlet_material_suppliers.purchase_unit IS
  'Satuan yang dipesan ke supplier (Pack/Dus/Kg). NULL = ikut materials.purchase_unit.';
COMMENT ON COLUMN outlet_material_suppliers.package_qty IS
  'Faktor konversi: 1 satuan beli = package_qty satuan inventory. NULL = ikut materials.package_qty.';
COMMENT ON COLUMN outlet_material_suppliers.package_unit IS
  'Satuan inventory/base (Gram/Ml/Pcs). NULL = ikut materials.package_unit.';
COMMENT ON COLUMN outlet_material_suppliers.price_per_purchase_unit IS
  'Harga per satuan beli di supplier ini untuk outlet ini. NULL = ikut harga master bahan.';
COMMENT ON COLUMN outlet_material_suppliers.min_order_qty IS
  'Minimum pembelian dalam SATUAN BELI (mis. 1 pack, 2 dus). Default 1.';
COMMENT ON COLUMN outlet_material_suppliers.order_multiple IS
  'Kelipatan pembelian yang valid dalam SATUAN BELI. Default 1.';
COMMENT ON COLUMN outlet_material_suppliers.request_basis IS
  'Cara membaca qty input Order Entry: purchase_unit (default, qty = jumlah satuan beli) '
  'atau base_unit (qty = kebutuhan dalam satuan inventory, dikonversi via package_qty).';

-- ── 2. Validasi nilai konfigurasi ───────────────────────────────────────────
-- ADD CONSTRAINT tidak punya IF NOT EXISTS di PostgreSQL — bungkus DO block
-- agar migration aman dijalankan berulang kali.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oms_package_qty_positive') THEN
    ALTER TABLE outlet_material_suppliers
      ADD CONSTRAINT oms_package_qty_positive
      CHECK (package_qty IS NULL OR package_qty > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oms_price_non_negative') THEN
    ALTER TABLE outlet_material_suppliers
      ADD CONSTRAINT oms_price_non_negative
      CHECK (price_per_purchase_unit IS NULL OR price_per_purchase_unit >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oms_min_order_qty_positive') THEN
    ALTER TABLE outlet_material_suppliers
      ADD CONSTRAINT oms_min_order_qty_positive
      CHECK (min_order_qty > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oms_order_multiple_positive') THEN
    ALTER TABLE outlet_material_suppliers
      ADD CONSTRAINT oms_order_multiple_positive
      CHECK (order_multiple > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oms_request_basis_valid') THEN
    ALTER TABLE outlet_material_suppliers
      ADD CONSTRAINT oms_request_basis_valid
      CHECK (request_basis IN ('purchase_unit', 'base_unit'));
  END IF;
END $$;

-- ── 3. Backfill baris mapping lama ──────────────────────────────────────────
-- Baris yang dibuat sebelum migration ini sudah otomatis mendapat default
-- (min 1 / kelipatan 1 / basis purchase_unit) dari ALTER TABLE di atas.
-- Baris NULL akibat impor manual tetap diamankan di sini.
UPDATE outlet_material_suppliers
   SET min_order_qty  = COALESCE(min_order_qty, 1),
       order_multiple = COALESCE(order_multiple, 1),
       request_basis  = COALESCE(request_basis, 'purchase_unit')
 WHERE min_order_qty IS NULL
    OR order_multiple IS NULL
    OR request_basis IS NULL;

-- ── 4. Snapshot konfigurasi pada item PO ────────────────────────────────────
-- PO harus tetap benar walau konfigurasi supplier diubah/dihapus setelahnya,
-- dan sinkronisasi stok POS harus memakai faktor konversi yang dipakai saat
-- pemesanan — bukan faktor konversi master bahan yang berlaku sekarang.
-- NULL = baris lama → fallback ke materials.* (perilaku lama).
ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS purchase_unit   TEXT,
  ADD COLUMN IF NOT EXISTS package_qty     NUMERIC,
  ADD COLUMN IF NOT EXISTS package_unit    TEXT,
  ADD COLUMN IF NOT EXISTS price_estimated NUMERIC;

COMMENT ON COLUMN purchase_order_items.package_qty IS
  'Snapshot faktor konversi (1 satuan beli = package_qty satuan inventory) saat PO dibuat. '
  'NULL = pakai materials.package_qty (PO lama).';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'poi_package_qty_positive') THEN
    ALTER TABLE purchase_order_items
      ADD CONSTRAINT poi_package_qty_positive
      CHECK (package_qty IS NULL OR package_qty > 0);
  END IF;
END $$;

-- ── 5. Index ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_oms_material ON outlet_material_suppliers(material_id);
CREATE INDEX IF NOT EXISTS idx_oms_supplier ON outlet_material_suppliers(supplier_id);
