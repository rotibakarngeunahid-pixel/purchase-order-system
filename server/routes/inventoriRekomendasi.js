const express = require('express');
const router  = express.Router();
const supabase = require('../services/supabase');

// Rekomendasi order staff diambil dari Sistem Inventori BARU (Next.js + Supabase
// REST API), menggantikan integrasi lama Google Apps Script. Endpoint publik.
const API_BASE = () =>
  (process.env.INVENTORY_API_URL || 'https://inventory.rotibakarngeunah.my.id/api')
    .trim()
    .replace(/\/+$/, '');

// Sistem inventori baru tidak menyimpan mapping bahan→material PO. Kita cocokkan
// berdasarkan NAMA bahan (case-insensitive), konsisten dengan cara outlet
// dipetakan ke cabang inventori lewat kolom "inventori_cabang_name".
async function loadPoMaterialMap() {
  const map = new Map();
  try {
    const { data, error } = await supabase.from('materials').select('id, name').eq('is_active', true);
    if (!error && Array.isArray(data)) {
      for (const m of data) {
        if (m && m.name) map.set(String(m.name).trim().toLowerCase(), { id: m.id, name: m.name });
      }
    }
  } catch (_) { /* mapping bersifat best-effort; jangan blokir panel */ }
  return map;
}

// GET /api/inventori/rekomendasi?status=pending&tanggal=YYYY-MM-DD
router.get('/', async (req, res) => {
  const { status = 'pending', cabang_id, bahan_id, tanggal } = req.query;
  try {
    const params = new URLSearchParams();
    if (tanggal) params.set('date', tanggal);
    const qs = params.toString();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(`${API_BASE()}/dashboard/recommendations${qs ? `?${qs}` : ''}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const body = await resp.json().catch(() => null);
    if (!resp.ok || body?.success !== true) {
      const msg = body?.error?.message || `Sistem inventori error (${resp.status})`;
      return res.status(502).json({ error: msg });
    }

    const rowsRaw = (body.data && body.data.recommendations) || [];
    const poMap = await loadPoMaterialMap();
    const statusFilter = String(status || 'pending').toLowerCase();

    const data = rowsRaw
      .filter((r) => {
        if (statusFilter !== 'all' && String(r.status || '').toLowerCase() !== statusFilter) return false;
        if (cabang_id && String(r.branch_id) !== String(cabang_id)) return false;
        if (bahan_id && String(r.material_id) !== String(bahan_id)) return false;
        return true;
      })
      .map((r) => {
        const matched = r.material_name ? poMap.get(String(r.material_name).trim().toLowerCase()) : null;
        return {
          rekomendasi_id:   String(r.id),
          tanggal:          r.report_date,
          cabang_id:        String(r.branch_id),
          nama_cabang:      r.branch_name || '',
          staff_id:         r.staff_id != null ? String(r.staff_id) : '',
          nama_staff:       r.staff_name || '',
          bahan_id:         String(r.material_id),
          nama_bahan:       r.material_name || '',
          tipe_stok:        r.input_type || 'foto',
          stok_akhir:       (r.stock_end !== null && r.stock_end !== undefined && r.stock_end !== '') ? Number(r.stock_end) : null,
          foto_url:         r.photo_url || '',
          timestamp:        r.created_at || null,
          status:           r.status || 'pending',
          processed_at:     r.processed_at || null,
          processed_note:   r.processed_note || '',
          po_material_id:   matched ? matched.id : null,
          po_material_name: matched ? matched.name : null,
        };
      });

    res.json({ status: 'ok', data });
  } catch (err) {
    const msg = err.name === 'AbortError' ? 'Sistem inventori tidak merespons (timeout).' : (err.message || 'Gagal menghubungi sistem inventori');
    res.status(502).json({ error: msg });
  }
});

// POST /api/inventori/rekomendasi/process
router.post('/process', async (req, res) => {
  const { rekomendasi_ids, note } = req.body;
  if (!Array.isArray(rekomendasi_ids) || rekomendasi_ids.length === 0) {
    return res.status(400).json({ error: 'rekomendasi_ids wajib diisi.' });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(`${API_BASE()}/dashboard/recommendations/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ids: rekomendasi_ids, note: note || '' }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const body = await resp.json().catch(() => null);
    if (!resp.ok || body?.success !== true) {
      const msg = body?.error?.message || `Sistem inventori error (${resp.status})`;
      return res.status(502).json({ error: msg });
    }
    res.json({ status: 'ok', processed: (body.data && body.data.processed) || 0 });
  } catch (err) {
    const msg = err.name === 'AbortError' ? 'Sistem inventori tidak merespons (timeout).' : (err.message || 'Gagal menghubungi sistem inventori');
    res.status(502).json({ error: msg });
  }
});

module.exports = router;
