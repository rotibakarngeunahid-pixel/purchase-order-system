const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');

router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('outlets')
    .select('*')
    .order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/', async (req, res) => {
  const { name, inventori_branch_id, inventori_cabang_name, min_stock_roti } = req.body;
  if (!name) return res.status(400).json({ error: 'name wajib diisi' });
  const { data, error } = await supabase
    .from('outlets')
    .insert({
      name,
      inventori_branch_id: inventori_branch_id || null,
      inventori_cabang_name: inventori_cabang_name || null,
      min_stock_roti: Number(min_stock_roti) || 0,
    })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, is_active, inventori_branch_id, inventori_cabang_name, min_stock_roti } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (is_active !== undefined) updates.is_active = is_active;
  if (inventori_branch_id !== undefined) updates.inventori_branch_id = inventori_branch_id || null;
  if (inventori_cabang_name !== undefined) updates.inventori_cabang_name = inventori_cabang_name || null;
  if (min_stock_roti !== undefined) updates.min_stock_roti = Number(min_stock_roti) || 0;

  const { data, error } = await supabase
    .from('outlets')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase
    .from('outlets')
    .delete()
    .eq('id', id);
  if (error) {
    if (error.code === '23503') {
      return res.status(400).json({
        error: 'Outlet tidak dapat dihapus karena masih terhubung dengan data order/mapping/laporan. Nonaktifkan saja lewat toggle.',
      });
    }
    return res.status(500).json({ error: error.message });
  }
  res.json({ success: true });
});

module.exports = router;
