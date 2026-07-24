-- ============================================================
-- Migration: Bonus Roti Tawar per Supplier
-- Tujuan: tidak semua supplier memberi bonus "kelipatan 20 dapat 1"
-- untuk roti tawar. Sebelumnya bonus ini otomatis berlaku untuk
-- supplier manapun yang menjual bahan bernama "roti tawar".
-- Default TRUE agar perilaku lama (bonus otomatis) tetap sama untuk
-- supplier yang sudah ada — admin tinggal matikan lewat toggle di
-- Master Data > Supplier untuk supplier yang tidak memberi bonus ini.
-- Jalankan di: Supabase Dashboard > SQL Editor
-- ============================================================

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS gives_roti_tawar_bonus BOOLEAN NOT NULL DEFAULT TRUE;
