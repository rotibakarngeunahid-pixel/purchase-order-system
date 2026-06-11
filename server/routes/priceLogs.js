const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');

function isMissingTableError(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('material_price_logs') &&
    (message.includes('schema cache') ||
      message.includes('could not find') ||
      message.includes('does not exist'))
  );
}

// Konversi tanggal operasional (WITA / UTC+8) ke batas timestamp UTC
function witaDayStart(dateStr) {
  return `${dateStr}T00:00:00+08:00`;
}
function witaDayEnd(dateStr) {
  return `${dateStr}T23:59:59.999+08:00`;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

// GET /api/price-logs
// Query: material_id, supplier_id, direction (up|down), source, date_from, date_to, limit
router.get('/', async (req, res) => {
  const { material_id, supplier_id, direction, source, date_from, date_to } = req.query;
  const limit = Math.min(Number(req.query.limit) || 500, 1000);

  let query = supabase
    .from('material_price_logs')
    .select(`
      *,
      material:materials(id, code, name, brand, purchase_unit),
      variant:material_variants(id, brand),
      supplier:suppliers(id, name),
      po:purchase_orders(id, session:order_sessions(order_date))
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (material_id) query = query.eq('material_id', material_id);
  if (supplier_id) query = query.eq('supplier_id', supplier_id);
  if (source) query = query.eq('source', source);
  if (direction === 'up') query = query.gt('change_amount', 0);
  if (direction === 'down') query = query.lt('change_amount', 0);
  if (date_from) query = query.gte('created_at', witaDayStart(date_from));
  if (date_to) query = query.lte('created_at', witaDayEnd(date_to));

  const { data, error } = await query;

  if (error) {
    if (isMissingTableError(error)) {
      return res.json({ logs: [], missing_migration: true });
    }
    return res.status(500).json({ error: error.message });
  }

  const logs = (data || []).map((row) => {
    const oldPrice = row.old_price === null ? null : Number(row.old_price);
    const newPrice = Number(row.new_price);
    const changeAmount = Number(row.change_amount) || 0;
    return {
      ...row,
      old_price: oldPrice,
      new_price: newPrice,
      change_amount: changeAmount,
      change_pct:
        oldPrice && oldPrice > 0 ? round2((changeAmount / oldPrice) * 100) : null,
      direction: changeAmount > 0 ? 'up' : changeAmount < 0 ? 'down' : 'flat',
    };
  });

  res.json({ logs, missing_migration: false });
});

module.exports = router;
