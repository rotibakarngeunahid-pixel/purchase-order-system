const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const {
  REQUEST_BASIS_VALUES,
  calculatePurchaseSuggestion,
  resolvePurchaseConfig,
} = require('../services/purchaseConfig');

const SELECT_WITH_JOINS = `
  *,
  outlet:outlets(id, name),
  material:materials(id, code, name, purchase_unit, package_qty, package_unit, price_per_purchase_unit),
  supplier:suppliers(id, name, wa_number)
`;

const CONFIG_FIELDS = [
  'purchase_unit',
  'package_qty',
  'package_unit',
  'price_per_purchase_unit',
  'min_order_qty',
  'order_multiple',
  'request_basis',
  'notes',
];

// Validasi field konfigurasi pembelian. Semua opsional — kolom yang tidak
// dikirim / kosong berarti "ikut master bahan" (lihat purchaseConfig.js).
// Melempar pesan bila salah satu field yang DIISI tidak valid.
function validateConfigPayload(body) {
  const errors = [];
  const payload = {};

  if (body.purchase_unit !== undefined) {
    const value = String(body.purchase_unit || '').trim();
    payload.purchase_unit = value === '' ? null : value;
  }

  if (body.package_qty !== undefined) {
    if (body.package_qty === null || body.package_qty === '') {
      payload.package_qty = null;
    } else {
      const num = Number(body.package_qty);
      if (!Number.isFinite(num) || num <= 0) {
        errors.push('Isi kemasan (package_qty) harus angka lebih dari 0');
      } else {
        payload.package_qty = num;
      }
    }
  }

  if (body.package_unit !== undefined) {
    const value = String(body.package_unit || '').trim();
    payload.package_unit = value === '' ? null : value;
  }

  if (body.price_per_purchase_unit !== undefined) {
    if (body.price_per_purchase_unit === null || body.price_per_purchase_unit === '') {
      payload.price_per_purchase_unit = null;
    } else {
      const num = Number(body.price_per_purchase_unit);
      if (!Number.isFinite(num) || num < 0) {
        errors.push('Harga beli tidak boleh negatif');
      } else {
        payload.price_per_purchase_unit = num;
      }
    }
  }

  if (body.min_order_qty !== undefined) {
    const num = Number(body.min_order_qty);
    if (!Number.isFinite(num) || num <= 0) {
      errors.push('Minimum pembelian harus angka lebih dari 0');
    } else {
      payload.min_order_qty = num;
    }
  }

  if (body.order_multiple !== undefined) {
    const num = Number(body.order_multiple);
    if (!Number.isFinite(num) || num <= 0) {
      errors.push('Kelipatan pembelian harus angka lebih dari 0');
    } else {
      payload.order_multiple = num;
    }
  }

  if (body.request_basis !== undefined) {
    if (!REQUEST_BASIS_VALUES.includes(body.request_basis)) {
      errors.push(`request_basis harus salah satu dari: ${REQUEST_BASIS_VALUES.join(', ')}`);
    } else {
      payload.request_basis = body.request_basis;
    }
  }

  if (body.notes !== undefined) {
    payload.notes = String(body.notes || '').trim() || null;
  }

  return { errors, payload };
}

// GET daftar semua mapping/konfigurasi pembelian per outlet+bahan
router.get('/', async (req, res) => {
  const { outlet_id, material_id } = req.query;
  let query = supabase
    .from('outlet_material_suppliers')
    .select(SELECT_WITH_JOINS)
    .order('created_at', { ascending: false });
  if (outlet_id) query = query.eq('outlet_id', outlet_id);
  if (material_id) query = query.eq('material_id', material_id);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST tambah konfigurasi pembelian (upsert berdasarkan outlet_id + material_id)
router.post('/', async (req, res) => {
  const { outlet_id, material_id, supplier_id } = req.body;
  if (!outlet_id || !material_id || !supplier_id) {
    return res.status(400).json({ error: 'outlet_id, material_id, dan supplier_id wajib diisi' });
  }

  const { errors, payload } = validateConfigPayload(req.body);
  if (errors.length > 0) return res.status(400).json({ error: errors.join('; ') });

  const { data, error } = await supabase
    .from('outlet_material_suppliers')
    .upsert(
      { outlet_id, material_id, supplier_id, is_active: true, ...payload },
      { onConflict: 'outlet_id,material_id' }
    )
    .select(SELECT_WITH_JOINS)
    .single();

  if (error) {
    const message = String(error.message || '').toLowerCase();
    const missingConfigColumns = CONFIG_FIELDS.some((f) => message.includes(f.toLowerCase())) && (
      message.includes('column') || message.includes('schema cache') || message.includes('could not find')
    );
    if (missingConfigColumns) {
      return res.status(409).json({
        error:
          'Kolom konfigurasi pembelian (satuan/harga/minimum) belum ada di database. ' +
          'Jalankan supabase/migration_outlet_material_purchase_config.sql terlebih dahulu.',
      });
    }
    return res.status(500).json({ error: error.message });
  }
  res.status(201).json(data);
});

// PUT ubah supplier, konfigurasi pembelian, atau status aktif mapping
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { supplier_id, is_active } = req.body;

  const { errors, payload } = validateConfigPayload(req.body);
  if (errors.length > 0) return res.status(400).json({ error: errors.join('; ') });

  const updates = { ...payload };
  if (supplier_id !== undefined) updates.supplier_id = supplier_id;
  if (is_active !== undefined) updates.is_active = is_active;

  const { data, error } = await supabase
    .from('outlet_material_suppliers')
    .update(updates)
    .eq('id', id)
    .select(SELECT_WITH_JOINS)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE hapus mapping (kembali ke supplier + aturan pembelian default bahan)
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase
    .from('outlet_material_suppliers')
    .delete()
    .eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// GET preview hasil hitung pembelian untuk kombinasi outlet+bahan+qty tertentu.
// Dipakai di Master Data agar admin bisa cek "700 gram jadi berapa pack?"
// sebelum menyimpan konfigurasi.
router.get('/preview', async (req, res) => {
  const { outlet_id, material_id, qty } = req.query;
  if (!material_id) return res.status(400).json({ error: 'material_id wajib diisi' });

  const { data: material, error: materialError } = await supabase
    .from('materials')
    .select('*')
    .eq('id', material_id)
    .single();
  if (materialError || !material) return res.status(404).json({ error: 'Bahan tidak ditemukan' });

  let mapping = null;
  if (outlet_id) {
    const { data } = await supabase
      .from('outlet_material_suppliers')
      .select('*')
      .eq('outlet_id', outlet_id)
      .eq('material_id', material_id)
      .eq('is_active', true)
      .maybeSingle();
    mapping = data || null;
  }

  const config = resolvePurchaseConfig(material, mapping);
  const suggestion = calculatePurchaseSuggestion(Number(qty) || 0, config);
  res.json({ config, suggestion });
});

module.exports = router;
