const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');

const FINAL_RECEIPT_STATUSES = ['received', 'received_partial'];

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

function makeKey(...parts) {
  return parts.map((part) => part || '').join('|');
}

function isWithinDateRange(date, dateFrom, dateTo) {
  if (!date) return true;
  if (dateFrom && date < dateFrom) return false;
  if (dateTo && date > dateTo) return false;
  return true;
}

function getMonthKey(date) {
  return date ? date.substring(0, 7) : null;
}

function ensureTrendMonth(map, month) {
  if (!map[month]) {
    map[month] = { month, total_estimated: 0, total_actual: 0, order_count: 0 };
  }
  return map[month];
}

function getActualSubtotal(row) {
  const subtotal = Number(row.subtotal_actual || 0);
  if (subtotal > 0) return subtotal;
  return Number(row.qty_received || 0) * Number(row.price_actual || 0);
}

function isMissingSourceColumnError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('source') && (
    message.includes('column') ||
    message.includes('schema cache') ||
    message.includes('could not find')
  );
}

function isOrderedReceiptRow(row) {
  return (row.source || 'ordered') === 'ordered';
}

function shouldIncludeRequestItem(item, availabilityMap) {
  const sessionId = item.session?.id;
  const materialId = item.material_id || item.material?.id;
  if (!sessionId || !materialId) return true;

  const availability = availabilityMap[makeKey(sessionId, materialId)];
  return !(availability?.has_final_receipt && availability.total_received <= 0);
}

async function getReceiptAvailabilityMap(dateFrom, dateTo) {
  const { data: finalPOs, error: poError } = await supabase
    .from('purchase_orders')
    .select('id, session_id, session:order_sessions(id, order_date)')
    .in('status', FINAL_RECEIPT_STATUSES);

  if (poError) throw poError;

  const poSessionById = {};
  const poIds = [];
  for (const po of finalPOs || []) {
    if (!isWithinDateRange(po.session?.order_date, dateFrom, dateTo)) continue;
    if (!po.id) continue;

    poSessionById[po.id] = po.session_id || po.session?.id;
    poIds.push(po.id);
  }

  if (poIds.length === 0) return {};

  let result = await supabase
    .from('purchase_order_items')
    .select(`
      po_id, material_id, qty_received, source
    `)
    .in('po_id', poIds);

  if (result.error && isMissingSourceColumnError(result.error)) {
    result = await supabase
      .from('purchase_order_items')
      .select(`
        po_id, material_id, qty_received
      `)
      .in('po_id', poIds);
  }

  if (result.error) throw result.error;

  const availabilityMap = {};
  for (const row of result.data || []) {
    if (!isOrderedReceiptRow(row)) continue;

    const sessionId = poSessionById[row.po_id];
    const materialId = row.material_id;
    if (!sessionId || !materialId) continue;

    const key = makeKey(sessionId, materialId);
    if (!availabilityMap[key]) {
      availabilityMap[key] = { has_final_receipt: false, total_received: 0 };
    }

    availabilityMap[key].has_final_receipt = true;
    availabilityMap[key].total_received += Number(row.qty_received || 0);
  }

  return availabilityMap;
}

// Bangun map distribusi cabang untuk analitik:
// { makeKey(session_id, outlet_id, material_id) → qty }
// Dipakai untuk mengganti order_request_items.qty dengan qty distribusi aktual.
async function getBranchDistributionMapForAnalytics(sessionIds) {
  if (!sessionIds || sessionIds.length === 0) return {};

  const { data: finalPOs, error: poError } = await supabase
    .from('purchase_orders')
    .select('id, session_id')
    .in('session_id', sessionIds)
    .in('status', FINAL_RECEIPT_STATUSES);

  if (poError) return {}; // Non-fatal

  const poSessionMap = {};
  const poIds = (finalPOs || []).map((p) => {
    poSessionMap[p.id] = p.session_id;
    return p.id;
  }).filter(Boolean);

  if (poIds.length === 0) return {};

  let result = await supabase
    .from('purchase_order_items')
    .select('id, po_id, material_id, branch_distributions:purchase_item_branch_distribution(outlet_id, qty)')
    .in('po_id', poIds)
    .or('source.eq.ordered,source.is.null');

  if (result.error) {
    // Tabel belum ada atau error lain → non-fatal, fallback ke order_request_items
    return {};
  }

  const map = {};
  (result.data || []).forEach((item) => {
    const sessionId = poSessionMap[item.po_id];
    if (!sessionId) return;
    (item.branch_distributions || []).forEach((d) => {
      const key = makeKey(sessionId, d.outlet_id, item.material_id);
      map[key] = (map[key] || 0) + Number(d.qty || 0);
    });
  });

  return map;
}

// Bangun map distribusi roti TAMBAHAN (source=adjustment) per outlet:
// { outlet_id → total_adj_roti_qty }
// Dipakai untuk menambahkan qty roti tambahan ke total analitik per outlet.
async function getAdjRotiDistByOutlet(sessionIds, dateFrom, dateTo) {
  if (!sessionIds || sessionIds.length === 0) return {};

  const { data: finalPOs, error: poError } = await supabase
    .from('purchase_orders')
    .select('id, session_id, session:order_sessions(order_date)')
    .in('session_id', sessionIds)
    .in('status', FINAL_RECEIPT_STATUSES);

  if (poError) return {};

  const poIds = (finalPOs || [])
    .filter((p) => isWithinDateRange(p.session?.order_date, dateFrom, dateTo))
    .map((p) => p.id)
    .filter(Boolean);

  if (poIds.length === 0) return {};

  const result = await supabase
    .from('purchase_order_items')
    .select(`
      material_id,
      material:materials(name),
      branch_distributions:purchase_item_branch_distribution(outlet_id, qty)
    `)
    .in('po_id', poIds)
    .eq('source', 'adjustment');

  if (result.error) return {};

  const map = {};
  for (const item of result.data || []) {
    if (!item.material?.name?.toLowerCase().includes('roti')) continue;
    for (const dist of item.branch_distributions || []) {
      if (!dist.outlet_id || !Number(dist.qty)) continue;
      map[dist.outlet_id] = (map[dist.outlet_id] || 0) + Number(dist.qty);
    }
  }
  return map;
}

async function getRequestQtyMaps(dateFrom, dateTo) {
  const { data, error } = await supabase
    .from('order_request_items')
    .select(`
      qty, outlet_id, material_id,
      session:order_sessions(id, order_date)
    `)
    .gt('qty', 0);

  if (error) throw error;

  const qtyBySessionMaterial = {};
  const qtyBySessionMaterialOutlet = {};

  for (const item of data || []) {
    const sessionId = item.session?.id;
    const materialId = item.material_id;
    const d = item.session?.order_date;
    if (!sessionId || !materialId || !isWithinDateRange(d, dateFrom, dateTo)) continue;

    const qty = Number(item.qty || 0);
    qtyBySessionMaterial[makeKey(sessionId, materialId)] =
      (qtyBySessionMaterial[makeKey(sessionId, materialId)] || 0) + qty;
    qtyBySessionMaterialOutlet[makeKey(sessionId, materialId, item.outlet_id)] =
      (qtyBySessionMaterialOutlet[makeKey(sessionId, materialId, item.outlet_id)] || 0) + qty;
  }

  return { qtyBySessionMaterial, qtyBySessionMaterialOutlet };
}

// GET analitik: top bahan per permintaan outlet + total harga aktual
router.get('/analytics/materials', async (req, res) => {
  const { date_from, date_to, outlet_id } = req.query;

  const { data, error } = await supabase
    .from('order_request_items')
    .select(`
      qty, outlet_id, material_id,
      material:materials(id, name, purchase_unit),
      session:order_sessions(id, order_date, status)
    `)
    .gt('qty', 0);

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

  let availabilityMap = {};
  try {
    availabilityMap = await getReceiptAvailabilityMap(date_from, date_to);
  } catch (availabilityError) {
    return res.status(500).json({ error: availabilityError.message });
  }
  filtered = filtered.filter((item) => shouldIncludeRequestItem(item, availabilityMap));

  const displayItems = outlet_id
    ? filtered.filter((item) => item.outlet_id === outlet_id)
    : filtered;

  // Agregasi per material
  const map = {};
  const qtyBySessionMaterial = {};
  const qtyBySessionMaterialOutlet = {};

  for (const item of filtered) {
    const sessionId = item.session?.id;
    const materialId = item.material?.id;
    if (!sessionId || !materialId) continue;

    const qty = Number(item.qty || 0);
    qtyBySessionMaterial[makeKey(sessionId, materialId)] =
      (qtyBySessionMaterial[makeKey(sessionId, materialId)] || 0) + qty;
    qtyBySessionMaterialOutlet[makeKey(sessionId, materialId, item.outlet_id)] =
      (qtyBySessionMaterialOutlet[makeKey(sessionId, materialId, item.outlet_id)] || 0) + qty;
  }

  for (const item of displayItems) {
    const id = item.material?.id;
    if (!id) continue;
    if (!map[id]) {
      map[id] = { material: item.material, total_qty: 0, order_count: 0, total_expense: 0 };
    }
    map[id].total_qty += Number(item.qty);
    map[id].order_count += 1;
  }

  // Ambil total harga aktual dari PO reguler. Jika filter cabang dipakai,
  // biaya PO dibagi proporsional berdasarkan qty permintaan cabang tersebut.
  const { data: poRows, error: poError } = await supabase
    .from('purchase_order_items')
    .select(`
      material_id, qty_ordered, qty_received, price_actual, subtotal_actual,
      material:materials(id, name, purchase_unit),
      po:purchase_orders(
        status,
        session_id,
        session:order_sessions(id, order_date)
      )
    `);

  if (poError) return res.status(500).json({ error: poError.message });

  let filteredPORows = (poRows || []).filter((row) => (
    row.po?.status === 'received' || row.po?.status === 'received_partial'
  ));
  if (date_from || date_to) {
    filteredPORows = filteredPORows.filter((row) => {
      const d = row.po?.session?.order_date;
      if (!d) return true;
      if (date_from && d < date_from) return false;
      if (date_to && d > date_to) return false;
      return true;
    });
  }

  for (const row of filteredPORows) {
    const id = row.material_id || row.material?.id;
    const sessionId = row.po?.session_id || row.po?.session?.id;
    if (!id || !sessionId) continue;

    const subtotal = Number(row.subtotal_actual || 0);
    const fallbackSubtotal = Number(row.qty_received || 0) * Number(row.price_actual || 0);
    let amount = subtotal > 0 ? subtotal : fallbackSubtotal;
    if (amount <= 0) continue;

    if (outlet_id) {
      const outletQty = qtyBySessionMaterialOutlet[makeKey(sessionId, id, outlet_id)] || 0;
      const totalQty = qtyBySessionMaterial[makeKey(sessionId, id)] || 0;
      if (outletQty <= 0 || totalQty <= 0) continue;
      amount *= outletQty / totalQty;
    }

    if (!map[id]) {
      map[id] = {
        material: row.material || { id },
        total_qty: Number(row.qty_received || row.qty_ordered || 0),
        order_count: 1,
        total_expense: 0,
      };
    }
    map[id].total_expense = (map[id].total_expense || 0) + amount;
  }

  // Ambil barang masuk dari purchase_report untuk outlet/tanggal yang sama
  const { data: reportRows, error: reportError } = await supabase
    .from('purchase_report')
    .select('material_id, qty, price_per_unit, date, outlet_id, material:materials(id, name, purchase_unit)')
    .gt('qty', 0);

  if (reportError) return res.status(500).json({ error: reportError.message });

  let filteredReports = reportRows || [];
  if (date_from || date_to) {
    filteredReports = filteredReports.filter((r) => {
      const d = r.date;
      if (!d) return true;
      if (date_from && d < date_from) return false;
      if (date_to && d > date_to) return false;
      return true;
    });
  }
  if (outlet_id) {
    filteredReports = filteredReports.filter((r) => r.outlet_id === outlet_id);
  }

  for (const r of filteredReports) {
    const id = r.material_id || r.material?.id;
    if (!id) continue;
    if (!map[id]) {
      map[id] = { material: r.material || { id }, total_qty: 0, order_count: 0, total_expense: 0 };
    }
    map[id].total_qty += Number(r.qty || 0);
    map[id].order_count += 1;
    const amount = Number(r.qty || 0) * Number(r.price_per_unit || 0);
    map[id].total_expense = (map[id].total_expense || 0) + amount;
  }

  const result = Object.values(map)
    .sort((a, b) => b.total_qty - a.total_qty)
    .slice(0, 20);

  res.json(result);
});

// GET analitik: konsumsi per outlet/cabang
router.get('/analytics/outlets', async (req, res) => {
  const { date_from, date_to, outlet_id } = req.query;

  const { data: outlets, error: outletError } = await supabase
    .from('outlets')
    .select('id, name')
    .eq('is_active', true)
    .order('name');

  if (outletError) return res.status(500).json({ error: outletError.message });

  const { data: items, error: itemsError } = await supabase
    .from('order_request_items')
    .select(`
      qty, outlet_id, material_id,
      session:order_sessions(id, order_date, status)
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

  let availabilityMap = {};
  try {
    availabilityMap = await getReceiptAvailabilityMap(date_from, date_to);
  } catch (availabilityError) {
    return res.status(500).json({ error: availabilityError.message });
  }
  filtered = filtered.filter((item) => shouldIncludeRequestItem(item, availabilityMap));

  // Load distribusi cabang aktual (purchase_item_branch_distribution)
  const sessionIds = [...new Set(filtered.map((i) => i.session?.id).filter(Boolean))];
  let branchDistMap = {};
  try {
    branchDistMap = await getBranchDistributionMapForAnalytics(sessionIds);
  } catch {
    // Non-fatal: jika gagal, tetap pakai order_request_items.qty
  }

  // Load distribusi roti tambahan (adj) per outlet
  let adjRotiByOutlet = {};
  try {
    adjRotiByOutlet = await getAdjRotiDistByOutlet(sessionIds, date_from, date_to);
  } catch {
    // Non-fatal
  }

  const displayOutlets = outlet_id
    ? (outlets || []).filter((outlet) => outlet.id === outlet_id)
    : (outlets || []);

  const result = displayOutlets.map((outlet) => {
    const outletItems = filtered.filter((item) => item.outlet_id === outlet.id);
    const orderedQty = outletItems.reduce((sum, item) => {
      const sessionId = item.session?.id;
      const distKey = makeKey(sessionId, outlet.id, item.material_id);
      // Pakai distribusi aktual jika ada, fallback ke qty yang dipesan
      const qty = branchDistMap[distKey] !== undefined
        ? branchDistMap[distKey]
        : Number(item.qty || 0);
      return sum + qty;
    }, 0);
    // Tambahkan distribusi roti tambahan (adj) jika ada
    const adjQty = adjRotiByOutlet[outlet.id] || 0;
    return {
      outlet,
      total_qty: orderedQty + adjQty,
      order_count: outletItems.length,
    };
  }).sort((a, b) => b.total_qty - a.total_qty);

  res.json(result);
});

// GET analitik: tren bulanan pengeluaran, termasuk alokasi PO per cabang.
router.get('/analytics/trends', async (req, res) => {
  const { date_from, date_to, outlet_id } = req.query;

  const map = {};

  try {
    if (outlet_id) {
      const { qtyBySessionMaterial, qtyBySessionMaterialOutlet } =
        await getRequestQtyMaps(date_from, date_to);

      const { data: poRows, error } = await supabase
        .from('purchase_order_items')
        .select(`
          material_id, qty_ordered, qty_received, price_actual, subtotal_actual,
          material:materials(id, price_per_purchase_unit),
          po:purchase_orders(
            id,
            status,
            session_id,
            total_estimated,
            session:order_sessions(id, order_date)
          )
        `);

      if (error) return res.status(500).json({ error: error.message });

      const poGroups = {};
      for (const row of poRows || []) {
        if (row.po?.status !== 'received' && row.po?.status !== 'received_partial') continue;
        const d = row.po?.session?.order_date;
        if (!isWithinDateRange(d, date_from, date_to)) continue;
        if (!row.po?.id) continue;

        if (!poGroups[row.po.id]) poGroups[row.po.id] = [];
        poGroups[row.po.id].push(row);
      }

      for (const rows of Object.values(poGroups)) {
        const po = rows[0]?.po;
        const month = getMonthKey(po?.session?.order_date);
        if (!po || !month) continue;

        const rawEstimates = rows.map((row) => (
          Number(row.qty_ordered || 0) * Number(row.material?.price_per_purchase_unit || 0)
        ));
        const rawEstimateTotal = rawEstimates.reduce((sum, amount) => sum + amount, 0);
        const trend = ensureTrendMonth(map, month);
        let hasOutletExpense = false;

        rows.forEach((row, index) => {
          const materialId = row.material_id || row.material?.id;
          const sessionId = row.po?.session_id || row.po?.session?.id;
          if (!materialId || !sessionId) return;

          const outletQty = qtyBySessionMaterialOutlet[makeKey(sessionId, materialId, outlet_id)] || 0;
          const totalQty = qtyBySessionMaterial[makeKey(sessionId, materialId)] || 0;
          if (outletQty <= 0 || totalQty <= 0) return;

          const outletRatio = outletQty / totalQty;
          const actualSubtotal = getActualSubtotal(row);
          const estimatedSubtotal = rawEstimateTotal > 0
            ? Number(po.total_estimated || 0) * (rawEstimates[index] / rawEstimateTotal)
            : Number(po.total_estimated || 0) / rows.length;

          trend.total_actual += actualSubtotal * outletRatio;
          trend.total_estimated += estimatedSubtotal * outletRatio;
          hasOutletExpense = true;
        });

        if (hasOutletExpense) trend.order_count += 1;
      }
    } else {
      const { data: pos, error: poError } = await supabase
        .from('purchase_orders')
        .select('id, total_estimated, status, session:order_sessions(order_date)')
        .in('status', FINAL_RECEIPT_STATUSES);

      if (poError) return res.status(500).json({ error: poError.message });

      const poMonthById = {};
      for (const po of pos || []) {
        const d = po.session?.order_date;
        if (!isWithinDateRange(d, date_from, date_to)) continue;

        const month = getMonthKey(d);
        if (!month) continue;

        poMonthById[po.id] = month;
        const trend = ensureTrendMonth(map, month);
        trend.total_estimated += Number(po.total_estimated || 0);
        trend.order_count += 1;
      }

      const poIds = Object.keys(poMonthById);
      if (poIds.length > 0) {
        const { data: poRows, error: poRowsError } = await supabase
          .from('purchase_order_items')
          .select('po_id, qty_received, price_actual, subtotal_actual')
          .in('po_id', poIds);

        if (poRowsError) return res.status(500).json({ error: poRowsError.message });

        for (const row of poRows || []) {
          const month = poMonthById[row.po_id];
          if (!month) continue;

          const actualSubtotal = getActualSubtotal(row);
          if (actualSubtotal <= 0) continue;

          const trend = ensureTrendMonth(map, month);
          trend.total_actual += actualSubtotal;
        }
      }
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }

  // Sertakan juga pengeluaran dari `purchase_report` (laporan barang masuk)
  const { data: reportRows, error: reportError } = await supabase
    .from('purchase_report')
    .select('qty, price_per_unit, date, outlet_id');

  if (reportError) return res.status(500).json({ error: reportError.message });

  let filteredReports = reportRows || [];
  if (date_from || date_to) {
    filteredReports = filteredReports.filter((r) => isWithinDateRange(r.date, date_from, date_to));
  }
  if (outlet_id) {
    filteredReports = filteredReports.filter((r) => r.outlet_id === outlet_id);
  }

  for (const r of filteredReports) {
    const d = r.date;
    if (!d) continue;
    const month = getMonthKey(d);
    const trend = ensureTrendMonth(map, month);
    trend.total_actual += Number(r.qty || 0) * Number(r.price_per_unit || 0);
  }

  const result = Object.values(map)
    .filter((row) => row.order_count > 0 || row.total_estimated > 0 || row.total_actual > 0)
    .sort((a, b) => a.month.localeCompare(b.month));
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

  // Ambil juga pengeluaran dari purchase_report sejak awal bulan
  const { data: reportsThisMonth, error: reportsError } = await supabase
    .from('purchase_report')
    .select('qty, price_per_unit, date')
    .gte('date', firstOfMonth);

  if (reportsError) return res.status(500).json({ error: reportsError.message });

  const monthlySpendingPO = (monthlyPOs.data || []).reduce((sum, po) => sum + Number(po.total_actual || 0), 0);
  const monthlySpendingReports = (reportsThisMonth || []).reduce(
    (sum, r) => sum + Number(r.qty || 0) * Number(r.price_per_unit || 0),
    0
  );

  const monthlySpending = monthlySpendingPO + monthlySpendingReports;

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
