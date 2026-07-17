// ============================================================
// Integrasi Audit System (audit.rotibakarngeunah.my.id): endpoint
// BACA-SAJA (SELECT only, tidak ada satu pun query tulis di file ini)
// yang mencerminkan kebutuhan audit_app/api/repositories/PoRepository.php.
// Dibuat karena server Audit System tidak punya ekstensi PHP pdo_pgsql
// sehingga tidak bisa connect langsung ke Postgres — jalur ini jadi
// pengganti mode "db" lewat REST. Auth: middleware auditApiKey (X-API-Key).
// ============================================================
const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');

// GET /outlets
router.get('/outlets', async (req, res) => {
  const { data, error } = await supabase.from('outlets').select('id, name').eq('is_active', true);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

// GET /materials
router.get('/materials', async (req, res) => {
  const { data, error } = await supabase
    .from('materials')
    .select('id, code, name, package_qty, package_unit, purchase_unit, price_per_purchase_unit')
    .eq('is_active', true);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

// GET /received-pos?lookback_days=90
router.get('/received-pos', async (req, res) => {
  const lookbackDays = Math.max(1, parseInt(req.query.lookback_days, 10) || 90);
  const cutoff = new Date(Date.now() - lookbackDays * 86400000).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('purchase_orders')
    .select('id, status, total_estimated, total_actual, supplier_id, session_id, order_sessions(order_date)')
    .eq('status', 'received')
    .limit(1000);
  if (error) return res.status(500).json({ error: error.message });

  const rows = (data || [])
    .filter((po) => !po.order_sessions || po.order_sessions.order_date >= cutoff)
    .map((po) => ({
      id: po.id,
      status: po.status,
      total_estimated: po.total_estimated,
      total_actual: po.total_actual,
      supplier_id: po.supplier_id,
      order_date: po.order_sessions ? po.order_sessions.order_date : null,
    }))
    .sort((a, b) => (b.order_date || '').localeCompare(a.order_date || ''))
    .slice(0, 500);

  res.json({ data: rows });
});

// GET /confirmed-stuck?min_age_days=3
router.get('/confirmed-stuck', async (req, res) => {
  const minAgeDays = Math.max(0, parseInt(req.query.min_age_days, 10) || 3);
  const cutoff = new Date(Date.now() - minAgeDays * 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('purchase_orders')
    .select('id, status, supplier_id, order_sessions!inner(order_date)')
    .eq('status', 'confirmed')
    .lte('order_sessions.order_date', cutoff)
    .limit(500);
  if (error) return res.status(500).json({ error: error.message });

  const rows = (data || [])
    .map((po) => {
      const orderDate = po.order_sessions.order_date;
      const ageDays = Math.floor((Date.parse(today) - Date.parse(orderDate)) / 86400000);
      return { id: po.id, status: po.status, order_date: orderDate, supplier_id: po.supplier_id, age_days: ageDays };
    })
    .sort((a, b) => (a.order_date || '').localeCompare(b.order_date || ''))
    .slice(0, 200);

  res.json({ data: rows });
});

// GET /po-items?po_id=uuid
router.get('/po-items', async (req, res) => {
  const poId = String(req.query.po_id || '').trim();
  if (!poId) return res.status(422).json({ error: 'po_id wajib' });
  const { data, error } = await supabase
    .from('purchase_order_items')
    .select('id, po_id, material_id, qty_ordered, qty_received, price_actual, subtotal_actual, source, adjustment_note, created_at')
    .eq('po_id', poId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

// GET /distribution?item_ids=id1,id2,id3
router.get('/distribution', async (req, res) => {
  const itemIds = String(req.query.item_ids || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (itemIds.length === 0) return res.json({ data: [] });
  const { data, error } = await supabase
    .from('purchase_item_branch_distribution')
    .select('po_item_id, outlet_id, qty')
    .in('po_item_id', itemIds);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

module.exports = router;
