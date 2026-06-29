const express = require('express');
const router  = express.Router();

const API_BASE = () =>
  (process.env.INVENTORY_API_URL || 'https://inventory.rotibakarngeunah.my.id/api')
    .trim()
    .replace(/\/+$/, '');

// Ekstrak bahan unik dari rekomendasi (1 tahun ke belakang, semua status).
// Lebih andal daripada endpoint /materials yang belum tentu ada.
async function fetchFromRekomendasi() {
  const today    = new Date().toISOString().split('T')[0];
  const yearAgo  = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const url      = `${API_BASE()}/dashboard/recommendations?status=all&date_from=${yearAgo}&date_to=${today}`;
  const ctrl     = new AbortController();
  const timer    = setTimeout(() => ctrl.abort(), 15000);
  const resp     = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl.signal });
  clearTimeout(timer);
  const body = await resp.json().catch(() => null);
  if (!resp.ok || body?.success !== true) return [];
  const seen = new Map();
  for (const r of (body.data?.recommendations || [])) {
    if (r.material_id != null && !seen.has(String(r.material_id))) {
      seen.set(String(r.material_id), {
        bahan_id:   String(r.material_id),
        nama_bahan: r.material_name || String(r.material_id),
      });
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.nama_bahan.localeCompare(b.nama_bahan, 'id'));
}

// GET /api/inventori/bahan — daftar bahan unik dari sistem inventori
router.get('/', async (req, res) => {
  try {
    const data = await fetchFromRekomendasi();
    res.json({ status: 'ok', data });
  } catch (_) {
    res.json({ status: 'ok', data: [] });
  }
});

module.exports = router;
