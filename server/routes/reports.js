const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');

// GET laporan pengeluaran harian
router.get('/daily', async (req, res) => {
  const { date_from, date_to, supplier_id } = req.query;

  let query = supabase
    .from('purchase_orders')
    .select(`
      id, status, total_estimated, total_actual, created_at,
      supplier:suppliers(id, name),
      session:order_sessions(id, order_date),
      items:purchase_order_items(
        id, qty_ordered, qty_received, price_actual, subtotal_actual,
        material:materials(id, code, name, purchase_unit)
      )
    `)
    .in('status', ['received', 'pending', 'confirmed'])
    .order('created_at', { ascending: false });

  if (supplier_id) query = query.eq('supplier_id', supplier_id);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  // Filter berdasarkan tanggal order dari sesi
  let filtered = data || [];
  if (date_from || date_to) {
    filtered = filtered.filter((po) => {
      const orderDate = po.session?.order_date;
      if (!orderDate) return true;
      if (date_from && orderDate < date_from) return false;
      if (date_to && orderDate > date_to) return false;
      return true;
    });
  }

  res.json(filtered);
});

// GET ringkasan per supplier
router.get('/supplier', async (req, res) => {
  const { date_from, date_to } = req.query;

  const { data: suppliers, error: supplierError } = await supabase
    .from('suppliers')
    .select('id, name')
    .eq('is_active', true)
    .order('name');

  if (supplierError) return res.status(500).json({ error: supplierError.message });

  const { data: pos, error: posError } = await supabase
    .from('purchase_orders')
    .select('supplier_id, status, total_estimated, total_actual, session:order_sessions(order_date)');

  if (posError) return res.status(500).json({ error: posError.message });

  // Filter tanggal
  let filteredPOs = pos || [];
  if (date_from || date_to) {
    filteredPOs = filteredPOs.filter((po) => {
      const orderDate = po.session?.order_date;
      if (!orderDate) return true;
      if (date_from && orderDate < date_from) return false;
      if (date_to && orderDate > date_to) return false;
      return true;
    });
  }

  // Agregasi per supplier
  const summary = (suppliers || []).map((supplier) => {
    const supplierPOs = filteredPOs.filter((po) => po.supplier_id === supplier.id);
    const totalOrders = supplierPOs.length;
    const totalEstimated = supplierPOs.reduce((sum, po) => sum + Number(po.total_estimated || 0), 0);
    const receivedPOs = supplierPOs.filter((po) => po.status === 'received');
    const totalActual = receivedPOs.reduce((sum, po) => sum + Number(po.total_actual || 0), 0);
    const avgOrderValue = totalOrders > 0 ? totalEstimated / totalOrders : 0;

    return {
      supplier,
      total_orders: totalOrders,
      total_estimated: totalEstimated,
      total_actual: totalActual,
      avg_order_value: avgOrderValue,
    };
  });

  res.json(summary);
});

// GET analitik: top bahan per permintaan outlet
router.get('/analytics/materials', async (req, res) => {
  const { date_from, date_to, outlet_id } = req.query;

  let query = supabase
    .from('order_request_items')
    .select(`
      qty, outlet_id,
      material:materials(id, name, purchase_unit),
      session:order_sessions(id, order_date, status)
    `)
    .gt('qty', 0);

  if (outlet_id) query = query.eq('outlet_id', outlet_id);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  // Hanya sesi yang sudah selesai semua PO-nya (completed)
  let filtered = (data || []).filter((item) => item.session?.status === 'completed');
  if (date_from || date_to) {
    filtered = filtered.filter((item) => {
      const d = item.session?.order_date;
      if (!d) return true;
      if (date_from && d < date_from) return false;
      if (date_to && d > date_to) return false;
      return true;
    });
  }

  // Agregasi per material
  const map = {};
  for (const item of filtered) {
    const id = item.material?.id;
    if (!id) continue;
    if (!map[id]) {
      map[id] = { material: item.material, total_qty: 0, order_count: 0 };
    }
    map[id].total_qty += Number(item.qty);
    map[id].order_count += 1;
  }

  const result = Object.values(map)
    .sort((a, b) => b.total_qty - a.total_qty)
    .slice(0, 20);

  res.json(result);
});

// GET analitik: konsumsi per outlet/cabang
router.get('/analytics/outlets', async (req, res) => {
  const { date_from, date_to } = req.query;

  const { data: outlets, error: outletError } = await supabase
    .from('outlets')
    .select('id, name')
    .eq('is_active', true)
    .order('name');

  if (outletError) return res.status(500).json({ error: outletError.message });

  const { data: items, error: itemsError } = await supabase
    .from('order_request_items')
    .select(`
      qty, outlet_id,
      session:order_sessions(order_date, status)
    `)
    .gt('qty', 0);

  if (itemsError) return res.status(500).json({ error: itemsError.message });

  // Hanya sesi yang sudah selesai semua PO-nya (completed)
  let filtered = (items || []).filter((item) => item.session?.status === 'completed');
  if (date_from || date_to) {
    filtered = filtered.filter((item) => {
      const d = item.session?.order_date;
      if (!d) return true;
      if (date_from && d < date_from) return false;
      if (date_to && d > date_to) return false;
      return true;
    });
  }

  const result = (outlets || []).map((outlet) => {
    const outletItems = filtered.filter((item) => item.outlet_id === outlet.id);
    return {
      outlet,
      total_qty: outletItems.reduce((sum, i) => sum + Number(i.qty), 0),
      order_count: outletItems.length,
    };
  }).sort((a, b) => b.total_qty - a.total_qty);

  res.json(result);
});

// GET analitik: tren bulanan order (dari purchase_orders received)
router.get('/analytics/trends', async (req, res) => {
  const { date_from, date_to } = req.query;

  let query = supabase
    .from('purchase_orders')
    .select('total_estimated, total_actual, status, session:order_sessions(order_date)')
    .in('status', ['received', 'received_partial']);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  let filtered = data || [];
  if (date_from || date_to) {
    filtered = filtered.filter((po) => {
      const d = po.session?.order_date;
      if (!d) return true;
      if (date_from && d < date_from) return false;
      if (date_to && d > date_to) return false;
      return true;
    });
  }

  // Agregasi per bulan
  const map = {};
  for (const po of filtered) {
    const d = po.session?.order_date;
    if (!d) continue;
    const month = d.substring(0, 7); // "YYYY-MM"
    if (!map[month]) {
      map[month] = { month, total_estimated: 0, total_actual: 0, order_count: 0 };
    }
    map[month].total_estimated += Number(po.total_estimated || 0);
    map[month].total_actual += Number(po.total_actual || 0);
    map[month].order_count += 1;
  }

  const result = Object.values(map).sort((a, b) => a.month.localeCompare(b.month));
  res.json(result);
});

// GET dashboard stats
router.get('/stats', async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = today.substring(0, 7) + '-01';

  const [todaySession, activeSuppliers, pendingPOs, monthlyPOs] = await Promise.all([
    supabase.from('order_sessions').select('id').eq('order_date', today),
    supabase.from('suppliers').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('purchase_orders').select('id', { count: 'exact', head: true }).in('status', ['pending', 'confirmed']),
    supabase
      .from('purchase_orders')
      .select('total_actual, session:order_sessions(order_date)')
      .in('status', ['received', 'received_partial'])
      .gte('created_at', firstOfMonth),
  ]);

  const monthlySpending = (monthlyPOs.data || []).reduce(
    (sum, po) => sum + Number(po.total_actual || 0), 0
  );

  res.json({
    today_sessions: todaySession.data?.length || 0,
    active_suppliers: activeSuppliers.count || 0,
    pending_pos: pendingPOs.count || 0,
    monthly_spending: monthlySpending,
  });
});

// GET event reset laporan terakhir
router.get('/last-reset', async (req, res) => {
  const { data, error } = await supabase
    .from('report_resets')
    .select('*')
    .order('reset_at', { ascending: false })
    .limit(1);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data && data.length > 0 ? data[0] : null);
});

// POST catat event reset laporan (data transaksi tidak dihapus)
router.post('/reset', async (req, res) => {
  const { reset_type = 'all', notes } = req.body;

  const { data, error } = await supabase
    .from('report_resets')
    .insert({
      reset_type,
      notes: notes || null,
      reset_by: req.user?.role || 'admin',
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
