const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');

router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('materials')
    .select('*, supplier:suppliers(id, name, wa_number)')
    .order('code');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/', async (req, res) => {
  const { code, name, brand, supplier_id, package_qty, package_unit, purchase_unit, price_per_purchase_unit } = req.body;
  if (!code || !name || !package_qty || !package_unit || !purchase_unit) {
    return res.status(400).json({ error: 'Field wajib: code, name, package_qty, package_unit, purchase_unit' });
  }
  const { data, error } = await supabase
    .from('materials')
    .insert({ code, name, brand, supplier_id, package_qty, package_unit, purchase_unit, price_per_purchase_unit: price_per_purchase_unit || 0 })
    .select('*, supplier:suppliers(id, name, wa_number)')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const allowed = ['code', 'name', 'brand', 'supplier_id', 'package_qty', 'package_unit', 'purchase_unit', 'price_per_purchase_unit', 'is_active'];
  const updates = {};
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  });

  const { data, error } = await supabase
    .from('materials')
    .update(updates)
    .eq('id', id)
    .select('*, supplier:suppliers(id, name, wa_number)')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from('materials')
    .update({ is_active: false })
    .eq('id', id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
