-- ============================================================
-- Roti Bakar Ngeunah - Seed Data
-- Jalankan SETELAH schema.sql di: Supabase Dashboard > SQL Editor
-- GANTI nomor WA '628xxxxxxxxxx' dengan nomor asli sebelum dijalankan
-- ============================================================

-- Outlets
INSERT INTO outlets (name, is_active) VALUES
  ('Buduk', true),
  ('Bunderan Dalung', true),
  ('Dalung Permai', true),
  ('Soputan', true),
  ('Pemogan', true)
ON CONFLICT DO NOTHING;

-- Suppliers (GANTI nomor WA sesuai data asli)
INSERT INTO suppliers (name, wa_number, is_active) VALUES
  ('UD Trisna', '628xxxxxxxxxx', true),
  ('Priangan', '628xxxxxxxxxx', true),
  ('Jelantik Plastik', '628xxxxxxxxxx', true),
  ('Dzahibil Paratha', '628xxxxxxxxxx', true),
  ('AIDA', '628xxxxxxxxxx', true),
  ('Milo', '628xxxxxxxxxx', true)
ON CONFLICT DO NOTHING;

-- Materials (menggunakan subquery untuk supplier_id)
INSERT INTO materials (code, name, supplier_id, package_qty, package_unit, purchase_unit, price_per_purchase_unit, is_active)
VALUES
  ('BHN01', 'Roti Tawar',            (SELECT id FROM suppliers WHERE name = 'Priangan' LIMIT 1),         1,   'Pcs',     'Pcs',     4500,  true),
  ('BHN02', 'Roti Canai',            (SELECT id FROM suppliers WHERE name = 'Dzahibil Paratha' LIMIT 1), 1,   'Bungkus', 'Bungkus', 22000, true),
  ('BHN03', 'Risol',                 (SELECT id FROM suppliers WHERE name = 'AIDA' LIMIT 1),             1,   'Bungkus', 'Bungkus', 14000, true),
  ('BHN04', 'Mentega',               (SELECT id FROM suppliers WHERE name = 'UD Trisna' LIMIT 1),        1,   'Kg',      'Kg',      21000, true),
  ('BHN05', 'Susu Kental Manis',     (SELECT id FROM suppliers WHERE name = 'UD Trisna' LIMIT 1),        490, 'Gr',      'Kaleng',  12500, true),
  ('BHN06', 'Keju Parut',            (SELECT id FROM suppliers WHERE name = 'UD Trisna' LIMIT 1),        250, 'Gr',      'Bungkus', 14000, true),
  ('BHN07', 'Messes Coklat',         (SELECT id FROM suppliers WHERE name = 'UD Trisna' LIMIT 1),        1,   'Kg',      'Kg',      25500, true),
  ('BHN08', 'Selai Strawberry',      (SELECT id FROM suppliers WHERE name = 'Priangan' LIMIT 1),         1,   'Kg',      'Kg',      15000, true),
  ('BHN09', 'Selai Blueberry',       (SELECT id FROM suppliers WHERE name = 'Priangan' LIMIT 1),         1,   'Kg',      'Kg',      15000, true),
  ('BHN10', 'Selai Nanas',           (SELECT id FROM suppliers WHERE name = 'Priangan' LIMIT 1),         1,   'Kg',      'Kg',      15000, true),
  ('BHN11', 'Glaze Tiramisu',        (SELECT id FROM suppliers WHERE name = 'UD Trisna' LIMIT 1),        500, 'Gr',      'Bungkus', 28000, true),
  ('BHN12', 'Milo',                  (SELECT id FROM suppliers WHERE name = 'Milo' LIMIT 1),             1,   'Renteng', 'Renteng', 20500, true),
  ('BHN13', 'Box',                   (SELECT id FROM suppliers WHERE name = 'Jelantik Plastik' LIMIT 1), 100, 'Pcs',     'Bungkus', 52000, true),
  ('BHN14', 'Plastik Kresek',        (SELECT id FROM suppliers WHERE name = 'UD Trisna' LIMIT 1),        1,   'Bungkus', 'Bungkus', 2300,  true),
  ('BHN15', 'Sarung Tangan Plastik', (SELECT id FROM suppliers WHERE name = 'UD Trisna' LIMIT 1),        1,   'Bungkus', 'Bungkus', 10000, true),
  ('BHN16', 'Isolasi Plastik',       (SELECT id FROM suppliers WHERE name = 'Jelantik Plastik' LIMIT 1), 1,   'Pcs',     'Pcs',     6000,  true)
ON CONFLICT (code) DO NOTHING;
