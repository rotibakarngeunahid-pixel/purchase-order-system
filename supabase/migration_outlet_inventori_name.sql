-- Tambahkan kolom inventori_cabang_name ke tabel outlets
-- Digunakan untuk memetakan nama outlet di PO system ke nama cabang di sistem inventori GAS
-- Contoh: outlet "Bunderan Dalung" -> inventori_cabang_name "Dalung 1"
ALTER TABLE outlets
  ADD COLUMN IF NOT EXISTS inventori_cabang_name TEXT;
