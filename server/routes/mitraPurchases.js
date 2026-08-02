// Endpoint transaksi Pembelian Bahan Baku oleh Mitra.
// Dipakai BERSAMA oleh mitra (buat transaksi, lihat riwayat sendiri) dan
// admin (lihat semua, filter, edit, batalkan) — dibedakan lewat req.actor
// yang diisi middleware/dualActorAuth.js. Lihat juga services/posStockSync.js
// (syncMitraPurchaseToInventory) dan supabase/migration_mitra_purchase.sql
// (create_mitra_purchase / update_mitra_purchase, dijalankan atomik di Postgres).
const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const { syncMitraPurchaseToInventory, getMitraBranchStock } = require('../services/posStockSync');

const ITEM_SELECT = `
  id, purchase_id, material_id, brand, unit, qty, unit_price, total_price, notes, created_at,
  materials(id, code, name, purchase_unit)
`;
const HEADER_SELECT = `
  id, outlet_id, mitra_account_id, purchase_date, invoice_number, supplier_name, notes,
  grand_total, status, sync_status, sync_message, synced_at,
  created_by_name, created_at, updated_by_name, updated_at,
  cancelled_at, cancelled_by_name, cancel_reason,
  outlets(id, name), mitra_accounts(id, full_name, username)
`;

function validateItemsPayload(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return 'Minimal satu item wajib diisi';
  }
  for (const item of items) {
    if (!item.material_id) return 'Setiap item wajib memilih bahan baku';
    const qty = Number(item.qty);
    if (!(qty > 0)) return 'Kuantitas setiap item harus lebih dari 0';
    const price = Number(item.unit_price);
    if (Number.isNaN(price) || price < 0) return 'Harga satuan tidak boleh negatif';
    if (!item.unit) return 'Satuan setiap item wajib diisi';
  }
  return null;
}

function mapPgError(error, res) {
  const code = error.code || '';
  if (code === 'MP400') return res.status(400).json({ error: error.message });
  if (code === 'MP404') return res.status(404).json({ error: error.message });
  if (code === 'MP409') return res.status(409).json({ error: error.message });
  return res.status(500).json({ error: error.message });
}

// ── GET /materials — bahan baku aktif, dipakai dropdown form (mitra & admin) ─
router.get('/materials', async (req, res) => {
  const { data, error } = await supabase
    .from('materials')
    .select('id, code, name, purchase_unit')
    .eq('is_active', true)
    .order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// ── POST / — buat transaksi baru (MITRA ONLY) ────────────────────────────────
router.post('/', async (req, res) => {
  if (req.actor.type !== 'mitra') {
    return res.status(403).json({ error: 'Hanya akun mitra yang dapat menambah pembelian' });
  }

  const { purchase_date, invoice_number, supplier_name, notes, items } = req.body;
  if (!purchase_date) return res.status(400).json({ error: 'Tanggal pembelian wajib diisi' });
  const itemError = validateItemsPayload(items);
  if (itemError) return res.status(400).json({ error: itemError });

  const { data: rpcData, error: rpcError } = await supabase.rpc('create_mitra_purchase', {
    p_outlet_id:          req.actor.outletId,
    p_mitra_account_id:   req.actor.mitraAccountId,
    p_purchase_date:      purchase_date,
    p_invoice_number:     invoice_number || null,
    p_supplier_name:      supplier_name || null,
    p_notes:              notes || null,
    p_created_by_name:    req.actor.name,
    p_created_ip:         req.ip,
    p_created_user_agent: req.headers['user-agent'] || null,
    p_items: items.map((i) => ({
      material_id: i.material_id,
      brand:       i.brand || null,
      unit:        i.unit,
      qty:         Number(i.qty),
      unit_price:  Number(i.unit_price) || 0,
      notes:       i.notes || null,
    })),
  });

  if (rpcError) return mapPgError(rpcError, res);
  const purchaseId = rpcData.id;

  // Ambil item yang baru dibuat (butuh id asli utk idempotency-key sinkron POS)
  const { data: savedItems, error: itemsFetchErr } = await supabase
    .from('mitra_purchase_items')
    .select(ITEM_SELECT)
    .eq('purchase_id', purchaseId);
  if (itemsFetchErr) return res.status(500).json({ error: itemsFetchErr.message });

  const syncPayloadItems = savedItems.map((i) => ({
    id: i.id, material_id: i.material_id, material_name: i.materials?.name, qty: i.qty, unit: i.unit,
  }));
  const posSync = await syncMitraPurchaseToInventory(
    purchaseId, syncPayloadItems, req.actor.outletId, req.actor.outletName, req.actor.name
  );

  if (!posSync.ok) {
    // Rollback kompensasi — stok POS tidak berubah, jadi catatan ERP-nya pun
    // dihapus supaya tidak ada data "sudah dibeli" yang stoknya belum masuk.
    await supabase.from('mitra_purchases').delete().eq('id', purchaseId);
    return res.status(502).json({
      error: 'Gagal menyinkronkan stok ke POS. Transaksi dibatalkan, silakan coba lagi. Detail: ' + posSync.error,
    });
  }

  await supabase
    .from('mitra_purchases')
    .update({ sync_status: 'synced', sync_message: null, synced_at: new Date().toISOString() })
    .eq('id', purchaseId);

  const { data: full } = await supabase.from('mitra_purchases').select(HEADER_SELECT).eq('id', purchaseId).single();
  res.status(201).json({ ...full, items: savedItems });
});

// ── GET / — daftar transaksi (mitra: hanya miliknya; admin: semua + filter) ──
router.get('/', async (req, res) => {
  let query = supabase.from('mitra_purchases').select(HEADER_SELECT).order('purchase_date', { ascending: false }).order('created_at', { ascending: false });

  if (req.actor.type === 'mitra') {
    query = query.eq('mitra_account_id', req.actor.mitraAccountId);
  } else {
    const { outlet_id, mitra_account_id, supplier_name, date_from, date_to } = req.query;
    if (outlet_id) query = query.eq('outlet_id', outlet_id);
    if (mitra_account_id) query = query.eq('mitra_account_id', mitra_account_id);
    if (supplier_name) query = query.ilike('supplier_name', `%${supplier_name}%`);
    if (date_from) query = query.gte('purchase_date', date_from);
    if (date_to) query = query.lte('purchase_date', date_to);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  // Dipakai halaman Laporan admin (export Excel + rekap qty per bahan) — item
  // ikut diambil dalam query terpisah supaya list biasa (riwayat mitra) tetap ringan.
  if (req.query.with_items === 'true' && data && data.length > 0) {
    const { data: allItems } = await supabase
      .from('mitra_purchase_items')
      .select(ITEM_SELECT)
      .in('purchase_id', data.map((d) => d.id));
    const itemsByPurchase = {};
    (allItems || []).forEach((i) => {
      (itemsByPurchase[i.purchase_id] ||= []).push(i);
    });
    data.forEach((d) => { d.items = itemsByPurchase[d.id] || []; });
  }

  res.json(data || []);
});

// ── GET /stock-status — stok cabang saat ini di POS ──────────────────────────
router.get('/stock-status', async (req, res) => {
  const outletId = req.actor.type === 'mitra' ? req.actor.outletId : req.query.outlet_id;
  if (!outletId) return res.status(400).json({ error: 'outlet_id wajib diisi' });

  const result = await getMitraBranchStock(outletId);
  if (!result.ok) return res.status(502).json({ error: result.error });
  res.json(result.result?.data || result.result || []);
});

// ── GET /:id — detail transaksi ───────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const { data: header, error } = await supabase.from('mitra_purchases').select(HEADER_SELECT).eq('id', req.params.id).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!header) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });
  if (req.actor.type === 'mitra' && header.mitra_account_id !== req.actor.mitraAccountId) {
    return res.status(403).json({ error: 'Anda tidak punya akses ke transaksi ini' });
  }

  const { data: items, error: itemsErr } = await supabase.from('mitra_purchase_items').select(ITEM_SELECT).eq('purchase_id', req.params.id).order('created_at');
  if (itemsErr) return res.status(500).json({ error: itemsErr.message });

  res.json({ ...header, items: items || [] });
});

// ── PUT /:id — edit (ADMIN ONLY) ─────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  if (req.actor.type !== 'admin') return res.status(403).json({ error: 'Hanya admin yang dapat mengedit transaksi' });

  const { invoice_number, supplier_name, notes, items } = req.body;
  const itemError = validateItemsPayload(items);
  if (itemError) return res.status(400).json({ error: itemError });

  const { data: rpcData, error: rpcError } = await supabase.rpc('update_mitra_purchase', {
    p_id:                 req.params.id,
    p_invoice_number:     invoice_number || null,
    p_supplier_name:      supplier_name || null,
    p_notes:              notes || null,
    p_updated_by_name:    'Admin',
    p_updated_ip:         req.ip,
    p_updated_user_agent: req.headers['user-agent'] || null,
    p_items: items.map((i) => ({
      id:          i.id || null,
      material_id: i.material_id,
      brand:       i.brand || null,
      unit:        i.unit,
      qty:         Number(i.qty),
      unit_price:  Number(i.unit_price) || 0,
      notes:       i.notes || null,
    })),
  });
  if (rpcError) return mapPgError(rpcError, res);

  const purchaseId = rpcData.id;
  const { data: header } = await supabase.from('mitra_purchases').select('outlet_id, outlets(name)').eq('id', purchaseId).single();
  const { data: savedItems } = await supabase.from('mitra_purchase_items').select(ITEM_SELECT).eq('purchase_id', purchaseId);

  const syncPayloadItems = savedItems.map((i) => ({
    id: i.id, material_id: i.material_id, material_name: i.materials?.name, qty: i.qty, unit: i.unit,
  }));
  const posSync = await syncMitraPurchaseToInventory(purchaseId, syncPayloadItems, header.outlet_id, header.outlets?.name, 'Admin');

  await supabase.from('mitra_purchases').update({
    sync_status: posSync.ok ? 'synced' : 'failed',
    sync_message: posSync.ok ? null : posSync.error,
    synced_at: posSync.ok ? new Date().toISOString() : null,
  }).eq('id', purchaseId);

  const { data: full } = await supabase.from('mitra_purchases').select(HEADER_SELECT).eq('id', purchaseId).single();
  res.json({
    ...full,
    items: savedItems,
    sync_warning: posSync.ok ? null : 'Perubahan tersimpan, tapi sinkron stok POS gagal: ' + posSync.error + '. Gunakan tombol Sinkron Ulang.',
  });
});

// ── POST /:id/resync — coba sinkron ulang ke POS (ADMIN ONLY) ───────────────
router.post('/:id/resync', async (req, res) => {
  if (req.actor.type !== 'admin') return res.status(403).json({ error: 'Hanya admin yang dapat menyinkron ulang' });

  const { data: header, error } = await supabase.from('mitra_purchases').select('id, outlet_id, status, outlets(name)').eq('id', req.params.id).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!header) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });

  const { data: items } = await supabase.from('mitra_purchase_items').select(ITEM_SELECT).eq('purchase_id', header.id);
  const targetItems = (items || []).map((i) => ({
    id: i.id, material_id: i.material_id, material_name: i.materials?.name,
    qty: header.status === 'cancelled' ? 0 : i.qty, unit: i.unit,
  }));

  const triggerType = header.status === 'cancelled' ? 'mitra_purchase_cancelled' : 'mitra_purchase';
  const posSync = await syncMitraPurchaseToInventory(header.id, targetItems, header.outlet_id, header.outlets?.name, 'Admin', triggerType);
  await supabase.from('mitra_purchases').update({
    sync_status: posSync.ok ? 'synced' : 'failed',
    sync_message: posSync.ok ? null : posSync.error,
    synced_at: posSync.ok ? new Date().toISOString() : null,
  }).eq('id', header.id);

  if (!posSync.ok) return res.status(502).json({ error: posSync.error });
  res.json({ ok: true });
});

// ── POST /:id/cancel — batalkan transaksi (ADMIN ONLY) ───────────────────────
router.post('/:id/cancel', async (req, res) => {
  if (req.actor.type !== 'admin') return res.status(403).json({ error: 'Hanya admin yang dapat membatalkan transaksi' });

  const { data: header, error } = await supabase.from('mitra_purchases').select('id, outlet_id, status, outlets(name)').eq('id', req.params.id).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!header) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });
  if (header.status === 'cancelled') return res.status(409).json({ error: 'Transaksi sudah dibatalkan sebelumnya' });

  const { data: items } = await supabase.from('mitra_purchase_items').select(ITEM_SELECT).eq('purchase_id', header.id);
  const zeroedItems = (items || []).map((i) => ({
    id: i.id, material_id: i.material_id, material_name: i.materials?.name, qty: 0, unit: i.unit,
  }));

  const posSync = await syncMitraPurchaseToInventory(header.id, zeroedItems, header.outlet_id, header.outlets?.name, 'Admin', 'mitra_purchase_cancelled');
  if (!posSync.ok) {
    return res.status(502).json({ error: 'Gagal rollback stok POS, transaksi BELUM dibatalkan. Detail: ' + posSync.error });
  }

  const { data: updated, error: updErr } = await supabase.from('mitra_purchases').update({
    status: 'cancelled',
    cancelled_at: new Date().toISOString(),
    cancelled_by_name: 'Admin',
    cancel_reason: req.body?.reason || null,
    sync_status: 'synced',
    sync_message: null,
    synced_at: new Date().toISOString(),
  }).eq('id', header.id).select(HEADER_SELECT).single();
  if (updErr) return res.status(500).json({ error: updErr.message });

  res.json(updated);
});

module.exports = router;
