const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');

router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/', async (req, res) => {
  const { name, wa_number } = req.body;
  if (!name || !wa_number) {
    return res.status(400).json({ error: 'name dan wa_number wajib diisi' });
  }
  const { data, error } = await supabase
    .from('suppliers')
    .insert({ name, wa_number })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, wa_number, is_active } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (wa_number !== undefined) updates.wa_number = wa_number;
  if (is_active !== undefined) updates.is_active = is_active;

  const { data, error } = await supabase
    .from('suppliers')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from('suppliers')
    .update({ is_active: false })
    .eq('id', id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
