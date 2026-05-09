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

// GET dashboard stats
router.get('/stats', async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = today.substring(0, 7) + '-01';

  const [todaySession, activeSuppliers, pendingPOs, monthlyPOs] = await Promise.all([
    supabase.from('order_sessions').select('id').eq('order_date', today),
    supabase.from('suppliers').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('purchase_orders').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase
      .from('purchase_orders')
      .select('total_actual, session:order_sessions(order_date)')
      .eq('status', 'received')
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

module.exports = router;
