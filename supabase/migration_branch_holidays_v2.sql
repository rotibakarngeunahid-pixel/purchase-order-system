-- ============================================================
-- Migration v2: Recurring Holiday Support
-- Tambah kolom recurrence_type & day_of_week ke branch_holidays
-- Jalankan di: Supabase Dashboard > SQL Editor
-- Prasyarat: migration_branch_holidays.sql sudah dijalankan
-- ============================================================

-- 1. Buat holiday_date bisa NULL (untuk entri mingguan yang tidak punya tanggal spesifik)
ALTER TABLE branch_holidays
  ALTER COLUMN holiday_date DROP NOT NULL;

-- 2. Tambah kolom recurrence_type dan day_of_week
ALTER TABLE branch_holidays
  ADD COLUMN IF NOT EXISTS recurrence_type TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS day_of_week     SMALLINT;

-- 3. Validasi day_of_week harus 0-6 (0=Minggu, 1=Senin, ..., 6=Sabtu) atau NULL
ALTER TABLE branch_holidays
  ADD CONSTRAINT chk_branch_holidays_day_of_week
    CHECK (day_of_week IS NULL OR (day_of_week BETWEEN 0 AND 6));

-- 4. Validasi recurrence_type
ALTER TABLE branch_holidays
  ADD CONSTRAINT chk_branch_holidays_recurrence_type
    CHECK (recurrence_type IN ('none', 'weekly'));

-- 5. Hapus constraint UNIQUE lama (outlet_id, holiday_date)
--    karena entri mingguan tidak punya holiday_date
ALTER TABLE branch_holidays
  DROP CONSTRAINT IF EXISTS branch_holidays_outlet_id_holiday_date_key;

-- 6. Partial unique index untuk tanggal tertentu (one-time, aktif)
--    Satu outlet tidak boleh punya dua entri aktif untuk tanggal yang sama
CREATE UNIQUE INDEX IF NOT EXISTS idx_bh_unique_onetime
  ON branch_holidays (outlet_id, holiday_date)
  WHERE recurrence_type = 'none' AND is_active = true AND holiday_date IS NOT NULL;

-- 7. Partial unique index untuk mingguan (weekly, aktif)
--    Satu outlet tidak boleh punya dua entri aktif untuk hari yang sama
CREATE UNIQUE INDEX IF NOT EXISTS idx_bh_unique_weekly
  ON branch_holidays (outlet_id, day_of_week)
  WHERE recurrence_type = 'weekly' AND is_active = true AND day_of_week IS NOT NULL;
