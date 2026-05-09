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
        material:materials(id, code, name, purchase_unit, package_qty, package_unit, price_per_purchase_unit)
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

  // Cek discrepancy: item yang qty_received < qty_ordered atau = 0
  const { data: allItems } = await supabase
    .from('purchase_order_items')
    .select('qty_ordered, qty_received, material:materials(name)')
    .eq('po_id', po_id);

  const discrepancies = (allItems || []).filter(
    (item) => Number(item.qty_received ?? item.qty_ordered) < Number(item.qty_ordered)
  );

  const hasDiscrepancy = discrepancies.length > 0;
  const poStatus = hasDiscrepancy ? 'received_partial' : 'received';

  // Buat catatan discrepancy otomatis
  let autoNotes = notes || '';
  if (hasDiscrepancy) {
    const discLines = discrepancies.map(
      (item) =>
        `${item.material?.name}: dipesan ${item.qty_ordered}, diterima ${item.qty_received ?? 0}`
    );
    autoNotes = [autoNotes, `[Selisih Penerimaan] ${discLines.join('; ')}`]
      .filter(Boolean)
      .join('\n');
  }

  // Update PO
  const { data: po, error: poError } = await supabase
    .from('purchase_orders')
    .update({ status: poStatus, total_actual: totalActual, notes: autoNotes || null })
    .eq('id', po_id)
    .select('*, supplier:suppliers(id, name)')
    .single();

  if (poError) return res.status(500).json({ error: poError.message });

  // Cek apakah semua PO dalam sesi sudah received/received_partial
  if (po.session_id) {
    const { data: allPOs } = await supabase
      .from('purchase_orders')
      .select('status')
      .eq('session_id', po.session_id);

    const allDone = allPOs && allPOs.every(
      (p) => p.status === 'received' || p.status === 'received_partial'
    );
    if (allDone) {
      await supabase
        .from('order_sessions')
        .update({ status: 'completed' })
        .eq('id', po.session_id);
    }
  }

  res.json({ ...po, has_discrepancy: hasDiscrepancy });
});

// DELETE hapus PO yang masih pending (belum dicatat penerimaan)
router.delete('/:po_id', async (req, res) => {
  const { po_id } = req.params;

  const { data: po, error: fetchError } = await supabase
    .from('purchase_orders')
    .select('id, status, session_id')
    .eq('id', po_id)
    .single();

  if (fetchError || !po) return res.status(404).json({ error: 'PO tidak ditemukan' });
  if (po.status !== 'pending' && po.status !== 'confirmed') {
    return res.status(400).json({ error: 'Hanya PO berstatus Pending atau Dikonfirmasi yang dapat dihapus' });
  }

  const { error: deleteError } = await supabase
    .from('purchase_orders')
    .delete()
    .eq('id', po_id);

  if (deleteError) return res.status(500).json({ error: deleteError.message });

  // Kembalikan sesi ke "sent" jika sebelumnya completed
  if (po.session_id) {
    await supabase
      .from('order_sessions')
      .update({ status: 'sent' })
      .eq('id', po.session_id)
      .eq('status', 'completed');
  }

  res.json({ success: true });
});

// PUT reset PO ke status pending (hapus data penerimaan)
router.put('/:po_id/reset', async (req, res) => {
  const { po_id } = req.params;

  const { data: po, error: fetchError } = await supabase
    .from('purchase_orders')
    .select('id, status, session_id')
    .eq('id', po_id)
    .single();

  if (fetchError || !po) return res.status(404).json({ error: 'PO tidak ditemukan' });

  // Reset semua item: qty_received dan price_actual kembali ke null
  const { data: items } = await supabase
    .from('purchase_order_items')
    .select('id')
    .eq('po_id', po_id);

  for (const item of (items || [])) {
    await supabase
      .from('purchase_order_items')
      .update({ qty_received: null, price_actual: null })
      .eq('id', item.id);
  }

  // Reset PO ke pending
  const { data: updated, error: updateError } = await supabase
    .from('purchase_orders')
    .update({ status: 'pending', total_actual: null, notes: null })
    .eq('id', po_id)
    .select('*, supplier:suppliers(id, name)')
    .single();

  if (updateError) return res.status(500).json({ error: updateError.message });

  // Jika sesi sudah completed, kembalikan ke sent
  if (po.session_id) {
    await supabase
      .from('order_sessions')
      .update({ status: 'sent' })
      .eq('id', po.session_id)
      .eq('status', 'completed');
  }

  res.json(updated);
});

module.exports = router;
