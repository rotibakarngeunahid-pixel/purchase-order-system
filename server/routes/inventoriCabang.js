const express = require('express');
const router  = express.Router();

// Daftar cabang diambil dari Sistem Inventori BARU (Next.js + Supabase REST API),
// menggantikan integrasi lama Google Apps Script. Endpoint publik (tanpa API key).
const API_BASE = () =>
  (process.env.INVENTORY_API_URL || 'https://inventory.rotibakarngeunah.my.id/api')
    .trim()
    .replace(/\/+$/, '');

// GET /api/inventori/cabang — daftar cabang dari sistem inventori
router.get('/', async (req, res) => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(`${API_BASE()}/reports/branches`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const body = await resp.json().catch(() => null);
    if (!resp.ok || body?.success !== true) {
      const msg = body?.error?.message || `Sistem inventori error (${resp.status})`;
      return res.status(502).json({ error: msg });
    }
    // Pertahankan bentuk lama {cabang_id, nama_cabang} agar dropdown Master Data
    // → Outlet (CabangSelect) tidak perlu berubah.
    const data = (body.data || []).map((b) => ({ cabang_id: b.id, nama_cabang: b.name }));
    res.json({ status: 'ok', data });
  } catch (err) {
    const msg = err.name === 'AbortError'
      ? 'Sistem inventori tidak merespons (timeout).'
      : (err.message || 'Gagal menghubungi sistem inventori');
    res.status(502).json({ error: msg });
  }
});

module.exports = router;
