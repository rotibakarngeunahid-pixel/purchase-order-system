const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');

// GET /api/holidays?outlet_id=...&from=...&to=...&is_active=...
router.get('/', async (req, res) => {
  const { outlet_id, from, to, is_active } = req.query;

  let query = supabase
    .from('branch_holidays')
    .select('*, outlet:outlets(id, name)')
    .order('holiday_date', { ascending: true });

  if (outlet_id) query = query.eq('outlet_id', outlet_id);
  if (from) query = query.gte('holiday_date', from);
  if (to) query = query.lte('holiday_date', to);
  if (is_active !== undefined) query = query.eq('is_active', is_active === 'true');

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// GET /api/holidays/check-bulk?date=YYYY-MM-DD
// Cek apakah tanggal tersebut libur untuk semua outlet aktif
router.get('/check-bulk', async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'Parameter date wajib diisi' });

  const { data: holidays, error } = await supabase
    .from('branch_holidays')
    .select('id, outlet_id, holiday_date, holiday_name, note')
    .eq('holiday_date', date)
    .eq('is_active', true);

  if (error) return res.status(500).json({ error: error.message });

  // Return map: { [outlet_id]: holidayRecord | null }
  const result = {};
  (holidays || []).forEach((h) => {
    result[h.outlet_id] = h;
  });
  res.json({ date, holidays: result });
});

// POST /api/holidays
router.post('/', async (req, res) => {
  const { outlet_id, holiday_date, holiday_name, note } = req.body;

  if (!outlet_id) return res.status(400).json({ error: 'outlet_id wajib diisi' });
  if (!holiday_date) return res.status(400).json({ error: 'holiday_date wajib diisi' });

  // Validasi outlet aktif
  const { data: outlet, error: outletErr } = await supabase
    .from('outlets')
    .select('id')
    .eq('id', outlet_id)
    .eq('is_active', true)
    .single();

  if (outletErr || !outlet) {
    return res.status(400).json({ error: 'Outlet tidak ditemukan atau tidak aktif' });
  }

  // Cek duplikat (aktif maupun tidak aktif)
  const { data: existing } = await supabase
    .from('branch_holidays')
    .select('id, is_active')
    .eq('outlet_id', outlet_id)
    .eq('holiday_date', holiday_date)
    .single();

  if (existing) {
    if (existing.is_active) {
      return res.status(409).json({ error: 'Tanggal libur sudah ada untuk cabang ini' });
    }
    // Jika ada tapi non-aktif, aktifkan kembali
    const { data: reactivated, error: reactErr } = await supabase
      .from('branch_holidays')
      .update({
        holiday_name: holiday_name || null,
        note: note || null,
        is_active: true,
        updated_by: req.user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('*, outlet:outlets(id, name)')
      .single();

    if (reactErr) return res.status(500).json({ error: reactErr.message });
    return res.status(201).json(reactivated);
  }

  const { data, error } = await supabase
    .from('branch_holidays')
    .insert({
      outlet_id,
      holiday_date,
      holiday_name: holiday_name || null,
      note: note || null,
      is_active: true,
      created_by: req.user.id,
    })
    .select('*, outlet:outlets(id, name)')
    .single();

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Tanggal libur sudah ada untuk cabang ini' });
    }
    return res.status(500).json({ error: error.message });
  }
  res.status(201).json(data);
});

// PUT /api/holidays/:id
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { holiday_name, note, is_active } = req.body;

  const updates = {
    updated_by: req.user.id,
    updated_at: new Date().toISOString(),
  };
  if (holiday_name !== undefined) updates.holiday_name = holiday_name || null;
  if (note !== undefined) updates.note = note || null;
  if (is_active !== undefined) updates.is_active = Boolean(is_active);

  const { data, error } = await supabase
    .from('branch_holidays')
    .update(updates)
    .eq('id', id)
    .select('*, outlet:outlets(id, name)')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Data hari libur tidak ditemukan' });
  res.json(data);
});

// DELETE /api/holidays/:id — soft delete
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase
    .from('branch_holidays')
    .update({
      is_active: false,
      updated_by: req.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// POST /api/holidays/metadata — upsert metadata holiday per outlet per sesi
router.post('/metadata', async (req, res) => {
  const { session_id, outlet_id, holiday_detected, override_holiday, calculation_days,
          holiday_date_detected, holiday_name_detected, holiday_id_detected } = req.body;

  if (!session_id || !outlet_id) {
    return res.status(400).json({ error: 'session_id dan outlet_id wajib diisi' });
  }

  const record = {
    session_id,
    outlet_id,
    holiday_detected: Boolean(holiday_detected),
    override_holiday: Boolean(override_holiday),
    calculation_days: Number(calculation_days) || 2,
    holiday_date_detected: holiday_date_detected || null,
    holiday_name_detected: holiday_name_detected || null,
    holiday_id_detected: holiday_id_detected || null,
    updated_at: new Date().toISOString(),
  };

  if (override_holiday) {
    record.holiday_override_by = req.user.id;
    record.holiday_override_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('order_outlet_holiday_metadata')
    .upsert(record, { onConflict: 'session_id,outlet_id' })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/holidays/metadata/bulk — upsert metadata untuk banyak outlet sekaligus
router.post('/metadata/bulk', async (req, res) => {
  const { session_id, records } = req.body;
  if (!session_id || !Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: 'session_id dan records wajib diisi' });
  }

  const now = new Date().toISOString();
  const rows = records.map((r) => ({
    session_id,
    outlet_id: r.outlet_id,
    holiday_detected: Boolean(r.holiday_detected),
    override_holiday: Boolean(r.override_holiday),
    calculation_days: Number(r.calculation_days) || 2,
    holiday_date_detected: r.holiday_date_detected || null,
    holiday_name_detected: r.holiday_name_detected || null,
    holiday_id_detected: r.holiday_id_detected || null,
    holiday_override_by: r.override_holiday ? req.user.id : null,
    holiday_override_at: r.override_holiday ? now : null,
    updated_at: now,
  }));

  const { error } = await supabase
    .from('order_outlet_holiday_metadata')
    .upsert(rows, { onConflict: 'session_id,outlet_id' });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, count: rows.length });
});

module.exports = router;
