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

// ─── Variant Routes ──────────────────────────────────────────────────────────

// GET /api/materials/:id/variants
router.get('/:id/variants', async (req, res) => {
  const { data, error } = await supabase
    .from('material_variants')
    .select('*, supplier:suppliers(id, name)')
    .eq('material_id', req.params.id)
    .order('created_at');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// POST /api/materials/:id/variants
router.post('/:id/variants', async (req, res) => {
  const { brand, supplier_id, price_per_purchase_unit } = req.body;
  if (!brand?.trim()) return res.status(400).json({ error: 'Nama merk wajib diisi' });
  const { data, error } = await supabase
    .from('material_variants')
    .insert({
      material_id: req.params.id,
      brand: brand.trim(),
      supplier_id: supplier_id || null,
      price_per_purchase_unit: Number(price_per_purchase_unit) || 0,
    })
    .select('*, supplier:suppliers(id, name)')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// PUT /api/materials/:mid/variants/:vid
router.put('/:mid/variants/:vid', async (req, res) => {
  const allowed = ['brand', 'supplier_id', 'price_per_purchase_unit', 'is_active'];
  const updates = {};
  allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
  if (updates.supplier_id === '') updates.supplier_id = null;
  const { data, error } = await supabase
    .from('material_variants')
    .update(updates)
    .eq('id', req.params.vid)
    .eq('material_id', req.params.mid)
    .select('*, supplier:suppliers(id, name)')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/materials/:mid/variants/:vid
router.delete('/:mid/variants/:vid', async (req, res) => {
  const { error } = await supabase
    .from('material_variants')
    .delete()
    .eq('id', req.params.vid)
    .eq('material_id', req.params.mid);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
