const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');

// GET detail PO
router.get('/:po_id', async (req, res) => {
  const { po_id } = req.params;

  const { data: po, error } = await supabase
    .from('purchase_orders')
    .select(`
      *,
      supplier:suppliers(id, name, wa_number),
      session:order_sessions(id, order_date),
      items:purchase_order_items(
        id, qty_ordered, qty_received, price_actual, subtotal_actual,
        material:materials(id, code, name, purchase_unit, package_qty, package_unit)
      )
    `)
    .eq('id', po_id)
    .single();

  if (error) return res.status(404).json({ error: 'PO tidak ditemukan' });
  res.json(po);
});

// GET list PO (dengan filter status)
router.get('/', async (req, res) => {
  const { status } = req.query;
  let query = supabase
    .from('purchase_orders')
    .select(`
      *,
      supplier:suppliers(id, name),
      session:order_sessions(id, order_date)
    `)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PUT catat penerimaan barang
router.put('/:po_id/receive', async (req, res) => {
  const { po_id } = req.params;
  const { items, notes } = req.body;

  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ error: 'items wajib berupa array' });
  }

  // Update setiap item
  for (const item of items) {
    const { id, qty_received, price_actual } = item;
    if (!id) continue;

    const { error: itemError } = await supabase
      .from('purchase_order_items')
      .update({ qty_received, price_actual })
      .eq('id', id)
      .eq('po_id', po_id);

    if (itemError) return res.status(500).json({ error: itemError.message });
  }

  // Hitung total aktual
  const { data: updatedItems, error: fetchError } = await supabase
    .from('purchase_order_items')
    .select('qty_received, price_actual')
    .eq('po_id', po_id);

  if (fetchError) return res.status(500).json({ error: fetchError.message });

  const totalActual = updatedItems.reduce((sum, item) => {
    return sum + (Number(item.qty_received || 0) * Number(item.price_actual || 0));
  }, 0);

  // Update PO
  const { data: po, error: poError } = await supabase
    .from('purchase_orders')
    .update({ status: 'received', total_actual: totalActual, notes: notes || null })
    .eq('id', po_id)
    .select('*, supplier:suppliers(id, name)')
    .single();

  if (poError) return res.status(500).json({ error: poError.message });

  // Cek apakah semua PO dalam sesi sudah received
  if (po.session_id) {
    const { data: allPOs } = await supabase
      .from('purchase_orders')
      .select('status')
      .eq('session_id', po.session_id);

    if (allPOs && allPOs.every((p) => p.status === 'received')) {
      await supabase
        .from('order_sessions')
        .update({ status: 'completed' })
        .eq('id', po.session_id);
    }
  }

  res.json(po);
});

module.exports = router;
