const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');

// GET list — optional ?date_from=&date_to=
router.get('/', async (req, res) => {
  const { date_from, date_to } = req.query;

  let query = supabase
    .from('purchase_report')
    .select('*')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (date_from) query = query.gte('date', date_from);
  if (date_to) query = query.lte('date', date_to);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// POST create entry
router.post('/', async (req, res) => {
  const { item_name, qty, unit, date, supplier_name, notes } = req.body;

  if (!item_name?.trim() || !qty || !unit?.trim() || !date) {
    return res.status(400).json({ error: 'item_name, qty, unit, date wajib diisi' });
  }

  const { data, error } = await supabase
    .from('purchase_report')
    .insert({
      item_name: item_name.trim(),
      qty: Number(qty),
      unit: unit.trim(),
      date,
      supplier_name: supplier_name?.trim() || null,
      notes: notes?.trim() || null,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// DELETE entry
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase
    .from('purchase_report')
    .delete()
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
