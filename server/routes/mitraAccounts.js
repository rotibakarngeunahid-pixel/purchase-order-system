// CRUD akun Mitra — admin only (mounted di index.js di belakang authMiddleware
// admin biasa). Dipakai dari tab "Akun Mitra" di Master Data.
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const supabase = require('../services/supabase');

const SELECT_COLS = 'id, outlet_id, username, full_name, is_active, created_at, updated_at, outlets(id, name)';

// GET / — daftar semua akun mitra
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('mitra_accounts')
    .select(SELECT_COLS)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// POST / — buat akun mitra baru
router.post('/', async (req, res) => {
  const { outlet_id, username, password, full_name } = req.body;
  if (!outlet_id || !username || !password || !full_name) {
    return res.status(400).json({ error: 'outlet_id, username, password, dan full_name wajib diisi' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Password minimal 6 karakter' });
  }

  const password_hash = await bcrypt.hash(String(password), 10);

  const { data, error } = await supabase
    .from('mitra_accounts')
    .insert({
      outlet_id,
      username: String(username).trim(),
      password_hash,
      full_name: String(full_name).trim(),
    })
    .select(SELECT_COLS)
    .single();

  if (error) {
    if (String(error.message).includes('duplicate') || error.code === '23505') {
      return res.status(409).json({ error: 'Username sudah dipakai' });
    }
    return res.status(500).json({ error: error.message });
  }
  res.status(201).json(data);
});

// PUT /:id — edit full_name/outlet_id/status, dan opsional reset password
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { outlet_id, full_name, is_active, password } = req.body;

  const updates = { updated_at: new Date().toISOString() };
  if (outlet_id !== undefined) updates.outlet_id = outlet_id;
  if (full_name !== undefined) updates.full_name = String(full_name).trim();
  if (is_active !== undefined) updates.is_active = !!is_active;
  if (password) {
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password minimal 6 karakter' });
    }
    updates.password_hash = await bcrypt.hash(String(password), 10);
  }

  const { data, error } = await supabase
    .from('mitra_accounts')
    .update(updates)
    .eq('id', id)
    .select(SELECT_COLS)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
