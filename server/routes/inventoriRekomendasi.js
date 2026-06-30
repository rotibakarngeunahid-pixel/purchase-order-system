const express = require('express');
const router  = express.Router();
const supabase = require('../services/supabase');

// Rekomendasi order staff diambil dari Sistem Inventori BARU (Next.js + Supabase
// REST API), menggantikan integrasi lama Google Apps Script. Endpoint publik.
const API_BASE = () =>
  (process.env.INVENTORY_API_URL || 'https://inventory.rotibakarngeunah.my.id/api')
    .trim()
    .replace(/\/+$/, '');

// Normalisasi nama untuk fallback pencocokan: lowercase, buang tanda baca,
// rapatkan spasi. "Susu Kental Manis!" → "susu kental manis".
const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// true bila `needle` muncul sebagai urutan kata utuh di dalam `haystack`.
// "susu" ⊂ "susu kental manis" → true; "es" ⊄ "keju" → false.
const wordContains = (haystack, needle) =>
  !!needle && (` ${haystack} `).includes(` ${needle} `);

// ── Mapping Outlet PO ← cabang Inventori ───────────────────────────────────────
// Prioritas: outlets.inventori_branch_id (ID, sumber kebenaran utama) →
// fallback nama (inventori_cabang_name atau nama outlet) yang dinormalisasi.
async function loadOutletMap() {
  const byId = new Map();
  const byName = new Map();
  try {
    const { data, error } = await supabase.from('outlets').select('*').eq('is_active', true);
    if (!error && Array.isArray(data)) {
      for (const o of data) {
        const entry = { id: o.id, name: o.name };
        if (o.inventori_branch_id) byId.set(String(o.inventori_branch_id), entry);
        const labelKey = norm(o.inventori_cabang_name);
        if (labelKey && !byName.has(labelKey)) byName.set(labelKey, entry);
        const selfKey = norm(o.name);
        if (selfKey && !byName.has(selfKey)) byName.set(selfKey, entry);
      }
    }
  } catch (_) { /* best-effort; jangan blokir panel */ }
  return { byId, byName };
}

function matchOutlet(rec, map) {
  const bid = rec.branch_id != null ? String(rec.branch_id) : '';
  if (bid && map.byId.has(bid)) return { ...map.byId.get(bid), source: 'branch_id' };
  const nameKey = norm(rec.branch_name);
  if (nameKey && map.byName.has(nameKey)) return { ...map.byName.get(nameKey), source: 'name_fallback' };
  return null;
}

// ── Mapping Bahan PO ← bahan Inventori ──────────────────────────────────────────
// Prioritas: materials.inventory_material_id (ID) → nama persis (normalisasi) →
// kecocokan kata utuh yang UNIK (mis. "Susu" → "Susu Kental Manis").
async function loadPoMaterialMap() {
  const byInvId = new Map();
  const byNorm = new Map();
  const list = [];
  try {
    const { data, error } = await supabase.from('materials').select('*').eq('is_active', true);
    if (!error && Array.isArray(data)) {
      for (const m of data) {
        if (!m || !m.name) continue;
        const entry = { id: m.id, name: m.name, _norm: norm(m.name) };
        list.push(entry);
        if (m.inventory_material_id) byInvId.set(String(m.inventory_material_id), entry);
        if (!byNorm.has(entry._norm)) byNorm.set(entry._norm, entry);
      }
    }
  } catch (_) { /* best-effort */ }
  return { byInvId, byNorm, list };
}

function matchMaterial(rec, map) {
  const invId = rec.material_id != null ? String(rec.material_id) : '';
  if (invId && map.byInvId.has(invId)) {
    const m = map.byInvId.get(invId);
    return { id: m.id, name: m.name, source: 'material_id' };
  }
  const nameKey = norm(rec.material_name);
  if (!nameKey) return null;
  if (map.byNorm.has(nameKey)) {
    const m = map.byNorm.get(nameKey);
    return { id: m.id, name: m.name, source: 'exact' };
  }
  // Kecocokan kata utuh unik (hindari ambiguitas seperti "Keju" → banyak varian).
  const candidates = map.list.filter(
    (m) => wordContains(m._norm, nameKey) || wordContains(nameKey, m._norm),
  );
  if (candidates.length === 1) {
    return { id: candidates[0].id, name: candidates[0].name, source: 'name_fallback' };
  }
  return null;
}

// GET /api/inventori/rekomendasi
//   ?status=pending|processed|all
//   &date_from=YYYY-MM-DD&date_to=YYYY-MM-DD   (queue lintas tanggal)
//   &tanggal=YYYY-MM-DD                         (kompat lama, 1 hari)
//   &cabang_id=<inventory branch id>&bahan_id=<inventory material id>
router.get('/', async (req, res) => {
  const { status = 'pending', cabang_id, bahan_id, tanggal, date_from, date_to } = req.query;
  try {
    const params = new URLSearchParams();
    params.set('status', String(status));
    params.set('per_page', '500');   // minta semua sekaligus; cegah pagination tersembunyi
    params.set('limit', '500');      // fallback nama param lain yang umum
    if (date_from) params.set('date_from', String(date_from));
    if (date_to) params.set('date_to', String(date_to));
    if (tanggal) params.set('date', String(tanggal));
    if (cabang_id) params.set('branch_id', String(cabang_id));
    if (bahan_id) params.set('material_id', String(bahan_id));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(`${API_BASE()}/dashboard/recommendations?${params.toString()}`, {
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
    const meta = (body.data && body.data.meta) || null;
    // total item di API (untuk deteksi pagination tersembunyi)
    const apiTotal = meta?.total ?? meta?.count ?? meta?.totalCount ?? rowsRaw.length;
    const [outletMap, poMatMap] = await Promise.all([loadOutletMap(), loadPoMaterialMap()]);

    let unmappedBranch = 0;
    let unmappedMaterial = 0;

    const data = rowsRaw.map((r) => {
      const outlet = matchOutlet(r, outletMap);
      const material = matchMaterial(r, poMatMap);
      if (!outlet) unmappedBranch++;
      if (!material) unmappedMaterial++;
      return {
        rekomendasi_id:        String(r.id),
        tanggal:               r.report_date,
        cabang_id:             r.branch_id   != null ? String(r.branch_id)   : null,
        nama_cabang:           r.branch_name || '',
        staff_id:              r.staff_id    != null ? String(r.staff_id)    : '',
        nama_staff:            r.staff_name || '',
        bahan_id:              r.material_id != null ? String(r.material_id) : null,
        nama_bahan:            r.material_name || '',
        tipe_stok:             r.input_type || 'foto',
        stok_akhir:            (r.stock_end !== null && r.stock_end !== undefined && r.stock_end !== '') ? Number(r.stock_end) : null,
        foto_url:              r.photo_url || '',
        timestamp:             r.created_at || null,
        status:                r.status || 'pending',
        processed_at:          r.processed_at || null,
        processed_note:        r.processed_note || '',
        // Mapping outlet (cabang asal rekomendasi)
        po_outlet_id:          outlet ? outlet.id : null,
        po_outlet_name:        outlet ? outlet.name : null,
        branch_mapping_source: outlet ? outlet.source : null,
        // Mapping bahan
        po_material_id:        material ? material.id : null,
        po_material_name:      material ? material.name : null,
        material_mapping_source: material ? material.source : null,
      };
    });

    res.json({
      status: 'ok',
      meta: {
        ...(meta || {}),
        returned: data.length,
        total_in_api: apiTotal,
        truncated: rowsRaw.length < apiTotal,
        unmapped_branch: unmappedBranch,
        unmapped_material: unmappedMaterial,
      },
      data,
    });
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
