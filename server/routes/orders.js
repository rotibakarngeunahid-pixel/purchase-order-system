const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const { calculatePOs } = require('../services/calculator');
const { getWitaDate } = require('../services/reportingDate');

// Buat sesi order baru atau ambil existing untuk tanggal tertentu
router.post('/session', async (req, res) => {
  const { order_date } = req.body;
  // Default pakai tanggal WITA, bukan UTC, agar tidak mundur sehari di pagi hari
  const date = order_date || getWitaDate();

  // Cek apakah sudah ada sesi untuk tanggal ini
  const { data: existing } = await supabase
    .from('order_sessions')
    .select('*')
    .eq('order_date', date)
    .single();

  if (existing) return res.json(existing);

  const { data, error } = await supabase
    .from('order_sessions')
    .insert({ order_date: date, status: 'draft', created_by: req.user.id })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// Ambil sesi + semua request items
router.get('/session/:id', async (req, res) => {
  const { id } = req.params;

  const { data: session, error: sessionError } = await supabase
    .from('order_sessions')
    .select('*')
    .eq('id', id)
    .single();

  if (sessionError) return res.status(404).json({ error: 'Sesi tidak ditemukan' });

  const { data: items, error: itemsError } = await supabase
    .from('order_request_items')
    .select('*, outlet:outlets(id, name), material:materials(id, code, name, purchase_unit)')
    .eq('session_id', id);

  if (itemsError) return res.status(500).json({ error: itemsError.message });

  res.json({ ...session, items: items || [] });
});

// List sesi order (paginated)
router.get('/sessions', async (req, res) => {
  const page = parseInt(req.query.page || '1');
  const limit = parseInt(req.query.limit || '20');
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = await supabase
    .from('order_sessions')
    .select('*, purchase_orders(id, total_estimated, status)', { count: 'exact' })
    .order('order_date', { ascending: false })
    .range(from, to);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ data, total: count, page, limit });
});

// Upsert item permintaan outlet
router.post('/session/:id/request', async (req, res) => {
  const { id } = req.params;
  const { outlet_id, material_id, qty } = req.body;

  if (!outlet_id || !material_id) {
    return res.status(400).json({ error: 'outlet_id dan material_id wajib diisi' });
  }

  const { data, error } = await supabase
    .from('order_request_items')
    .upsert(
      { session_id: id, outlet_id, material_id, qty: qty || 0 },
      { onConflict: 'session_id,outlet_id,material_id' }
    )
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Hapus sesi order berstatus draft
router.delete('/session/:id', async (req, res) => {
  const { id } = req.params;

  const { data: session, error: sessionError } = await supabase
    .from('order_sessions')
    .select('id, status')
    .eq('id', id)
    .single();

  if (sessionError || !session) {
    return res.status(404).json({ error: 'Sesi tidak ditemukan' });
  }

  if (session.status !== 'draft') {
    return res.status(400).json({ error: 'Hanya sesi berstatus Draft yang dapat dihapus' });
  }

  const { error: deleteError } = await supabase
    .from('order_sessions')
    .delete()
    .eq('id', id);

  if (deleteError) return res.status(500).json({ error: deleteError.message });

  res.json({ success: true, message: 'Draft berhasil dihapus' });
});

// Hitung PO per supplier
router.post('/session/:id/calculate', async (req, res) => {
  const { id } = req.params;

  const { data: items, error: itemsError } = await supabase
    .from('order_request_items')
    .select('*')
    .eq('session_id', id)
    .gt('qty', 0);

  if (itemsError) return res.status(500).json({ error: itemsError.message });

  const { data: materials, error: matError } = await supabase
    .from('materials')
    .select('*, supplier:suppliers(id, name, wa_number)')
    .eq('is_active', true);

  if (matError) return res.status(500).json({ error: matError.message });

  const pos = calculatePOs(items || [], materials || []);
  res.json({ pos, item_count: items?.length || 0 });
});

module.exports = router;
