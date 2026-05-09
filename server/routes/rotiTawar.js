const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const { getReportingDate } = require('../services/reportingDate');

const GAS_BASE = 'https://script.google.com/macros/s/AKfycbxEqwArPOXtQbAOoMSWoYRiUAUHZK3cCRecxxH39_SKpixUEy90WL20q5HqGf6hgFi4/exec';

function calcOptimalOrder(totalNeeded) {
  if (totalNeeded <= 0) return { order: 0, bonus: 0, fulfilled: 0 };
  if (totalNeeded < 20) return { order: totalNeeded, bonus: 0, fulfilled: totalNeeded };
  let optimal = totalNeeded;
  for (let q = totalNeeded; q >= 1; q--) {
    if (q + Math.floor(q / 20) >= totalNeeded) optimal = q;
    else break;
  }
  const bonus = Math.floor(optimal / 20);
  return { order: optimal, bonus, fulfilled: optimal + bonus };
}

// GET /api/roti-tawar/preview
router.get('/preview', async (req, res) => {
  const tanggal = req.query.tanggal || getReportingDate();

  // Fetch stok dari GAS API (server-side)
  let gasData;
  try {
    const gasRes = await fetch(`${GAS_BASE}?action=getDashboard&tanggal=${tanggal}`, {
      signal: AbortSignal.timeout(15000),
    });
    const gasJson = await gasRes.json();
    if (gasJson.status !== 'ok' || !Array.isArray(gasJson.data)) {
      throw new Error('Unexpected GAS response');
    }
    gasData = gasJson.data;
  } catch (err) {
    return res.status(502).json({ error: 'GAS API unreachable' });
  }

  // Filter hanya baris roti tawar
  const rotiRows = gasData.filter((row) =>
    String(row.nama_bahan || '').toLowerCase().includes('roti tawar')
  );

  // Load mapping aktif
  const { data: mappings, error: mapErr } = await supabase
    .from('roti_branch_mapping')
    .select('inv_cabang_id, display_name')
    .eq('is_active', true);

  if (mapErr) return res.status(500).json({ error: mapErr.message });
  if (!mappings || mappings.length === 0) {
    return res.status(400).json({ error: 'No active branch mapping' });
  }

  // Load min_stock
  const { data: stocks, error: stockErr } = await supabase
    .from('roti_min_stock')
    .select('inv_cabang_id, min_stock');

  if (stockErr) return res.status(500).json({ error: stockErr.message });

  const stockMap = {};
  (stocks || []).forEach((s) => { stockMap[s.inv_cabang_id] = s.min_stock; });

  const hasMinStock = mappings.some((m) => stockMap[m.inv_cabang_id] != null);
  if (!hasMinStock) {
    return res.status(400).json({ error: 'No min stock configured' });
  }

  // Hitung need per cabang
  const branches = mappings.map((m) => {
    const gasRow = rotiRows.find((r) => r.cabang_id === m.inv_cabang_id);
    const currentStock = gasRow ? Math.floor(Number(gasRow.stok_akhir)) : 0;
    const minStock = stockMap[m.inv_cabang_id] ?? 0;
    const need = Math.max(0, minStock - currentStock);
    return {
      inv_cabang_id: m.inv_cabang_id,
      display_name: m.display_name,
      current_stock: currentStock,
      min_stock: minStock,
      need,
    };
  });

  const totalNeeded = branches.reduce((sum, b) => sum + b.need, 0);
  const { order, bonus, fulfilled } = calcOptimalOrder(totalNeeded);

  res.json({
    tanggal,
    total_needed: totalNeeded,
    optimal_order: order,
    bonus,
    fulfilled,
    branches,
  });
});

// GET /api/roti-tawar/mapping
router.get('/mapping', async (req, res) => {
  const { data: mappings, error: mapErr } = await supabase
    .from('roti_branch_mapping')
    .select('id, inv_cabang_id, display_name, is_active, created_at')
    .order('created_at', { ascending: true });

  if (mapErr) return res.status(500).json({ error: mapErr.message });

  const { data: stocks, error: stockErr } = await supabase
    .from('roti_min_stock')
    .select('inv_cabang_id, min_stock');

  if (stockErr) return res.status(500).json({ error: stockErr.message });

  const stockMap = {};
  (stocks || []).forEach((s) => { stockMap[s.inv_cabang_id] = s.min_stock; });

  const result = (mappings || []).map((row) => ({
    id: row.id,
    inv_cabang_id: row.inv_cabang_id,
    display_name: row.display_name,
    is_active: row.is_active,
    min_stock: stockMap[row.inv_cabang_id] ?? 0,
  }));

  res.json(result);
});

// PUT /api/roti-tawar/mapping
router.put('/mapping', async (req, res) => {
  const { mappings } = req.body;
  if (!Array.isArray(mappings) || mappings.length === 0) {
    return res.status(400).json({ error: 'mappings array wajib diisi' });
  }

  // Upsert roti_branch_mapping
  const branchRows = mappings.map(({ inv_cabang_id, display_name, is_active }) => ({
    inv_cabang_id,
    display_name,
    is_active: is_active ?? true,
  }));

  const { error: mapErr } = await supabase
    .from('roti_branch_mapping')
    .upsert(branchRows, { onConflict: 'inv_cabang_id' });

  if (mapErr) return res.status(500).json({ error: mapErr.message });

  // Upsert roti_min_stock
  const stockRows = mappings.map(({ inv_cabang_id, min_stock }) => ({
    inv_cabang_id,
    min_stock: Number(min_stock) || 0,
    updated_at: new Date().toISOString(),
  }));

  const { error: stockErr } = await supabase
    .from('roti_min_stock')
    .upsert(stockRows, { onConflict: 'inv_cabang_id' });

  if (stockErr) return res.status(500).json({ error: stockErr.message });

  res.json({ success: true });
});

// GET /api/roti-tawar/inventory-branches
router.get('/inventory-branches', async (req, res) => {
  try {
    const gasRes = await fetch(`${GAS_BASE}?action=getCabang`, {
      signal: AbortSignal.timeout(15000),
    });
    const gasJson = await gasRes.json();
    res.json(gasJson);
  } catch (err) {
    res.status(502).json({ error: 'GAS API unreachable' });
  }
});

module.exports = router;
