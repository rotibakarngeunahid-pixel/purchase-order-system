const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const { getReportingDate, resolveRotiReferenceDate } = require('../services/reportingDate');

// Stok roti tawar diambil dari Sistem Inventori BARU (Next.js REST API publik),
// menggantikan Google Apps Script lama. Pemetaan cabang & min stok kini dipusatkan
// di Master Data → Outlet (kolom inventori_cabang_name + min_stock_roti).
const API_BASE = () =>
  (process.env.INVENTORY_API_URL || 'https://inventory.rotibakarngeunah.my.id/api')
    .trim()
    .replace(/\/+$/, '');

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
  // Support legacy ?tanggal= param; prefer order_date / reference_date
  const orderDate = req.query.order_date || req.query.tanggal || getReportingDate();
  const referenceDate = req.query.reference_date || req.query.tanggal || resolveRotiReferenceDate(orderDate);

  // 1) Stok roti tawar semua cabang dari inventori baru utk tanggal referensi
  let rotiItems;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const url = `${API_BASE()}/dashboard/material-stock?date=${encodeURIComponent(referenceDate)}&q=${encodeURIComponent('roti tawar')}`;
    const resp = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    clearTimeout(timeout);
    const body = await resp.json().catch(() => null);
    if (!resp.ok || body?.success !== true) {
      return res.status(502).json({ error: body?.error?.message || `Sistem inventori error (${resp.status})` });
    }
    rotiItems = (body.data && body.data.items) || [];
  } catch (err) {
    const msg = err.name === 'AbortError'
      ? 'Sistem inventori tidak merespons (timeout).'
      : 'Sistem inventori tidak dapat dihubungi.';
    return res.status(502).json({ error: msg });
  }

  if (rotiItems.length === 0) {
    return res.status(422).json({
      error: `Data stok roti untuk tanggal referensi ${referenceDate} belum tersedia. Pastikan data sudah diinput di sistem inventori.`,
      order_date: orderDate,
      reference_date: referenceDate,
    });
  }

  // 2) Outlet aktif yang dipetakan ke cabang inventori + punya min stok roti
  const { data: outlets, error: outErr } = await supabase
    .from('outlets')
    .select('id, name, inventori_cabang_name, min_stock_roti, is_active')
    .eq('is_active', true);
  if (outErr) return res.status(500).json({ error: outErr.message });

  const eligible = (outlets || []).filter(
    (o) => o.inventori_cabang_name && Number(o.min_stock_roti) > 0
  );
  if (eligible.length === 0) {
    return res.status(400).json({
      error: 'Belum ada outlet dengan "Nama di Inventori" + "Min Stok Roti" terisi. Atur di Master Data → Outlet.',
    });
  }

  // 3) Map stok roti per nama cabang inventori (case-insensitive)
  const stockByBranchName = new Map();
  for (const it of rotiItems) {
    const key = String(it.branch_name || '').trim().toLowerCase();
    if (!key) continue;
    const val = Math.floor(Number(it.stock_end) || 0);
    // Jika ada >1 baris untuk satu cabang (mis. varian roti), jumlahkan.
    stockByBranchName.set(key, (stockByBranchName.get(key) || 0) + val);
  }

  // 4) Hitung kebutuhan per outlet
  const warnings = [];
  const branches = eligible.map((o) => {
    const invKey = String(o.inventori_cabang_name).trim().toLowerCase();
    const found = stockByBranchName.has(invKey);
    if (!found) {
      warnings.push(`Data stok cabang "${o.inventori_cabang_name}" (outlet ${o.name}) tidak ditemukan pada tanggal referensi ${referenceDate}.`);
    }
    const currentStock = found ? stockByBranchName.get(invKey) : 0;
    const minStock = Number(o.min_stock_roti) || 0;
    const need = Math.max(0, minStock - currentStock);
    return {
      inv_cabang_id: o.id,        // dipakai sebagai key unik di UI
      display_name: o.name,       // dicocokkan ke outlet di frontend
      current_stock: currentStock,
      min_stock: minStock,
      need,
      data_found: found,
    };
  });

  const totalNeeded = branches.reduce((sum, b) => sum + b.need, 0);
  const { order, bonus, fulfilled } = calcOptimalOrder(totalNeeded);

  res.json({
    order_date: orderDate,
    reference_date: referenceDate,
    tanggal: referenceDate, // backward compat
    total_needed: totalNeeded,
    optimal_order: order,
    bonus,
    fulfilled,
    branches,
    warnings,
  });
});

module.exports = router;
