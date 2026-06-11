-- ============================================================
-- Foto bukti distribusi: maksimal 1 record per cabang per hari
-- Jalankan di: Supabase Dashboard > SQL Editor
-- (setelah migration_distribution_photos.sql)
-- ============================================================

-- 1. Gabungkan foto dari record duplikat ke record paling awal
--    agar tidak ada foto yang hilang dari arsip admin
WITH ranked AS (
  SELECT id, branch, date,
         ROW_NUMBER() OVER (PARTITION BY branch, date ORDER BY uploaded_at, id) AS rn
  FROM distribution_photos
),
merged AS (
  SELECT r.id AS keep_id,
         (
           SELECT jsonb_agg(elem ORDER BY dp2.uploaded_at, dp2.id)
           FROM distribution_photos dp2,
                jsonb_array_elements(dp2.photos) AS elem
           WHERE dp2.branch = (SELECT branch FROM distribution_photos WHERE id = r.id)
             AND dp2.date   = (SELECT date   FROM distribution_photos WHERE id = r.id)
         ) AS all_photos
  FROM ranked r
  WHERE r.rn = 1
)
UPDATE distribution_photos dp
SET photos = COALESCE(m.all_photos, dp.photos)
FROM merged m
WHERE dp.id = m.keep_id;

-- 2. Hapus record duplikat (sisakan yang paling awal)
DELETE FROM distribution_photos a
USING distribution_photos b
WHERE a.branch = b.branch
  AND a.date = b.date
  AND (a.uploaded_at, a.id) > (b.uploaded_at, b.id);

-- 3. Kunci di level database: insert kedua untuk (branch, date) yang sama
--    akan gagal dengan error 23505 (ditangani server sebagai "sudah dikirim")
CREATE UNIQUE INDEX IF NOT EXISTS uq_distribution_photos_branch_date
  ON distribution_photos (branch, date);
