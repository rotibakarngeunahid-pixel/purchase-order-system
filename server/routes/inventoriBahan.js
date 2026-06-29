const express = require('express');
const router  = express.Router();

const API_BASE = () =>
  (process.env.INVENTORY_API_URL || 'https://inventory.rotibakarngeunah.my.id/api')
    .trim()
    .replace(/\/+$/, '');

async function safeFetch(url, timeoutMs = 12000) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl.signal });
    clearTimeout(timer);
    const body = await resp.json().catch(() => null);
    return { ok: resp.ok, body };
  } catch (_) {
    clearTimeout(timer);
    return { ok: false, body: null };
  }
}

// Sumber 1: material-stock (tanpa filter q) → semua bahan yang punya stok hari ini.
// Ini yang menangkap bahan seperti "Roti Tawar" yang tidak pernah direkomendasikan.
async function fromMaterialStock() {
  const today = new Date().toISOString().split('T')[0];
  const { ok, body } = await safeFetch(`${API_BASE()}/dashboard/material-stock?date=${today}`);
  if (!ok || body?.success !== true) return new Map();
  const seen = new Map();
  for (const item of (body.data?.items || [])) {
    const id   = item.material_id != null ? String(item.material_id) : null;
    const name = item.material_name || item.name;
    if (id && name && !seen.has(id)) seen.set(id, { bahan_id: id, nama_bahan: name });
  }
  return seen;
}

// Sumber 2: recommendations (status=all) → bahan yang pernah direkomendasikan staf.
// Melengkapi sumber 1 jika ada bahan yang hari ini tidak punya stok.
async function fromRekomendasi() {
  const today   = new Date().toISOString().split('T')[0];
  const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const { ok, body } = await safeFetch(
    `${API_BASE()}/dashboard/recommendations?status=all&date_from=${yearAgo}&date_to=${today}`,
  );
  if (!ok || body?.success !== true) return new Map();
  const seen = new Map();
  for (const r of (body.data?.recommendations || [])) {
    if (r.material_id != null && !seen.has(String(r.material_id))) {
      seen.set(String(r.material_id), {
        bahan_id:   String(r.material_id),
        nama_bahan: r.material_name || String(r.material_id),
      });
    }
  }
  return seen;
}

// GET /api/inventori/bahan — gabungan kedua sumber, diurutkan alfabet
router.get('/', async (req, res) => {
  const [stockResult, rekomResult] = await Promise.allSettled([
    fromMaterialStock(),
    fromRekomendasi(),
  ]);

  const combined = new Map();
  if (stockResult.status === 'fulfilled') {
    for (const [id, bahan] of stockResult.value) combined.set(id, bahan);
  }
  if (rekomResult.status === 'fulfilled') {
    for (const [id, bahan] of rekomResult.value) {
      if (!combined.has(id)) combined.set(id, bahan);
    }
  }

  const data = Array.from(combined.values())
    .sort((a, b) => a.nama_bahan.localeCompare(b.nama_bahan, 'id'));

  res.json({ status: 'ok', data });
});

module.exports = router;
