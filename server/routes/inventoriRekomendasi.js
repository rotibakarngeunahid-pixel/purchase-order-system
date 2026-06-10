const express = require('express');
const router  = express.Router();

const GAS_URL = () => (process.env.INVENTORI_GAS_URL || '').trim();
const GAS_KEY = () => (process.env.INVENTORI_API_KEY || '').trim();

// GET /api/inventori/rekomendasi?status=pending
router.get('/', async (req, res) => {
  const { status = 'pending', cabang_id, bahan_id } = req.query;
  const url = GAS_URL();
  const key = GAS_KEY();

  if (!url || !key) {
    console.warn('[inventoriRekomendasi] Env vars missing — GAS_URL set:', !!url, '| GAS_KEY set:', !!key);
    return res.status(503).json({
      error: 'Integrasi inventori belum dikonfigurasi.',
      detail: { gasUrl: !!url, gasKey: !!key },
    });
  }

  const params = new URLSearchParams({ action: 'getRekomendasiOrder', status, api_key: key });
  if (cabang_id) params.append('cabang_id', cabang_id);
  if (bahan_id)  params.append('bahan_id',  bahan_id);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(`${url}?${params.toString()}`, { signal: controller.signal });
    clearTimeout(timeout);
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    const msg = err.name === 'AbortError' ? 'Sistem inventori tidak merespons (timeout).' : (err.message || 'Gagal menghubungi sistem inventori');
    res.status(502).json({ error: msg });
  }
});

// POST /api/inventori/rekomendasi/process
router.post('/process', async (req, res) => {
  const { rekomendasi_ids, note } = req.body;
  const url = GAS_URL();
  const key = GAS_KEY();

  if (!url || !key) {
    return res.status(503).json({ error: 'Integrasi inventori belum dikonfigurasi.' });
  }
  if (!Array.isArray(rekomendasi_ids) || rekomendasi_ids.length === 0) {
    return res.status(400).json({ error: 'rekomendasi_ids wajib diisi.' });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'processRekomendasiOrder', api_key: key, rekomendasi_ids, note: note || '' }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    const msg = err.name === 'AbortError' ? 'Sistem inventori tidak merespons (timeout).' : (err.message || 'Gagal menghubungi sistem inventori');
    res.status(502).json({ error: msg });
  }
});

module.exports = router;
