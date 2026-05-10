const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');

// Distribusi: publik, tidak perlu login
router.get('/distribution', async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];

  const { data: session, error: sessionError } = await supabase
    .from('order_sessions')
    .select('id, order_date, status')
    .eq('order_date', date)
    .maybeSingle();

  if (sessionError) return res.status(500).json({ error: sessionError.message });
  if (!session) return res.json({ date, session: null, outlets: [] });

  const { data: items, error: itemsError } = await supabase
    .from('order_request_items')
    .select('*, outlet:outlets(id, name), material:materials(id, name, purchase_unit)')
    .eq('session_id', session.id)
    .gt('qty', 0)
    .order('outlet_id');

  if (itemsError) return res.status(500).json({ error: itemsError.message });

  const outletMap = {};
  (items || []).forEach((item) => {
    const oid = item.outlet_id;
    if (!outletMap[oid]) {
      outletMap[oid] = { outlet: item.outlet, items: [] };
    }
    outletMap[oid].items.push({
      id: item.id,
      material_id: item.material_id,
      material_name: item.material?.name,
      purchase_unit: item.material?.purchase_unit,
      qty: item.qty,
    });
  });

  res.json({ date, session, outlets: Object.values(outletMap) });
});

// Outlet aktif: publik, untuk dropdown di halaman distribusi
router.get('/outlets', async (req, res) => {
  const { data, error } = await supabase
    .from('outlets')
    .select('id, name')
    .eq('is_active', true)
    .order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
