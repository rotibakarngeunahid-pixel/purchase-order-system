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

// Sumber utama: GET /reports/materials (public, semua bahan aktif)
async function fromMaterialsList() {
  const { ok, body } = await safeFetch(`${API_BASE()}/reports/materials`);
  if (!ok || body?.success !== true) return [];
  return (body.data || []).map((m) => ({
    bahan_id:   String(m.id),
    nama_bahan: m.name,
    kategori:   m.category || null,
    satuan:     m.unit || null,
  }));
}

// GET /api/inventori/bahan — semua bahan aktif dari sistem inventori
router.get('/', async (req, res) => {
  try {
    const data = await fromMaterialsList();
    res.json({ status: 'ok', data });
  } catch (_) {
    res.json({ status: 'ok', data: [] });
  }
});

module.exports = router;
