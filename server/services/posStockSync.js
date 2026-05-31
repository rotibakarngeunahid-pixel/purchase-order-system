'use strict';

/**
 * posStockSync.js — Service untuk sinkronisasi stok POS setelah PO diterima.
 *
 * Dipanggil fire-and-forget dari routes/purchase.js setelah PO berhasil di-receive.
 * Tidak boleh memblokir response HTTP utama.
 *
 * Env vars yang dibutuhkan:
 *   POS_API_URL  — URL api.php POS (mis. https://rbn.cpanel.net/api/api.php)
 *   POS_API_KEY  — API key untuk api.php (sama dengan API_SECRET_KEY di config.php)
 */

const supabase = require('./supabase');

const POS_API_URL = process.env.POS_API_URL || '';
const POS_API_KEY = process.env.POS_API_KEY || '';

// ── Fetch data PO lengkap dari Supabase ───────────────────────────────────────
async function fetchPODataForSync(poId) {
  // Fetch PO header + outlet
  const { data: po, error: poErr } = await supabase
    .from('purchase_orders')
    .select('id, status, outlet_id, outlets(id, name)')
    .eq('id', poId)
    .single();

  if (poErr || !po) throw new Error(`Gagal ambil data PO ${poId}: ${poErr?.message}`);

  // Fetch PO items + material info
  const { data: items, error: itemsErr } = await supabase
    .from('purchase_order_items')
    .select(`
      id, material_id, qty_ordered, qty_received, source,
      materials(id, name, purchase_unit)
    `)
    .eq('po_id', poId);

  if (itemsErr) throw new Error(`Gagal ambil items PO ${poId}: ${itemsErr?.message}`);

  // Fetch distribusi per item (jika ada)
  const itemIds = (items || []).map((i) => i.id).filter(Boolean);
  let distributions = [];
  if (itemIds.length > 0) {
    const { data: distData } = await supabase
      .from('purchase_item_branch_distribution')
      .select('po_item_id, outlet_id, qty, outlets(id, name)')
      .in('po_item_id', itemIds);
    distributions = distData || [];
  }

  // Group distribusi per item
  const distByItem = {};
  for (const d of distributions) {
    if (!distByItem[d.po_item_id]) distByItem[d.po_item_id] = [];
    distByItem[d.po_item_id].push({
      outlet_id:   d.outlet_id,
      outlet_name: d.outlets?.name || d.outlet_id,
      qty:         Number(d.qty) || 0,
    });
  }

  const outletId   = po.outlet_id || '';
  const outletName = po.outlets?.name || outletId;

  // Bangun array items untuk payload sync
  const syncItems = (items || [])
    .filter((item) => item.material_id) // abaikan item tanpa material
    .map((item) => ({
      po_item_id:           item.id,
      po_material_id:       item.material_id,
      po_material_name:     item.materials?.name || item.material_id,
      po_item_source:       item.source || 'ordered',
      qty_received:         Number(item.qty_received ?? 0),
      outlet_id:            outletId,
      outlet_name:          outletName,
      branch_distributions: distByItem[item.id] || [],
    }));

  return { po, syncItems };
}

// ── Kirim payload ke POS api.php ──────────────────────────────────────────────
async function callPosSyncRpc(poId, poStatus, triggerType, syncItems, triggeredByPosUserId) {
  if (!POS_API_URL || !POS_API_KEY) {
    console.warn('[POS Sync] POS_API_URL atau POS_API_KEY belum dikonfigurasi — sync dilewati.');
    return null;
  }

  const payload = {
    p_po_id:        poId,
    p_po_status:    poStatus,
    p_trigger_type: triggerType,
    p_items:        JSON.stringify(syncItems),
    ...(triggeredByPosUserId ? { p_triggered_by: triggeredByPosUserId } : {}),
  };

  const res = await fetch(`${POS_API_URL}/rpc/sync_purchase_order_to_inventory`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key':    POS_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(`POS sync API error ${res.status}: ${json?.error?.message || JSON.stringify(json)}`);
  }

  return json;
}

// ── Entry point: dipanggil setelah PO receive sukses ─────────────────────────
async function syncPOReceiveToInventory(poId, poStatus, triggeredByPosUserId = null) {
  try {
    const { syncItems } = await fetchPODataForSync(poId);

    if (!syncItems.length) {
      console.log(`[POS Sync] PO ${poId}: tidak ada item untuk disinkronkan`);
      return;
    }

    const result = await callPosSyncRpc(poId, poStatus, 'po_received', syncItems, triggeredByPosUserId);
    console.log(`[POS Sync] PO ${poId} receive: status=${result?.status}, summary=`, result?.summary);
  } catch (err) {
    // Fire-and-forget: jangan throw, cukup log
    console.error(`[POS Sync] Gagal sync PO ${poId} ke stok POS:`, err.message);
  }
}

// ── Dipanggil saat PO di-cancel / di-reset ke pending ────────────────────────
async function syncPOCancelToInventory(poId, triggeredByPosUserId = null) {
  try {
    const { po, syncItems } = await fetchPODataForSync(poId);

    if (!syncItems.length) {
      console.log(`[POS Sync] PO ${poId}: tidak ada item untuk di-rollback`);
      return;
    }

    const result = await callPosSyncRpc(poId, po.status, 'po_cancelled', syncItems, triggeredByPosUserId);
    console.log(`[POS Sync] PO ${poId} cancel: status=${result?.status}, summary=`, result?.summary);
  } catch (err) {
    console.error(`[POS Sync] Gagal rollback stok PO ${poId}:`, err.message);
  }
}

// ── Dipanggil saat PO direvisi (qty diterima berubah) ────────────────────────
async function syncPOReviseToInventory(poId, poStatus, triggeredByPosUserId = null) {
  try {
    const { syncItems } = await fetchPODataForSync(poId);

    if (!syncItems.length) {
      console.log(`[POS Sync] PO ${poId}: tidak ada item untuk direvisi`);
      return;
    }

    const result = await callPosSyncRpc(poId, poStatus, 'po_revised', syncItems, triggeredByPosUserId);
    console.log(`[POS Sync] PO ${poId} revisi: status=${result?.status}, summary=`, result?.summary);
  } catch (err) {
    console.error(`[POS Sync] Gagal sync revisi PO ${poId}:`, err.message);
  }
}

module.exports = {
  syncPOReceiveToInventory,
  syncPOCancelToInventory,
  syncPOReviseToInventory,
};
