const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');

const FINAL_RECEIPT_STATUSES = ['received', 'received_partial'];

function buildAvailabilityMap(receiptItems) {
  return (receiptItems || []).reduce((map, item) => {
    const materialId = item.material_id;
    if (!materialId) return map;

    if (!map[materialId]) {
      map[materialId] = { total_received: 0, has_final_receipt: false };
    }

    map[materialId].total_received += Number(item.qty_received || 0);
    map[materialId].has_final_receipt = true;
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
    .select('material_id, qty_received, source')
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

  let availabilityMap = {};
  try {
    availabilityMap = await getReceiptAvailabilityMap(session.id);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }

  const outletMap = {};
  (items || []).forEach((item) => {
    const availability = availabilityMap[item.material_id];
    if (availability?.has_final_receipt && availability.total_received <= 0) {
      return;
    }

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

  res.json({ date, session, outlets: Object.values(outletMap), availability_applied: true });
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
