const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');

const SELECT_WITH_JOINS = `
  *,
  outlet:outlets(id, name),
  material:materials(id, code, name),
  supplier:suppliers(id, name, wa_number)
`;

// GET daftar semua mapping supplier per outlet+bahan
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('outlet_material_suppliers')
    .select(SELECT_WITH_JOINS)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST tambah/ganti mapping (upsert berdasarkan outlet_id + material_id)
router.post('/', async (req, res) => {
  const { outlet_id, material_id, supplier_id } = req.body;
  if (!outlet_id || !material_id || !supplier_id) {
    return res.status(400).json({ error: 'outlet_id, material_id, dan supplier_id wajib diisi' });
  }

  const { data, error } = await supabase
    .from('outlet_material_suppliers')
    .upsert(
      { outlet_id, material_id, supplier_id, is_active: true },
      { onConflict: 'outlet_id,material_id' }
    )
    .select(SELECT_WITH_JOINS)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// PUT ubah supplier atau status aktif mapping
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { supplier_id, is_active } = req.body;
  const updates = {};
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

// DELETE hapus mapping (kembali ke supplier default bahan)
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase
    .from('outlet_material_suppliers')
    .delete()
    .eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
