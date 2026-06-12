const express = require('express');
const router  = express.Router();

const GAS_URL = () => (process.env.INVENTORI_GAS_URL || '').trim();
const GAS_KEY = () => (process.env.INVENTORI_API_KEY || '').trim();

// GET /api/inventori/cabang — daftar cabang dari sistem inventori
router.get('/', async (req, res) => {
  const url = GAS_URL();
  const key = GAS_KEY();

  if (!url || !key) {
    return res.status(503).json({ error: 'Integrasi inventori belum dikonfigurasi.' });
  }

  const params = new URLSearchParams({ action: 'getCabang', api_key: key });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(`${url}?${params.toString()}`, { signal: controller.signal });
    clearTimeout(timeout);
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    const msg = err.name === 'AbortError'
      ? 'Sistem inventori tidak merespons (timeout).'
      : (err.message || 'Gagal menghubungi sistem inventori');
    res.status(502).json({ error: msg });
  }
});

module.exports = router;
