const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');

const OPTIONAL_PO_ITEM_COLUMNS = [
  'variant_id',
  'source',
  'adjustment_note',
  'created_at',
  'material_variants',
];

function isMissingColumnError(error, columns = OPTIONAL_PO_ITEM_COLUMNS) {
  const message = String(error?.message || '').toLowerCase();
  return columns.some((column) => message.includes(column.toLowerCase())) && (
    message.includes('column') ||
    message.includes('schema cache') ||
    message.includes('could not find') ||
    message.includes('relationship')
  );
}

function normalizePOItem(item) {
  return {
    ...item,
    variant_id: item.variant_id ?? null,
    variant: item.variant ?? null,
    source: item.source || 'ordered',
    adjustment_note: item.adjustment_note ?? null,
    created_at: item.created_at ?? null,
  };
}

function normalizeAndSortPOItems(po) {
  if (!po?.items) return po;

  po.items = po.items.map(normalizePOItem).sort((a, b) => {
    const srcA = a.source || 'ordered';
    const srcB = b.source || 'ordered';
    if (srcA !== srcB) return srcA === 'ordered' ? -1 : 1;
    return new Date(a.created_at || 0) - new Date(b.created_at || 0);
  });

  return po;
}

async function fetchPODetail(poId) {
  let result = await supabase
    .from('purchase_orders')
    .select(`
      *,
      supplier:suppliers(id, name, wa_number),
      session:order_sessions(id, order_date),
      items:purchase_order_items(
        id, material_id, qty_ordered, qty_received, price_actual, subtotal_actual, variant_id,
        source, adjustment_note, created_at,
        material:materials(id, code, name, purchase_unit, package_qty, package_unit, price_per_purchase_unit, supplier_id),
        variant:material_variants(id, brand, price_per_purchase_unit)
      )
    `)
    .eq('id', poId)
    .single();

  if (!result.error) {
    return { data: normalizeAndSortPOItems(result.data), error: null };
  }

  if (!isMissingColumnError(result.error)) {
    return result;
  }

  result = await supabase
    .from('purchase_orders')
    .select(`
      *,
      supplier:suppliers(id, name, wa_number),
      session:order_sessions(id, order_date),
      items:purchase_order_items(
        id, material_id, qty_ordered, qty_received, price_actual, subtotal_actual,
        material:materials(id, code, name, purchase_unit, package_qty, package_unit, price_per_purchase_unit, supplier_id)
      )
    `)
    .eq('id', poId)
    .single();

  if (result.error) return result;
  return { data: normalizeAndSortPOItems(result.data), error: null };
}

async function updateOrderedPOItem(poId, item) {
  const updatePayload = {
    qty_received: item.qty_received,
    price_actual: item.price_actual,
  };
  if (item.variant_id !== undefined) updatePayload.variant_id = item.variant_id || null;

  let result = await supabase
    .from('purchase_order_items')
    .update(updatePayload)
    .eq('id', item.id)
    .eq('po_id', poId);

  if (result.error && isMissingColumnError(result.error, ['variant_id'])) {
    delete updatePayload.variant_id;
    result = await supabase
      .from('purchase_order_items')
      .update(updatePayload)
      .eq('id', item.id)
      .eq('po_id', poId);
  }

  return result.error;
}

async function fetchPOItemsForTotals(poId) {
  let result = await supabase
    .from('purchase_order_items')
    .select('qty_received, price_actual, qty_ordered, source, material:materials(name)')
    .eq('po_id', poId);

  if (!result.error) {
    return { data: (result.data || []).map(normalizePOItem), error: null };
  }

  if (!isMissingColumnError(result.error, ['source'])) {
    return result;
  }

  result = await supabase
    .from('purchase_order_items')
    .select('qty_received, price_actual, qty_ordered, material:materials(name)')
    .eq('po_id', poId);

  if (result.error) return result;
  return { data: (result.data || []).map(normalizePOItem), error: null };
}

async function deleteAdjustmentItems(poId) {
  const result = await supabase
    .from('purchase_order_items')
    .delete()
    .eq('po_id', poId)
    .eq('source', 'adjustment');

  if (result.error && isMissingColumnError(result.error, ['source'])) return null;
  return result.error;
}

async function fetchOrderedItemIds(poId) {
  let result = await supabase
    .from('purchase_order_items')
    .select('id')
    .eq('po_id', poId)
    .or('source.eq.ordered,source.is.null');

  if (!result.error) return result;
  if (!isMissingColumnError(result.error, ['source'])) return result;

  return supabase
    .from('purchase_order_items')
    .select('id')
    .eq('po_id', poId);
}

// GET detail PO
router.get('/:po_id', async (req, res) => {
  const { po_id } = req.params;

  const { data: po, error } = await fetchPODetail(po_id);

  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500;
    return res.status(status).json({ error: status === 404 ? 'PO tidak ditemukan' : error.message });
  }
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

// PUT catat penerimaan barang (mendukung item adjustment)
router.put('/:po_id/receive', async (req, res) => {
  const { po_id } = req.params;
  const { items, deleted_adjustment_item_ids, notes } = req.body;

  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ error: 'items wajib berupa array' });
  }

  // Validasi payload
  for (const item of items) {
    const source = item.source || 'ordered';
    if (source === 'ordered' && !item.id) {
      return res.status(400).json({ error: 'Item PO awal harus memiliki id' });
    }
    if (source === 'adjustment' && !item.id && !item.material_id) {
      return res.status(400).json({ error: 'Item adjustment baru harus memiliki material_id' });
    }
    if (source === 'adjustment' && !(Number(item.qty_received) > 0)) {
      return res.status(400).json({ error: 'Item adjustment harus memiliki qty_received lebih dari 0' });
    }
  }

  // Hapus item adjustment yang ditandai deleted
  if (deleted_adjustment_item_ids && deleted_adjustment_item_ids.length > 0) {
    const { error: delError } = await supabase
      .from('purchase_order_items')
      .delete()
      .in('id', deleted_adjustment_item_ids)
      .eq('po_id', po_id)
      .eq('source', 'adjustment');
    if (delError) return res.status(500).json({ error: delError.message });
  }

  // Proses setiap item
  for (const item of items) {
    const source = item.source || 'ordered';

    if (source === 'ordered' && item.id) {
      const itemError = await updateOrderedPOItem(po_id, item);
      if (itemError) return res.status(500).json({ error: itemError.message });

    } else if (source === 'adjustment') {
      if (item.id) {
        // Update adjustment existing
        const { error: itemError } = await supabase
          .from('purchase_order_items')
          .update({
            qty_received: item.qty_received,
            price_actual: item.price_actual,
            variant_id: item.variant_id || null,
            adjustment_note: item.adjustment_note || null,
          })
          .eq('id', item.id)
          .eq('po_id', po_id)
          .eq('source', 'adjustment');
        if (itemError) return res.status(500).json({ error: itemError.message });
      } else {
        // Insert adjustment baru
        const { error: itemError } = await supabase
          .from('purchase_order_items')
          .insert({
            po_id,
            material_id: item.material_id,
            variant_id: item.variant_id || null,
            qty_ordered: 0,
            qty_received: item.qty_received,
            price_actual: item.price_actual,
            source: 'adjustment',
            adjustment_note: item.adjustment_note || null,
          });
        if (itemError) return res.status(500).json({ error: itemError.message });
      }
    }
  }

  // Hitung ulang total_actual dari DB (semua item termasuk adjustment)
  const { data: allItems, error: fetchError } = await fetchPOItemsForTotals(po_id);

  if (fetchError) return res.status(500).json({ error: fetchError.message });

  const totalActual = allItems.reduce((sum, item) => {
    return sum + (Number(item.qty_received || 0) * Number(item.price_actual || 0));
  }, 0);

  // Cek discrepancy hanya dari item source = ordered
  const orderedItems = allItems.filter((item) => (item.source || 'ordered') === 'ordered');
  const discrepancies = orderedItems.filter(
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

  // Cek apakah semua PO dalam sesi sudah received
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

// DELETE hapus PO yang masih pending/confirmed
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

  if (po.session_id) {
    await supabase
      .from('order_sessions')
      .update({ status: 'sent' })
      .eq('id', po.session_id)
      .eq('status', 'completed');
  }

  res.json({ success: true });
});

// PUT reset PO ke pending (hapus adjustment, kosongkan data penerimaan ordered)
router.put('/:po_id/reset', async (req, res) => {
  const { po_id } = req.params;

  const { data: po, error: fetchError } = await supabase
    .from('purchase_orders')
    .select('id, status, session_id')
    .eq('id', po_id)
    .single();

  if (fetchError || !po) return res.status(404).json({ error: 'PO tidak ditemukan' });

  // Hapus semua item adjustment
  const deleteAdjustmentError = await deleteAdjustmentItems(po_id);
  if (deleteAdjustmentError) return res.status(500).json({ error: deleteAdjustmentError.message });

  // Reset item ordered: qty_received dan price_actual kembali null
  const { data: orderedItems, error: orderedItemsError } = await fetchOrderedItemIds(po_id);
  if (orderedItemsError) return res.status(500).json({ error: orderedItemsError.message });

  for (const item of (orderedItems || [])) {
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
