const express = require('express');
const router  = express.Router();

const API_BASE = () =>
  (process.env.INVENTORY_API_URL || 'https://inventory.rotibakarngeunah.my.id/api')
    .trim()
    .replace(/\/+$/, '');

// GET /api/inventori/bahan — daftar bahan dari sistem inventori
// Digunakan oleh Master Data → Bahan Baku untuk pilihan dropdown mapping.
// Jika sistem inventori tidak memiliki endpoint ini, kembalikan array kosong
// agar frontend jatuh ke fallback text-input manual.
router.get('/', async (req, res) => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(`${API_BASE()}/materials`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const body = await resp.json().catch(() => null);
    if (!resp.ok || body?.success !== true) {
      return res.json({ status: 'ok', data: [] });
    }
    const data = (body.data || []).map((b) => ({
      bahan_id:   String(b.id),
      nama_bahan: b.name || b.nama_bahan || String(b.id),
    }));
    res.json({ status: 'ok', data });
  } catch (_) {
    res.json({ status: 'ok', data: [] });
  }
});

module.exports = router;
