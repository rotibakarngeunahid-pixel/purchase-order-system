const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');

const FINAL_RECEIPT_STATUSES = ['received', 'received_partial'];

function isRotiTawar(name) {
  return String(name || '').toLowerCase().includes('roti tawar');
}

function getDistributionAvailableQty(materialName, receivedQty) {
  const received = Number(receivedQty || 0);
  if (received <= 0) return 0;
  if (isRotiTawar(materialName)) {
    return received + Math.floor(received / 20);
  }
  return received;
}

function buildAvailabilityMap(receiptItems) {
  return (receiptItems || []).reduce((map, item) => {
    const materialId = item.material_id;
    if (!materialId) return map;

    if (!map[materialId]) {
      map[materialId] = {
        total_received: 0,
        has_final_receipt: false,
        material_name: item.material?.name || null,
      };
    }

    map[materialId].total_received += Number(item.qty_received || 0);
    map[materialId].has_final_receipt = true;
    if (!map[materialId].material_name && item.material?.name) {
      map[materialId].material_name = item.material.name;
    }
    return map;
  }, {});
}

function isMissingSourceColumnError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('source') && (
    message.includes('column') ||
    message.includes('schema cache') ||
    message.includes('could not find')
  );
}

// Bangun map distribusi cabang: { [outlet_id]: { [material_id]: qty } }
// Sumber: purchase_item_branch_distribution yang tersimpan saat catat penerimaan
async function getBranchDistributionMap(sessionId) {
  const { data: finalPOs, error: poError } = await supabase
    .from('purchase_orders')
    .select('id')
    .eq('session_id', sessionId)
    .in('status', FINAL_RECEIPT_STATUSES);

  if (poError) throw poError;
  const finalPOIds = (finalPOs || []).map((po) => po.id).filter(Boolean);
  if (finalPOIds.length === 0) return {};

  const { data: poItems, error: itemsError } = await supabase
    .from('purchase_order_items')
    .select('id, material_id, branch_distributions:purchase_item_branch_distribution(outlet_id, qty)')
    .in('po_id', finalPOIds)
    .or('source.eq.ordered,source.is.null');

  if (itemsError) {
    // Tabel belum ada (migration belum dijalankan) — kembalikan map kosong
    if (String(itemsError.message || '').toLowerCase().includes('purchase_item_branch_distribution')) {
      return {};
    }
    throw itemsError;
  }

  // map: { [outlet_id]: { [material_id]: qty } }
  const map = {};
  (poItems || []).forEach((poItem) => {
    (poItem.branch_distributions || []).forEach((d) => {
      if (!map[d.outlet_id]) map[d.outlet_id] = {};
      map[d.outlet_id][poItem.material_id] =
        (map[d.outlet_id][poItem.material_id] || 0) + Number(d.qty || 0);
    });
  });

  return map;
}

async function getReceiptAvailabilityMap(sessionId) {
  const { data: finalPOs, error: poError } = await supabase
    .from('purchase_orders')
    .select('id')
    .eq('session_id', sessionId)
    .in('status', FINAL_RECEIPT_STATUSES);

  if (poError) throw poError;

  const finalPOIds = (finalPOs || []).map((po) => po.id).filter(Boolean);
  if (finalPOIds.length === 0) return {};

  let receiptQuery = supabase
    .from('purchase_order_items')
    .select('material_id, qty_received, source, material:materials(id, name)')
    .in('po_id', finalPOIds)
    .or('source.eq.ordered,source.is.null');

  let { data: receiptItems, error: receiptError } = await receiptQuery;

  if (receiptError && isMissingSourceColumnError(receiptError)) {
    const retry = await supabase
      .from('purchase_order_items')
      .select('material_id, qty_received')
      .in('po_id', finalPOIds);

    receiptItems = retry.data;
    receiptError = retry.error;
  }

  if (receiptError) throw receiptError;
  return buildAvailabilityMap(receiptItems);
}

async function getPurchaseReportDistributionItems(date) {
  const { data, error } = await supabase
    .from('purchase_report')
    .select(`
      id, outlet_id, material_id, qty, unit, notes,
      outlet:outlets(id, name),
      material:materials(id, name, purchase_unit)
    `)
    .eq('date', date)
    .gt('qty', 0);

  if (error) throw error;

  return (data || []).map((item) => ({
    outlet: item.outlet,
    item: {
      id: `purchase-report-${item.id}`,
      outlet_id: item.outlet_id,
      material_id: item.material_id,
      material_name: item.material?.name,
      purchase_unit: item.unit || item.material?.purchase_unit,
      qty: item.qty,
      source: 'purchase_report',
      notes: item.notes || null,
    },
  }));
}

async function getAdjustmentDistributionItems(sessionId) {
  const { data: finalPOs, error: poError } = await supabase
    .from('purchase_orders')
    .select('id, supplier:suppliers(id, name)')
    .eq('session_id', sessionId)
    .in('status', FINAL_RECEIPT_STATUSES);

  if (poError) throw poError;

  const poMap = {};
  const finalPOIds = (finalPOs || []).map((po) => {
    poMap[po.id] = po;
    return po.id;
  }).filter(Boolean);

  if (finalPOIds.length === 0) return [];

  const { data, error } = await supabase
    .from('purchase_order_items')
    .select(`
      id, po_id, material_id, qty_received, source, adjustment_note, variant_id,
      material:materials(id, name, purchase_unit)
    `)
    .in('po_id', finalPOIds)
    .eq('source', 'adjustment')
    .gt('qty_received', 0);

  if (error && isMissingSourceColumnError(error)) return [];
  if (error) throw error;

  return (data || []).map((item) => {
    const po = poMap[item.po_id];
    return {
      id: `adjustment-${item.id}`,
      material_id: item.material_id,
      material_name: item.material?.name,
      purchase_unit: item.material?.purchase_unit,
      qty: item.qty_received,
      source: 'adjustment',
      adjustment_note: item.adjustment_note,
      supplier: po?.supplier || null,
    };
  });
}

// Distribusi: publik, tidak perlu login
router.get('/distribution', async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];

  let purchaseReportItems = [];
  try {
    purchaseReportItems = await getPurchaseReportDistributionItems(date);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }

  const { data: session, error: sessionError } = await supabase
    .from('order_sessions')
    .select('id, order_date, status')
    .eq('order_date', date)
    .maybeSingle();

  if (sessionError) return res.status(500).json({ error: sessionError.message });
  if (!session && purchaseReportItems.length === 0) {
    return res.json({ date, session: null, outlets: [] });
  }

  let items = [];
  if (session) {
    const { data: requestItems, error: itemsError } = await supabase
      .from('order_request_items')
      .select('*, outlet:outlets(id, name), material:materials(id, name, purchase_unit)')
      .eq('session_id', session.id)
      .gt('qty', 0)
      .order('outlet_id');

    if (itemsError) return res.status(500).json({ error: itemsError.message });
    items = requestItems || [];
  }

  let availabilityMap = {};
  let branchDistMap = {};
  if (session) {
    try {
      availabilityMap = await getReceiptAvailabilityMap(session.id);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
    try {
      branchDistMap = await getBranchDistributionMap(session.id);
    } catch {
      // Non-fatal: jika gagal, fallback ke logika order_request_items
    }
  }

  // material_id mana saja yang sudah punya distribusi cabang (mapping manual)
  const materialIdsWithDist = new Set();
  Object.values(branchDistMap).forEach((outletDist) => {
    Object.keys(outletDist).forEach((mid) => materialIdsWithDist.add(mid));
  });

  const outletMap = {};
  const remainingAvailabilityByMaterial = {};

  function getRemainingAvailability(item) {
    const availability = availabilityMap[item.material_id];
    if (!availability?.has_final_receipt) return null;

    if (remainingAvailabilityByMaterial[item.material_id] === undefined) {
      remainingAvailabilityByMaterial[item.material_id] = getDistributionAvailableQty(
        availability.material_name || item.material?.name,
        availability.total_received,
      );
    }

    return remainingAvailabilityByMaterial[item.material_id];
  }

  (items || []).forEach((item) => {
    const availability = availabilityMap[item.material_id];
    let displayQty = Number(item.qty || 0);
    let availabilityLimited = false;

    if (materialIdsWithDist.has(item.material_id)) {
      // Pakai distribusi cabang yang sudah di-mapping secara manual
      displayQty = branchDistMap[item.outlet_id]?.[item.material_id] ?? 0;
      // Outlet yang tidak mendapat distribusi dilewati
      if (displayQty <= 0) return;
    } else if (availability?.has_final_receipt) {
      // Belum ada distribusi manual: bagi otomatis berdasarkan qty diterima
      const remainingAvailability = getRemainingAvailability(item);
      if (remainingAvailability <= 0) return;

      displayQty = Math.min(displayQty, remainingAvailability);
      remainingAvailabilityByMaterial[item.material_id] = remainingAvailability - displayQty;
      availabilityLimited = displayQty < Number(item.qty || 0);
    }

    if (displayQty <= 0) return;

    const oid = item.outlet_id;
    if (!outletMap[oid]) {
      outletMap[oid] = { outlet: item.outlet, items: [] };
    }
    outletMap[oid].items.push({
      id: item.id,
      material_id: item.material_id,
      material_name: item.material?.name,
      purchase_unit: item.material?.purchase_unit,
      qty: displayQty,
      requested_qty: item.qty,
      availability_limited: availabilityLimited,
      source: 'ordered',
    });
  });

  purchaseReportItems.forEach(({ outlet, item }) => {
    if (!outlet?.id) return;
    const oid = item.outlet_id || outlet.id;
    if (!outletMap[oid]) {
      outletMap[oid] = { outlet, items: [] };
    }
    outletMap[oid].items.push(item);
  });

  let outlets = Object.values(outletMap);
  if (session) {
    try {
      const adjustmentItems = await getAdjustmentDistributionItems(session.id);
      if (adjustmentItems.length > 0) {
        outlets = [
          ...outlets,
          {
            outlet: { id: '__adjustments__', name: 'Bahan Menyusul' },
            is_adjustment_group: true,
            items: adjustmentItems,
          },
        ];
      }
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  res.json({
    date,
    session: session || { id: null, order_date: date, status: 'purchase_report' },
    outlets,
    availability_applied: true,
    purchase_report_applied: true,
  });
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
