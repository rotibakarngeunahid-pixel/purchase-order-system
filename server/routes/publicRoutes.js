const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const multer = require('multer');
// Supabase Storage digunakan sebagai backend upload foto distribusi.
const { cleanupOldDistributionPhotos } = require('../services/photoCleanup');
const {
  processAndWatermark,
  getWITATime,
  isSharpAvailable,
} = require('../services/photoWatermark');

// ── Upload helpers ──────────────────────────────────────────────────────────

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return cb(null, true);
    const err = new Error('FORMAT_NOT_SUPPORTED');
    err.code = 'FORMAT_NOT_SUPPORTED';
    cb(err);
  },
});

function randomStr(n) {
  return Array.from({ length: n }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
}

let distribusiBucketReady = false;
async function ensureDistribusiBucket() {
  if (distribusiBucketReady) return;
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!(buckets || []).some((b) => b.name === 'distribusi')) {
      await supabase.storage.createBucket('distribusi', { public: true });
    }
    distribusiBucketReady = true;
  } catch (err) {
    console.error('[DistPhotos] Bucket init error:', err.message);
  }
}

// Foto bukti dibatasi 1x per cabang per hari — cari record yang sudah ada
async function findExistingPhotos(branch, date) {
  const { data, error } = await supabase
    .from('distribution_photos')
    .select('photos, uploaded_at')
    .eq('branch', branch)
    .eq('date', date)
    .order('uploaded_at', { ascending: true });

  if (error) throw error;

  const records = data || [];
  if (records.length === 0) return null;
  return {
    photos: records.flatMap((r) => r.photos || []),
    uploaded_at: records[0].uploaded_at,
  };
}

const FINAL_RECEIPT_STATUSES = ['received', 'received_partial'];

function isRotiTawar(name) {
  return String(name || '').toLowerCase().includes('roti tawar');
}

function getDistributionAvailableQty(materialName, receivedQty) {
  const received = Number(receivedQty || 0);
  if (received <= 0) return 0;
  if (isRotiTawar(materialName)) {
    return received + Math.floor(received / 20);
  }
  return received;
}

function buildAvailabilityMap(receiptItems) {
  return (receiptItems || []).reduce((map, item) => {
    const materialId = item.material_id;
    if (!materialId) return map;

    if (!map[materialId]) {
      map[materialId] = {
        total_received: 0,
        has_final_receipt: false,
        material_name: item.material?.name || null,
      };
    }

    map[materialId].total_received += Number(item.qty_received || 0);
    map[materialId].has_final_receipt = true;
    if (!map[materialId].material_name && item.material?.name) {
      map[materialId].material_name = item.material.name;
    }
    return map;
  }, {});
}

function isMissingSourceColumnError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('source') && (
    message.includes('column') ||
    message.includes('schema cache') ||
    message.includes('could not find')
  );
}

// Bangun map distribusi cabang: { [outlet_id]: { [material_id]: qty } }
// Sumber: purchase_item_branch_distribution yang tersimpan saat catat penerimaan
async function getBranchDistributionMap(sessionId) {
  const { data: finalPOs, error: poError } = await supabase
    .from('purchase_orders')
    .select('id')
    .eq('session_id', sessionId)
    .in('status', FINAL_RECEIPT_STATUSES);

  if (poError) throw poError;
  const finalPOIds = (finalPOs || []).map((po) => po.id).filter(Boolean);
  if (finalPOIds.length === 0) return {};

  const { data: poItems, error: itemsError } = await supabase
    .from('purchase_order_items')
    .select('id, material_id, branch_distributions:purchase_item_branch_distribution(outlet_id, qty)')
    .in('po_id', finalPOIds)
    .or('source.eq.ordered,source.is.null');

  if (itemsError) {
    // Tabel belum ada (migration belum dijalankan) — kembalikan map kosong
    if (String(itemsError.message || '').toLowerCase().includes('purchase_item_branch_distribution')) {
      return {};
    }
    throw itemsError;
  }

  // map: { [outlet_id]: { [material_id]: qty } }
  const map = {};
  (poItems || []).forEach((poItem) => {
    (poItem.branch_distributions || []).forEach((d) => {
      if (!map[d.outlet_id]) map[d.outlet_id] = {};
      map[d.outlet_id][poItem.material_id] =
        (map[d.outlet_id][poItem.material_id] || 0) + Number(d.qty || 0);
    });
  });

  return map;
}

async function getReceiptAvailabilityMap(sessionId) {
  const { data: finalPOs, error: poError } = await supabase
    .from('purchase_orders')
    .select('id')
    .eq('session_id', sessionId)
    .in('status', FINAL_RECEIPT_STATUSES);

  if (poError) throw poError;

  const finalPOIds = (finalPOs || []).map((po) => po.id).filter(Boolean);
  if (finalPOIds.length === 0) return {};

  let receiptQuery = supabase
    .from('purchase_order_items')
    .select('material_id, qty_received, source, material:materials(id, name)')
    .in('po_id', finalPOIds)
    .or('source.eq.ordered,source.is.null');

  let { data: receiptItems, error: receiptError } = await receiptQuery;

  if (receiptError && isMissingSourceColumnError(receiptError)) {
    const retry = await supabase
      .from('purchase_order_items')
      .select('material_id, qty_received')
      .in('po_id', finalPOIds);

    receiptItems = retry.data;
    receiptError = retry.error;
  }

  if (receiptError) throw receiptError;
  return buildAvailabilityMap(receiptItems);
}

async function getPurchaseReportDistributionItems(date) {
  const { data, error } = await supabase
    .from('purchase_report')
    .select(`
      id, outlet_id, material_id, qty, unit, notes,
      outlet:outlets(id, name),
      material:materials(id, name, purchase_unit)
    `)
    .eq('date', date)
    .gt('qty', 0);

  if (error) throw error;

  return (data || []).map((item) => ({
    outlet: item.outlet,
    item: {
      id: `purchase-report-${item.id}`,
      outlet_id: item.outlet_id,
      material_id: item.material_id,
      material_name: item.material?.name,
      purchase_unit: item.unit || item.material?.purchase_unit,
      qty: item.qty,
      source: 'purchase_report',
      notes: item.notes || null,
    },
  }));
}

// Bahan tambahan (source=adjustment) dipecah PER CABANG sesuai distribusi yang
// tersimpan, agar muncul di tab tiap cabang (Buduk, Pemogan, dst.) — bukan satu
// grup "Bahan Menyusul" terpisah. Tiap baris = (bahan tambahan × cabang).
async function getAdjustmentBranchItems(sessionId) {
  const { data: finalPOs, error: poError } = await supabase
    .from('purchase_orders')
    .select('id')
    .eq('session_id', sessionId)
    .in('status', FINAL_RECEIPT_STATUSES);

  if (poError) throw poError;

  const finalPOIds = (finalPOs || []).map((po) => po.id).filter(Boolean);
  if (finalPOIds.length === 0) return [];

  const { data, error } = await supabase
    .from('purchase_order_items')
    .select(`
      id, po_id, material_id, qty_received, source, adjustment_note, variant_id,
      material:materials(id, name, purchase_unit),
      branch_distributions:purchase_item_branch_distribution(outlet_id, qty, outlet:outlets(id, name))
    `)
    .in('po_id', finalPOIds)
    .eq('source', 'adjustment')
    .gt('qty_received', 0);

  if (error && isMissingSourceColumnError(error)) return [];
  // Tabel distribusi belum ada (migration belum jalan) → jangan gagalkan halaman
  if (error && String(error.message || '').toLowerCase().includes('purchase_item_branch_distribution')) {
    return [];
  }
  if (error) throw error;

  const rows = [];
  (data || []).forEach((item) => {
    (item.branch_distributions || []).forEach((dist) => {
      const qty = Number(dist.qty || 0);
      if (!dist.outlet_id || qty <= 0) return;
      rows.push({
        outlet: dist.outlet || { id: dist.outlet_id, name: dist.outlet_id },
        item: {
          // ID unik per (item × cabang) agar checklist & key tidak bentrok antar tab
          id: `adjustment-${item.id}-${dist.outlet_id}`,
          material_id: item.material_id,
          material_name: item.material?.name,
          purchase_unit: item.material?.purchase_unit,
          qty,
          source: 'adjustment',
          adjustment_note: item.adjustment_note || null,
        },
      });
    });
  });

  return rows;
}

// Distribusi: publik, tidak perlu login
router.get('/distribution', async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];

  let purchaseReportItems = [];
  try {
    purchaseReportItems = await getPurchaseReportDistributionItems(date);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }

  const { data: session, error: sessionError } = await supabase
    .from('order_sessions')
    .select('id, order_date, status')
    .eq('order_date', date)
    .maybeSingle();

  if (sessionError) return res.status(500).json({ error: sessionError.message });
  if (!session && purchaseReportItems.length === 0) {
    return res.json({ date, session: null, outlets: [] });
  }

  let items = [];
  if (session) {
    const { data: requestItems, error: itemsError } = await supabase
      .from('order_request_items')
      .select('*, outlet:outlets(id, name), material:materials(id, name, purchase_unit)')
      .eq('session_id', session.id)
      .gt('qty', 0)
      .order('outlet_id');

    if (itemsError) return res.status(500).json({ error: itemsError.message });
    items = requestItems || [];
  }

  let availabilityMap = {};
  let branchDistMap = {};
  if (session) {
    try {
      availabilityMap = await getReceiptAvailabilityMap(session.id);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
    try {
      branchDistMap = await getBranchDistributionMap(session.id);
    } catch {
      // Non-fatal: jika gagal, fallback ke logika order_request_items
    }
  }

  // material_id mana saja yang sudah punya distribusi cabang (mapping manual)
  const materialIdsWithDist = new Set();
  Object.values(branchDistMap).forEach((outletDist) => {
    Object.keys(outletDist).forEach((mid) => materialIdsWithDist.add(mid));
  });

  const outletMap = {};
  const remainingAvailabilityByMaterial = {};

  function getRemainingAvailability(item) {
    const availability = availabilityMap[item.material_id];
    if (!availability?.has_final_receipt) return null;

    if (remainingAvailabilityByMaterial[item.material_id] === undefined) {
      remainingAvailabilityByMaterial[item.material_id] = getDistributionAvailableQty(
        availability.material_name || item.material?.name,
        availability.total_received,
      );
    }

    return remainingAvailabilityByMaterial[item.material_id];
  }

  (items || []).forEach((item) => {
    const availability = availabilityMap[item.material_id];
    let displayQty = Number(item.qty || 0);
    let availabilityLimited = false;

    if (materialIdsWithDist.has(item.material_id)) {
      // Pakai distribusi cabang yang sudah di-mapping secara manual
      displayQty = branchDistMap[item.outlet_id]?.[item.material_id] ?? 0;
      // Outlet yang tidak mendapat distribusi dilewati
      if (displayQty <= 0) return;
    } else if (availability?.has_final_receipt) {
      // Belum ada distribusi manual: bagi otomatis berdasarkan qty diterima
      const remainingAvailability = getRemainingAvailability(item);
      if (remainingAvailability <= 0) return;

      displayQty = Math.min(displayQty, remainingAvailability);
      remainingAvailabilityByMaterial[item.material_id] = remainingAvailability - displayQty;
      availabilityLimited = displayQty < Number(item.qty || 0);
    }

    if (displayQty <= 0) return;

    const oid = item.outlet_id;
    if (!outletMap[oid]) {
      outletMap[oid] = { outlet: item.outlet, items: [] };
    }
    outletMap[oid].items.push({
      id: item.id,
      material_id: item.material_id,
      material_name: item.material?.name,
      purchase_unit: item.material?.purchase_unit,
      qty: displayQty,
      requested_qty: item.qty,
      availability_limited: availabilityLimited,
      source: 'ordered',
    });
  });

  purchaseReportItems.forEach(({ outlet, item }) => {
    if (!outlet?.id) return;
    const oid = item.outlet_id || outlet.id;
    if (!outletMap[oid]) {
      outletMap[oid] = { outlet, items: [] };
    }
    outletMap[oid].items.push(item);
  });

  // Bahan tambahan: masukkan ke tab cabang masing-masing sesuai distribusi tersimpan
  if (session) {
    try {
      const adjustmentBranchItems = await getAdjustmentBranchItems(session.id);
      adjustmentBranchItems.forEach(({ outlet, item }) => {
        const oid = outlet?.id;
        if (!oid) return;
        if (!outletMap[oid]) outletMap[oid] = { outlet, items: [] };
        outletMap[oid].items.push(item);
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  const outlets = Object.values(outletMap);

  res.json({
    date,
    session: session || { id: null, order_date: date, status: 'purchase_report' },
    outlets,
    availability_applied: true,
    purchase_report_applied: true,
  });
});

// Outlet aktif: publik, untuk dropdown di halaman distribusi
router.get('/outlets', async (req, res) => {
  const configError = supabase.getConfigError?.();
  if (configError) return res.status(500).json({ error: configError });

  try {
    const { data, error } = await supabase
      .from('outlets')
      .select('id, name')
      .eq('is_active', true)
      .order('name');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: `Gagal menghubungi Supabase: ${error.message}` });
  }
});

// Data setup POS: outlet + material — untuk auto-populate mapping di admin POS
// Tidak butuh auth karena hanya berisi nama dan UUID (bukan data sensitif)
router.get('/pos-setup-data', async (req, res) => {
  const configError = supabase.getConfigError?.();
  if (configError) return res.status(500).json({ error: configError });

  let outletsRes;
  let materialsRes;
  try {
    [outletsRes, materialsRes] = await Promise.all([
      supabase.from('outlets').select('id, name').eq('is_active', true).order('name'),
      supabase.from('materials').select('id, name, purchase_unit').eq('is_active', true).order('name'),
    ]);
  } catch (error) {
    return res.status(500).json({ error: `Gagal menghubungi Supabase: ${error.message}` });
  }

  if (outletsRes.error) return res.status(500).json({ error: outletsRes.error.message });
  if (materialsRes.error) return res.status(500).json({ error: materialsRes.error.message });

  res.json({
    outlets:   outletsRes.data  || [],
    materials: materialsRes.data || [],
  });
});

// ── POST /api/public/distribution/upload-photo ─────────────────────────────
// Upload photo proof (public — Distribution Listing page has no staff auth)
router.post('/distribution/upload-photo', (req, res) => {
  uploadMiddleware.array('photos', 1)(req, res, async (err) => {
    if (err) {
      if (err.code === 'FORMAT_NOT_SUPPORTED' || err.message === 'FORMAT_NOT_SUPPORTED') {
        return res.status(400).json({ error: 'Format tidak didukung. Gunakan JPG, PNG, atau WebP.' });
      }
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Foto terlalu besar. Maksimal 10MB.' });
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ error: 'Maksimal 1 foto per pengiriman.' });
      }
      return res.status(400).json({ error: err.message });
    }

    const { branch, date } = req.body;
    const files = req.files || [];

    if (!branch) return res.status(400).json({ error: 'Parameter branch wajib diisi.' });
    if (files.length === 0) return res.status(400).json({ error: 'Foto harus diunggah.' });

    const witaNow = getWITATime();
    const year = String(witaNow.getUTCFullYear());
    const month = String(witaNow.getUTCMonth() + 1).padStart(2, '0');
    const day = String(witaNow.getUTCDate()).padStart(2, '0');
    const hour = String(witaNow.getUTCHours()).padStart(2, '0');
    const min = String(witaNow.getUTCMinutes()).padStart(2, '0');
    const photoDate = date || `${year}-${month}-${day}`;
    const branchSlug = branch.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Satu foto bukti per cabang per hari — tolak jika sudah pernah kirim
    try {
      const existing = await findExistingPhotos(branch, photoDate);
      if (existing) {
        return res.status(409).json({
          error: 'Foto bukti untuk cabang ini sudah dikirim hari ini.',
          already_uploaded: true,
          ...existing,
        });
      }
    } catch (checkErr) {
      console.error('[DistPhotos] Pre-upload check error:', checkErr.message);
      return res.status(500).json({ error: 'Gagal memeriksa status foto. Coba lagi.' });
    }

    await ensureDistribusiBucket();

    const results = [];
    const errors = [];

    const EXT_BY_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      let buffer = file.buffer;
      // Jika konversi gagal, simpan file asli dengan ekstensi & content-type aslinya
      let converted = false;
      try {
        try {
          buffer = await processAndWatermark(file.buffer, branch, witaNow);
          converted = isSharpAvailable();
        } catch (convErr) {
          console.error('[DistPhotos] WebP conversion error, using original:', convErr.message);
        }

        const ext = converted ? 'webp' : (EXT_BY_MIME[file.mimetype] || 'jpg');
        const contentType = converted ? 'image/webp' : file.mimetype;
        const filename = `${branchSlug}_${year}${month}${day}_${hour}${min}_${randomStr(4)}.${ext}`;
        const storagePath = `${branchSlug}/${year}/${month}/${filename}`;

        const { error: uploadErr } = await supabase.storage
          .from('distribusi')
          .upload(storagePath, buffer, { contentType, upsert: false });

        if (uploadErr) throw uploadErr;

        const { data: urlData } = supabase.storage.from('distribusi').getPublicUrl(storagePath);
        results.push({ url: urlData.publicUrl, filename });
      } catch (photoErr) {
        console.error(`[DistPhotos] Photo ${i + 1} failed:`, photoErr.message);
        errors.push({ index: i, message: photoErr.message });
      }
    }

    if (results.length === 0) {
      return res.status(500).json({
        error: 'Gagal mengirim foto. Periksa koneksi dan coba lagi.',
        errors,
      });
    }

    // Save record to DB
    let sessionId = null;
    try {
      const { data: session } = await supabase
        .from('order_sessions')
        .select('id')
        .eq('order_date', photoDate)
        .maybeSingle();
      sessionId = session?.id || null;
    } catch {}

    // supabase-js tidak melempar exception — error harus dicek dari return value.
    // Tanpa record ini foto tidak akan terlihat oleh admin, jadi gagal = fatal.
    const { error: dbError } = await supabase.from('distribution_photos').insert({
      branch,
      date: photoDate,
      uploaded_at: new Date().toISOString(),
      photos: results,
      distribution_session_id: sessionId,
    });

    if (dbError) {
      // 23505 = unique violation (race dua upload bersamaan) → perlakukan sebagai sudah terkirim
      if (dbError.code === '23505') {
        const existing = await findExistingPhotos(branch, photoDate).catch(() => null);
        return res.status(409).json({
          error: 'Foto bukti untuk cabang ini sudah dikirim hari ini.',
          already_uploaded: true,
          ...(existing || { photos: [], uploaded_at: null }),
        });
      }
      console.error('[DistPhotos] DB save error:', dbError.message);
      return res.status(500).json({
        error: 'Foto terunggah tapi gagal tercatat di arsip admin. Coba kirim ulang.',
      });
    }

    res.json({
      success: true,
      uploaded: results.length,
      failed: errors.length,
      photos: results,
      ...(errors.length > 0 && { errors }),
    });

    // Hapus otomatis foto > 7 hari setelah setiap upload (fire-and-forget)
    cleanupOldDistributionPhotos().catch((err) =>
      console.error('[DistPhotos] Background cleanup error:', err.message)
    );
  });
});

// GET /api/public/distribution/photo-status?branch=&date=
// Cek apakah cabang sudah mengirim foto bukti untuk tanggal tertentu
router.get('/distribution/photo-status', async (req, res) => {
  const { branch, date } = req.query;
  if (!branch || !date) {
    return res.status(400).json({ error: 'Parameter branch dan date wajib diisi.' });
  }

  try {
    const existing = await findExistingPhotos(branch, date);
    if (!existing) return res.json({ uploaded: false });
    res.json({ uploaded: true, ...existing });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/public/distribution/photo-guide
router.get('/distribution/photo-guide', async (req, res) => {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'distribution_photo_guide')
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });

  let guide = null;
  if (data?.value) {
    try { guide = JSON.parse(data.value); } catch {}
  }

  res.json(guide || { instruction: '', example_photos: [] });
});

module.exports = router;
