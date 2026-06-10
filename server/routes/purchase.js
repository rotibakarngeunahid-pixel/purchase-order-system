const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const posStockSync = require('../services/posStockSync');

const OPTIONAL_PO_ITEM_COLUMNS = [
  'variant_id',
  'source',
  'adjustment_note',
  'created_at',
  'supplier_id',
  'item_supplier',
  'material_variants',
  'purchase_item_branch_distribution',
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
    supplier_id: item.supplier_id ?? item.item_supplier?.id ?? null,
    item_supplier: item.item_supplier ?? null,
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
  // Coba dengan semua kolom + distribusi cabang
  let result = await supabase
    .from('purchase_orders')
    .select(`
      *,
      supplier:suppliers(id, name, wa_number),
      session:order_sessions(id, order_date),
      items:purchase_order_items(
        id, material_id, supplier_id, qty_ordered, qty_received, price_actual, subtotal_actual, variant_id,
        source, adjustment_note, created_at,
        material:materials(id, code, name, brand, purchase_unit, package_qty, package_unit, price_per_purchase_unit, supplier_id),
        variant:material_variants(id, brand, supplier_id, price_per_purchase_unit),
        item_supplier:suppliers(id, name),
        branch_distributions:purchase_item_branch_distribution(outlet_id, qty)
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

  // Fallback: tanpa supplier aktual item (kolom migrasi belum ada)
  result = await supabase
    .from('purchase_orders')
    .select(`
      *,
      supplier:suppliers(id, name, wa_number),
      session:order_sessions(id, order_date),
      items:purchase_order_items(
        id, material_id, qty_ordered, qty_received, price_actual, subtotal_actual, variant_id,
        source, adjustment_note, created_at,
        material:materials(id, code, name, brand, purchase_unit, package_qty, package_unit, price_per_purchase_unit, supplier_id),
        variant:material_variants(id, brand, supplier_id, price_per_purchase_unit),
        branch_distributions:purchase_item_branch_distribution(outlet_id, qty)
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

  // Fallback: tanpa distribusi cabang (tabel belum ada)
  result = await supabase
    .from('purchase_orders')
    .select(`
      *,
      supplier:suppliers(id, name, wa_number),
      session:order_sessions(id, order_date),
      items:purchase_order_items(
        id, material_id, supplier_id, qty_ordered, qty_received, price_actual, subtotal_actual, variant_id,
        source, adjustment_note, created_at,
        material:materials(id, code, name, brand, purchase_unit, package_qty, package_unit, price_per_purchase_unit, supplier_id),
        variant:material_variants(id, brand, supplier_id, price_per_purchase_unit),
        item_supplier:suppliers(id, name)
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

  // Fallback: tanpa supplier item dan distribusi
  result = await supabase
    .from('purchase_orders')
    .select(`
      *,
      supplier:suppliers(id, name, wa_number),
      session:order_sessions(id, order_date),
      items:purchase_order_items(
        id, material_id, qty_ordered, qty_received, price_actual, subtotal_actual, variant_id,
        source, adjustment_note, created_at,
        material:materials(id, code, name, brand, purchase_unit, package_qty, package_unit, price_per_purchase_unit, supplier_id),
        variant:material_variants(id, brand, supplier_id, price_per_purchase_unit)
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

  // Fallback: tanpa variant dan distribusi
  result = await supabase
    .from('purchase_orders')
    .select(`
      *,
      supplier:suppliers(id, name, wa_number),
      session:order_sessions(id, order_date),
      items:purchase_order_items(
        id, material_id, qty_ordered, qty_received, price_actual, subtotal_actual,
        material:materials(id, code, name, brand, purchase_unit, package_qty, package_unit, price_per_purchase_unit, supplier_id)
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
  if (item.supplier_id !== undefined) updatePayload.supplier_id = item.supplier_id || null;

  let result = await supabase
    .from('purchase_order_items')
    .update(updatePayload)
    .eq('id', item.id)
    .eq('po_id', poId);

  if (result.error && isMissingColumnError(result.error, ['variant_id', 'supplier_id'])) {
    if (isMissingColumnError(result.error, ['variant_id'])) delete updatePayload.variant_id;
    if (isMissingColumnError(result.error, ['supplier_id'])) delete updatePayload.supplier_id;
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

function addPositiveDistributionRow(rows, poItemId, outletId, qty) {
  if (!poItemId || !outletId) return;
  const numericQty = Number(qty) || 0;
  if (numericQty <= 0) return;
  rows.push({
    po_item_id: poItemId,
    outlet_id: outletId,
    qty: numericQty,
  });
}

async function replaceBranchDistributions(poItemIds, rows) {
  const itemIds = [...new Set((poItemIds || []).filter(Boolean))];
  if (itemIds.length === 0) return null;

  const { error: deleteError } = await supabase
    .from('purchase_item_branch_distribution')
    .delete()
    .in('po_item_id', itemIds);
  if (deleteError) return deleteError;

  if (!rows.length) return null;
  const mergedRows = [
    ...new Map(rows.map((row) => [`${row.po_item_id}:${row.outlet_id}`, row])).values(),
  ];

  const { error: insertError } = await supabase
    .from('purchase_item_branch_distribution')
    .insert(mergedRows);
  return insertError || null;
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

// PUT catat penerimaan barang (mendukung item adjustment + distribusi cabang)
router.put('/:po_id/receive', async (req, res) => {
  const { po_id } = req.params;
  const {
    items,
    deleted_adjustment_item_ids,
    notes,
    branch_distributions,
    supplier_id,
  } = req.body;

  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ error: 'items wajib berupa array' });
  }

  const { data: existingPO, error: existingPOError } = await supabase
    .from('purchase_orders')
    .select('id, status')
    .eq('id', po_id)
    .single();

  if (existingPOError || !existingPO) {
    return res.status(404).json({ error: 'PO tidak ditemukan' });
  }

  const itemSupplierIds = [
    ...new Set(items.map((item) => item.supplier_id).filter(Boolean)),
  ];
  const hasEmptyItemSupplier = items.some(
    (item) => item.supplier_id !== undefined && !item.supplier_id
  );
  if (hasEmptyItemSupplier) {
    return res.status(400).json({ error: 'Supplier setiap item penerimaan wajib dipilih' });
  }

  if (itemSupplierIds.length > 0) {
    const { data: validSuppliers, error: itemSupplierError } = await supabase
      .from('suppliers')
      .select('id')
      .in('id', itemSupplierIds);

    if (itemSupplierError) return res.status(500).json({ error: itemSupplierError.message });

    const validSupplierIds = new Set((validSuppliers || []).map((supplier) => supplier.id));
    const hasInvalidSupplier = itemSupplierIds.some((id) => !validSupplierIds.has(id));
    if (hasInvalidSupplier) {
      return res.status(400).json({ error: 'Supplier item penerimaan tidak ditemukan' });
    }
  }

  let supplierIdUpdate;
  if (supplier_id !== undefined) {
    if (!supplier_id) {
      return res.status(400).json({ error: 'Supplier penerimaan wajib dipilih' });
    }

    const { data: supplier, error: supplierError } = await supabase
      .from('suppliers')
      .select('id')
      .eq('id', supplier_id)
      .single();

    if (supplierError || !supplier) {
      return res.status(400).json({ error: 'Supplier penerimaan tidak ditemukan' });
    }

    supplierIdUpdate = supplier_id;
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

  const distributionItemIds = new Set();
  const nextDistributionRows = [];

  // Proses setiap item
  for (const item of items) {
    const source = item.source || 'ordered';

    if (source === 'ordered' && item.id) {
      distributionItemIds.add(item.id);
      const itemError = await updateOrderedPOItem(po_id, item);
      if (itemError) return res.status(500).json({ error: itemError.message });

    } else if (source === 'adjustment') {
      if (item.id) {
        distributionItemIds.add(item.id);
        // Update adjustment existing
        const updatePayload = {
          qty_received: item.qty_received,
          price_actual: item.price_actual,
          variant_id: item.variant_id || null,
          supplier_id: item.supplier_id || null,
          adjustment_note: item.adjustment_note || null,
        };

        let result = await supabase
          .from('purchase_order_items')
          .update(updatePayload)
          .eq('id', item.id)
          .eq('po_id', po_id)
          .eq('source', 'adjustment');
        if (result.error && isMissingColumnError(result.error, ['supplier_id'])) {
          delete updatePayload.supplier_id;
          result = await supabase
            .from('purchase_order_items')
            .update(updatePayload)
            .eq('id', item.id)
            .eq('po_id', po_id)
            .eq('source', 'adjustment');
        }
        if (result.error) return res.status(500).json({ error: result.error.message });
      } else {
        // Insert adjustment baru — ambil id untuk simpan inline_branch_distributions
        const insertPayload = {
          po_id,
          material_id: item.material_id,
          variant_id: item.variant_id || null,
          supplier_id: item.supplier_id || null,
          qty_ordered: 0,
          qty_received: item.qty_received,
          price_actual: item.price_actual,
          source: 'adjustment',
          adjustment_note: item.adjustment_note || null,
        };

        let result = await supabase
          .from('purchase_order_items')
          .insert(insertPayload)
          .select('id')
          .single();
        if (result.error && isMissingColumnError(result.error, ['supplier_id'])) {
          delete insertPayload.supplier_id;
          result = await supabase
            .from('purchase_order_items')
            .insert(insertPayload)
            .select('id')
            .single();
        }
        if (result.error) return res.status(500).json({ error: result.error.message });
        const insertedAdj = result.data;

        // Simpan inline_branch_distributions jika ada (untuk adj roti baru) — non-fatal
        if (insertedAdj?.id) {
          distributionItemIds.add(insertedAdj.id);
          if (Array.isArray(item.inline_branch_distributions)) {
            item.inline_branch_distributions.forEach((d) => {
              addPositiveDistributionRow(
                nextDistributionRows,
                insertedAdj.id,
                d.outlet_id,
                d.qty
              );
            });
          }
        }
      }
    }
  }

  if (Array.isArray(branch_distributions)) {
    branch_distributions.forEach((d) => {
      if (!distributionItemIds.has(d.po_item_id)) return;
      addPositiveDistributionRow(nextDistributionRows, d.po_item_id, d.outlet_id, d.qty);
    });
  }

  // Distribusi adalah snapshot terbaru. Hapus dulu agar qty 0/cabang yang dihapus
  // tidak tertinggal dan tidak ikut tersinkron ulang ke stok POS.
  if (distributionItemIds.size > 0) {
    const distError = await replaceBranchDistributions(
      [...distributionItemIds],
      nextDistributionRows
    );
    if (distError) {
      // Non-fatal: log saja, jangan gagalkan penerimaan utama
      console.error('Distribusi cabang gagal disimpan:', distError.message);
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

  // Buat catatan discrepancy otomatis.
  // Baris [Selisih Penerimaan] lama dibuang dulu agar tidak terduplikasi saat re-save.
  let autoNotes = String(notes || '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('[Selisih Penerimaan]'))
    .join('\n')
    .trim();
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
  const poUpdates = {
    status: poStatus,
    total_actual: totalActual,
    notes: autoNotes || null,
  };
  if (supplierIdUpdate !== undefined) poUpdates.supplier_id = supplierIdUpdate;

  const { data: po, error: poError } = await supabase
    .from('purchase_orders')
    .update(poUpdates)
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

  const wasAlreadyReceived = ['received', 'received_partial'].includes(existingPO.status);
  const posSync = wasAlreadyReceived
    ? await posStockSync.syncPOReviseToInventory(po_id, poStatus)
    : await posStockSync.syncPOReceiveToInventory(po_id, poStatus);
  res.json({ ...po, has_discrepancy: hasDiscrepancy, pos_sync: posSync });
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

  const posSync = await posStockSync.syncPOCancelToInventory(po_id);

  // Hapus semua item adjustment (distribusi adjustment terhapus via CASCADE)
  const deleteAdjustmentError = await deleteAdjustmentItems(po_id);
  if (deleteAdjustmentError) return res.status(500).json({ error: deleteAdjustmentError.message });

  // Reset item ordered: qty_received dan price_actual kembali null
  const { data: orderedItems, error: orderedItemsError } = await fetchOrderedItemIds(po_id);
  if (orderedItemsError) return res.status(500).json({ error: orderedItemsError.message });

  // Hapus distribusi cabang untuk semua item ordered (reset bersih)
  if ((orderedItems || []).length > 0) {
    const orderedItemIds = orderedItems.map((i) => i.id);
    await supabase
      .from('purchase_item_branch_distribution')
      .delete()
      .in('po_item_id', orderedItemIds);
  }

  for (const item of (orderedItems || [])) {
    const updatePayload = {
      qty_received: null,
      price_actual: null,
      supplier_id: null,
      variant_id: null,
    };

    let result = await supabase
      .from('purchase_order_items')
      .update(updatePayload)
      .eq('id', item.id);

    if (result.error && isMissingColumnError(result.error, ['variant_id', 'supplier_id'])) {
      if (isMissingColumnError(result.error, ['variant_id'])) delete updatePayload.variant_id;
      if (isMissingColumnError(result.error, ['supplier_id'])) delete updatePayload.supplier_id;
      await supabase
        .from('purchase_order_items')
        .update(updatePayload)
        .eq('id', item.id);
    }
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

  res.json({ ...updated, pos_sync: posSync });
});

module.exports = router;
