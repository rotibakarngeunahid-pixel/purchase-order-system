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
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name wajib diisi' });
  const { data, error } = await supabase
    .from('outlets')
    .insert({ name })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, is_active } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (is_active !== undefined) updates.is_active = is_active;

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
  const { data, error } = await supabase
    .from('outlets')
    .update({ is_active: false })
    .eq('id', id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
