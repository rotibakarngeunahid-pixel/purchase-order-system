const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

// Tambah n hari ke string tanggal YYYY-MM-DD (timezone-safe, pure date arithmetic)
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + n));
  return date.toISOString().split('T')[0];
}

// Hari dalam seminggu untuk string tanggal YYYY-MM-DD (0=Minggu, 6=Sabtu)
function getDayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// Ambil semua holiday (one-time + weekly) yang berlaku pada tanggal tertentu
// Returns array of holiday rows
async function fetchHolidaysForDate(dateStr) {
  const dow = getDayOfWeek(dateStr);

  // One-time holidays untuk tanggal ini
  const { data: onetime } = await supabase
    .from('branch_holidays')
    .select('id, outlet_id, holiday_date, holiday_name, note, recurrence_type, day_of_week')
    .eq('is_active', true)
    .eq('recurrence_type', 'none')
    .eq('holiday_date', dateStr);

  // Weekly holidays yang cocok hari dalam seminggu
  const { data: weekly } = await supabase
    .from('branch_holidays')
    .select('id, outlet_id, holiday_date, holiday_name, note, recurrence_type, day_of_week')
    .eq('is_active', true)
    .eq('recurrence_type', 'weekly')
    .eq('day_of_week', dow);

  return [...(onetime || []), ...(weekly || [])];
}

// ─── GET /api/holidays ─────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { outlet_id, from, to, is_active } = req.query;

  let onetime = supabase
    .from('branch_holidays')
    .select('*, outlet:outlets(id, name)')
    .eq('recurrence_type', 'none')
    .order('holiday_date', { ascending: true });

  let weekly = supabase
    .from('branch_holidays')
    .select('*, outlet:outlets(id, name)')
    .eq('recurrence_type', 'weekly')
    .order('day_of_week', { ascending: true });

  if (outlet_id) { onetime = onetime.eq('outlet_id', outlet_id); weekly = weekly.eq('outlet_id', outlet_id); }
  if (from)      onetime = onetime.gte('holiday_date', from);
  if (to)        onetime = onetime.lte('holiday_date', to);
  if (is_active !== undefined) {
    const val = is_active === 'true';
    onetime = onetime.eq('is_active', val);
    weekly  = weekly.eq('is_active', val);
  }

  const [{ data: onetimeData, error: e1 }, { data: weeklyData, error: e2 }] =
    await Promise.all([onetime, weekly]);

  if (e1 || e2) return res.status(500).json({ error: (e1 || e2).message });

  // Weekly ditampilkan lebih dulu, lalu one-time
  res.json([...(weeklyData || []), ...(onetimeData || [])]);
});

// ─── GET /api/holidays/check-bulk?order_date=YYYY-MM-DD ────────────────────
// Cek order_date+1 DAN order_date+2 untuk semua outlet
// Returns holiday info per outlet + calculation_days (0, 1, atau 2)
router.get('/check-bulk', async (req, res) => {
  const { order_date } = req.query;
  if (!order_date) return res.status(400).json({ error: 'Parameter order_date wajib diisi' });

  const date1 = addDays(order_date, 1); // order_date + 1
  const date2 = addDays(order_date, 2); // order_date + 2

  const [hols1, hols2] = await Promise.all([
    fetchHolidaysForDate(date1),
    fetchHolidaysForDate(date2),
  ]);

  // Bangun map per outlet
  const holidayMap = {};

  const process = (rows, dateStr, field) => {
    rows.forEach((h) => {
      if (!holidayMap[h.outlet_id]) {
        holidayMap[h.outlet_id] = { date1_holiday: null, date2_holiday: null };
      }
      holidayMap[h.outlet_id][field] = h;
    });
  };
  process(hols1, date1, 'date1_holiday');
  process(hols2, date2, 'date2_holiday');

  // Hitung calculation_days: jumlah hari yang TIDAK libur
  Object.keys(holidayMap).forEach((outletId) => {
    const info = holidayMap[outletId];
    const openDay1 = info.date1_holiday ? 0 : 1;
    const openDay2 = info.date2_holiday ? 0 : 1;
    info.calculation_days = openDay1 + openDay2;
  });

  res.json({
    order_date,
    date1,
    date2,
    holidays: holidayMap, // hanya outlet yang ada minimal 1 hari libur
  });
});

// ─── POST /api/holidays ────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { outlet_id, recurrence_type = 'none', holiday_date, day_of_week, holiday_name, note } = req.body;

  if (!outlet_id) return res.status(400).json({ error: 'outlet_id wajib diisi' });
  if (!['none', 'weekly'].includes(recurrence_type)) {
    return res.status(400).json({ error: 'recurrence_type harus none atau weekly' });
  }
  if (recurrence_type === 'none' && !holiday_date) {
    return res.status(400).json({ error: 'holiday_date wajib diisi untuk libur tanggal tertentu' });
  }
  if (recurrence_type === 'weekly') {
    const dow = Number(day_of_week);
    if (isNaN(dow) || dow < 0 || dow > 6) {
      return res.status(400).json({ error: 'day_of_week harus antara 0 (Minggu) sampai 6 (Sabtu)' });
    }
  }

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

  // Cek duplikat
  let dupQuery = supabase
    .from('branch_holidays')
    .select('id, is_active')
    .eq('outlet_id', outlet_id)
    .eq('recurrence_type', recurrence_type);

  if (recurrence_type === 'none') {
    dupQuery = dupQuery.eq('holiday_date', holiday_date);
  } else {
    dupQuery = dupQuery.eq('day_of_week', Number(day_of_week));
  }

  const { data: existing } = await dupQuery.maybeSingle();

  if (existing) {
    if (existing.is_active) {
      const label = recurrence_type === 'weekly'
        ? `Libur mingguan hari ${DAY_NAMES[Number(day_of_week)]} sudah ada untuk cabang ini`
        : 'Tanggal libur sudah ada untuk cabang ini';
      return res.status(409).json({ error: label });
    }
    // Re-aktifkan yang sudah non-aktif
    const updates = {
      holiday_name: holiday_name || null,
      note: note || null,
      is_active: true,
      updated_by: req.user.id,
      updated_at: new Date().toISOString(),
    };
    const { data: reactivated, error: reactErr } = await supabase
      .from('branch_holidays')
      .update(updates)
      .eq('id', existing.id)
      .select('*, outlet:outlets(id, name)')
      .single();
    if (reactErr) return res.status(500).json({ error: reactErr.message });
    return res.status(201).json(reactivated);
  }

  const newRow = {
    outlet_id,
    recurrence_type,
    holiday_date: recurrence_type === 'none' ? holiday_date : null,
    day_of_week: recurrence_type === 'weekly' ? Number(day_of_week) : null,
    holiday_name: holiday_name || null,
    note: note || null,
    is_active: true,
    created_by: req.user.id,
  };

  const { data, error } = await supabase
    .from('branch_holidays')
    .insert(newRow)
    .select('*, outlet:outlets(id, name)')
    .single();

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Data hari libur sudah ada untuk cabang ini' });
    }
    return res.status(500).json({ error: error.message });
  }
  res.status(201).json(data);
});

// ─── PUT /api/holidays/:id ─────────────────────────────────────────────────
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

// ─── DELETE /api/holidays/:id — soft delete ────────────────────────────────
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase
    .from('branch_holidays')
    .update({ is_active: false, updated_by: req.user.id, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ─── POST /api/holidays/metadata/bulk ─────────────────────────────────────
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
    calculation_days: Number(r.calculation_days) >= 0 ? Number(r.calculation_days) : 2,
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
