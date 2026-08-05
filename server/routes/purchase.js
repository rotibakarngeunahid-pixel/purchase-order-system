const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const posStockSync = require('../services/posStockSync');
const priceSync = require('../services/priceSync');
const { fetchAllRows } = require('../services/fetchAll');
const { resolvePurchaseConfig, toRawPurchaseQty } = require('../services/purchaseConfig');

const OPTIONAL_PO_ITEM_COLUMNS = [
  'variant_id',
  'source',
  'adjustment_note',
  'created_at',
  'supplier_id',
  'item_supplier',
  'material_variants',
  'purchase_item_branch_distribution',
];

function isMissingColumnError(error, columns = OPTIONAL_PO_ITEM_COLUMNS) {
  const message = String(error?.message || '').toLowerCase();
  return columns.some((column) => message.includes(column.toLowerCase())) && (
    message.includes('column') ||
    message.includes('schema cache') ||
    message.includes('could not find') ||
    message.includes('relationship')
  );
}

function normalizePOItem(item) {
  return {
    ...item,
    variant_id: item.variant_id ?? null,
    variant: item.variant ?? null,
    supplier_id: item.supplier_id ?? item.item_supplier?.id ?? null,
    item_supplier: item.item_supplier ?? null,
    brand: item.brand ?? null,
    outlet_requests: item.outlet_requests ?? null,
    source: item.source || 'ordered',
    adjustment_note: item.adjustment_note ?? null,
    created_at: item.created_at ?? null,
  };
}

function normalizeAndSortPOItems(po) {
  if (!po?.items) return po;

  po.items = po.items.map(normalizePOItem).sort((a, b) => {
    const srcA = a.source || 'ordered';
    const srcB = b.source || 'ordered';
    if (srcA !== srcB) return srcA === 'ordered' ? -1 : 1;
    return new Date(a.created_at || 0) - new Date(b.created_at || 0);
  });

  return po;
}

// includeBrand/includeOutletRequests mengontrol apakah kolom snapshot
// purchase_order_items.brand / .outlet_requests (masing-masing dari migration
// terpisah — migration_purchase_item_brand_snapshot.sql &
// migration_purchase_item_outlet_requests_snapshot.sql) ikut diminta.
// Dipisah dari fetchPODetail supaya instalasi yang belum menjalankan salah
// satu/kedua migration itu tetap bisa fallback ke cascade yang sama persis
// tanpa kolom yang belum ada.
async function fetchPODetailCascade(poId, { includeBrand = false, includeOutletRequests = false } = {}) {
  const extraCols = [includeBrand && 'brand', includeOutletRequests && 'outlet_requests']
    .filter(Boolean)
    .map((c) => `, ${c}`)
    .join('');

  // Coba dengan semua kolom + distribusi cabang
  let result = await supabase
    .from('purchase_orders')
    .select(`
      *,
      supplier:suppliers(id, name, wa_number),
      session:order_sessions(id, order_date),
      items:purchase_order_items(
        id, material_id, supplier_id, qty_ordered, qty_received, price_actual, subtotal_actual, variant_id,
        source, adjustment_note, created_at${extraCols},
        material:materials(id, code, name, brand, purchase_unit, package_qty, package_unit, price_per_purchase_unit, supplier_id),
        variant:material_variants(id, brand, supplier_id, price_per_purchase_unit),
        item_supplier:suppliers(id, name),
        branch_distributions:purchase_item_branch_distribution(outlet_id, qty)
      )
    `)
    .eq('id', poId)
    .single();

  if (!result.error) {
    return { data: normalizeAndSortPOItems(result.data), error: null };
  }

  if (!isMissingColumnError(result.error)) {
    return result;
  }

  // Fallback: tanpa supplier aktual item (kolom migrasi belum ada)
  result = await supabase
    .from('purchase_orders')
    .select(`
      *,
      supplier:suppliers(id, name, wa_number),
      session:order_sessions(id, order_date),
      items:purchase_order_items(
        id, material_id, qty_ordered, qty_received, price_actual, subtotal_actual, variant_id,
        source, adjustment_note, created_at${extraCols},
        material:materials(id, code, name, brand, purchase_unit, package_qty, package_unit, price_per_purchase_unit, supplier_id),
        variant:material_variants(id, brand, supplier_id, price_per_purchase_unit),
        branch_distributions:purchase_item_branch_distribution(outlet_id, qty)
      )
    `)
    .eq('id', poId)
    .single();

  if (!result.error) {
    return { data: normalizeAndSortPOItems(result.data), error: null };
  }

  if (!isMissingColumnError(result.error)) {
    return result;
  }

  // Fallback: tanpa distribusi cabang (tabel belum ada)
  result = await supabase
    .from('purchase_orders')
    .select(`
      *,
      supplier:suppliers(id, name, wa_number),
      session:order_sessions(id, order_date),
      items:purchase_order_items(
        id, material_id, supplier_id, qty_ordered, qty_received, price_actual, subtotal_actual, variant_id,
        source, adjustment_note, created_at${extraCols},
        material:materials(id, code, name, brand, purchase_unit, package_qty, package_unit, price_per_purchase_unit, supplier_id),
        variant:material_variants(id, brand, supplier_id, price_per_purchase_unit),
        item_supplier:suppliers(id, name)
      )
    `)
    .eq('id', poId)
    .single();

  if (!result.error) {
    return { data: normalizeAndSortPOItems(result.data), error: null };
  }

  if (!isMissingColumnError(result.error)) {
    return result;
  }

  // Fallback: tanpa supplier item dan distribusi
  result = await supabase
    .from('purchase_orders')
    .select(`
      *,
      supplier:suppliers(id, name, wa_number),
      session:order_sessions(id, order_date),
      items:purchase_order_items(
        id, material_id, qty_ordered, qty_received, price_actual, subtotal_actual, variant_id,
        source, adjustment_note, created_at${extraCols},
        material:materials(id, code, name, brand, purchase_unit, package_qty, package_unit, price_per_purchase_unit, supplier_id),
        variant:material_variants(id, brand, supplier_id, price_per_purchase_unit)
      )
    `)
    .eq('id', poId)
    .single();

  if (!result.error) {
    return { data: normalizeAndSortPOItems(result.data), error: null };
  }

  if (!isMissingColumnError(result.error)) {
    return result;
  }

  // Fallback: tanpa variant dan distribusi
  result = await supabase
    .from('purchase_orders')
    .select(`
      *,
      supplier:suppliers(id, name, wa_number),
      session:order_sessions(id, order_date),
      items:purchase_order_items(
        id, material_id, qty_ordered, qty_received, price_actual, subtotal_actual${extraCols},
        material:materials(id, code, name, brand, purchase_unit, package_qty, package_unit, price_per_purchase_unit, supplier_id)
      )
    `)
    .eq('id', poId)
    .single();

  if (result.error) return result;
  return { data: normalizeAndSortPOItems(result.data), error: null };
}

async function fetchPODetail(poId) {
  let result = await fetchPODetailCascade(poId, { includeBrand: true, includeOutletRequests: true });
  if (!result.error) return result;

  if (isMissingColumnError(result.error, ['outlet_requests'])) {
    // Migration outlet_requests belum dijalankan — coba lagi tanpa kolom itu
    // (brand mungkin sudah ada, dipertahankan dulu).
    result = await fetchPODetailCascade(poId, { includeBrand: true, includeOutletRequests: false });
    if (!result.error) return result;
  }

  if (isMissingColumnError(result.error, ['brand'])) {
    // Migration brand (dan mungkin outlet_requests) belum dijalankan — fallback
    // ke cascade lama tanpa keduanya (item.brand/outlet_requests akan null,
    // caller/UI fallback ke material.brand / data sesi mentah).
    return fetchPODetailCascade(poId, { includeBrand: false, includeOutletRequests: false });
  }

  return result;
}

// Item PO menyimpan snapshot supplier/merk/harga sesuai mapping yang berlaku
// SAAT PO dibuat (lihat notifications.js). Tapi kalau mapping outlet_material_suppliers
// diubah SETELAH PO dibuat dan itemnya belum benar-benar diterima (price_actual
// masih kosong), Catat Penerimaan harus tetap mengikuti mapping TERKINI, bukan
// snapshot yang sudah basi — itu sebabnya di sini kita resolve ulang mapping
// per outlet yang berkontribusi ke item ini, dan lampirkan sebagai
// item.live_mapping. Begitu item pernah disimpan (price_actual terisi), nilai
// yang tersimpan adalah transaksi aktual dan TIDAK boleh berubah sendiri lagi
// hanya karena mapping diubah — live_mapping hanya dipakai sebagai DEFAULT,
// prioritasnya di frontend selalu di bawah nilai yang sudah pernah disimpan.
//
// PENTING: outlet yang dipertimbangkan untuk item ini HANYA outlet yang
// SUPPLIER-nya (mapping AKTIF SEKARANG) cocok dengan supplier item ini —
// bukan seluruh outlet di sesi yang kebetulan memesan bahan yang sama ke
// supplier LAIN. Tanpa filter ini, bahan yang rutin dipecah ke banyak
// supplier per outlet (mis. Roti Tawar: sebagian outlet default ke satu
// supplier, sebagian di-mapping ke supplier lain) akan SELALU dianggap
// ambigu (live_mapping selalu null) walau mapping outlet-nya sendiri tidak
// pernah berubah — bug yang dilaporkan user 2026-08-04. Kalau di antara
// outlet yang SUDAH cocok itu sendiri confignya masih berbeda-beda (mis. dua
// outlet sama-sama pindah ke supplier ini tapi harganya beda), barulah
// live_mapping dibiarkan null (ambigu sungguhan) supaya fallback ke snapshot,
// bukan menebak salah satu outlet secara sepihak.
//
// Fungsi ini SEKALIGUS menghitung ulang item.outlet_requests (dipakai untuk
// auto-isi Distribusi Bahan ke Cabang) dari mapping TERKINI — bukan cuma
// untuk PO lama yang belum punya snapshot, tapi juga PO baru yang mapping
// salah satu outlet-nya sudah berubah sejak PO dibuat: outlet yang sudah
// "keluar" dari grup supplier ini otomatis tidak ikut disarankan lagi (qty-nya
// akan masuk PO baru di supplier yang benar saat sesi berikutnya di-generate
// lewat Review Order, bukan nyangkut di PO lama ini). Ini aman dipakai untuk
// item yang SUDAH diterima juga — PurchaseRecord.jsx hanya memakai
// outlet_requests untuk auto-isi kalau BELUM ada distribusi tersimpan;
// transaksi yang sudah tersimpan tidak pernah ditimpa oleh ini.
async function attachLiveMapping(po) {
  if (!po || !po.session_id || !Array.isArray(po.items)) return po;
  const orderedItems = po.items.filter((item) => (item.source || 'ordered') === 'ordered');
  const materialIds = [...new Set(orderedItems.map((item) => item.material_id).filter(Boolean))];
  if (materialIds.length === 0) return po;

  const { data: requestRows, error: requestError } = await supabase
    .from('order_request_items')
    .select('outlet_id, material_id, qty')
    .eq('session_id', po.session_id)
    .in('material_id', materialIds);
  if (requestError || !requestRows || requestRows.length === 0) return po;

  const requestRowsByMaterial = {};
  requestRows.forEach((row) => {
    if (!row.outlet_id || !row.material_id) return;
    if (!requestRowsByMaterial[row.material_id]) requestRowsByMaterial[row.material_id] = [];
    requestRowsByMaterial[row.material_id].push(row);
  });

  const { data: mappingRows, error: mappingError } = await supabase
    .from('outlet_material_suppliers')
    .select('outlet_id, material_id, supplier_id, purchase_unit, package_qty, package_unit, price_per_purchase_unit, brand, is_active')
    .in('material_id', materialIds)
    .eq('is_active', true);
  if (mappingError) return po; // Non-fatal — biarkan live_mapping kosong, tetap fallback ke snapshot.

  const mappingByKey = {};
  (mappingRows || []).forEach((row) => {
    mappingByKey[`${row.outlet_id}:${row.material_id}`] = row;
  });

  const sameConfig = (a, b) =>
    a.supplier_id === b.supplier_id &&
    a.brand === b.brand &&
    a.price_per_purchase_unit === b.price_per_purchase_unit;

  po.items = po.items.map((item) => {
    if ((item.source || 'ordered') !== 'ordered') return item;

    const itemSupplierId = item.supplier_id || po.supplier_id || null;

    // Kandidat outlet yang berkontribusi ke item ini: snapshot outlet_requests
    // asli kalau sudah ada (qty riil saat PO dibuat), atau data sesi mentah
    // untuk PO lama yang belum punya snapshot ini.
    const candidateRows = Array.isArray(item.outlet_requests)
      ? item.outlet_requests
          .filter((r) => r.outlet_id)
          .map((r) => ({ outlet_id: r.outlet_id, qty: r.qty_requested }))
      : (requestRowsByMaterial[item.material_id] || []).filter(
          (row) => row.outlet_id && Number(row.qty) > 0
        );

    const resolvedCandidates = candidateRows.map((row) => {
      const mapping = mappingByKey[`${row.outlet_id}:${item.material_id}`] || null;
      const config = resolvePurchaseConfig(item.material, mapping);
      const effectiveSupplierId = config.supplier_id || item.material?.supplier_id || null;
      return { row, config, effectiveSupplierId };
    });

    // Hanya outlet yang mapping AKTIF SEKARANG-nya cocok dengan supplier item
    // ini yang boleh ikut — outlet lain berarti bahannya sama tapi sekarang
    // masuk PO/supplier LAIN, tidak boleh ikut terjumlah/dipertimbangkan di sini.
    const matching = itemSupplierId
      ? resolvedCandidates.filter((c) => c.effectiveSupplierId === itemSupplierId)
      : [];

    let liveMapping = null;
    if (matching.length > 0) {
      const configs = matching.map((c) => c.config);
      const [first, ...rest] = configs;
      if (!rest.some((c) => !sameConfig(c, first))) {
        liveMapping = {
          supplier_id: first.supplier_id,
          brand: first.brand,
          price_per_purchase_unit: first.price_per_purchase_unit,
        };
      }
    }

    const outletRequests = matching.map(({ row, config }) => ({
      outlet_id: row.outlet_id,
      qty_requested: row.qty,
      qty_requested_purchase_unit: toRawPurchaseQty(row.qty, config),
    }));

    return { ...item, live_mapping: liveMapping, outlet_requests: outletRequests };
  });

  return po;
}

async function updateOrderedPOItem(poId, item) {
  const updatePayload = {
    qty_received: item.qty_received,
    price_actual: item.price_actual,
  };
  if (item.variant_id !== undefined) updatePayload.variant_id = item.variant_id || null;
  if (item.supplier_id !== undefined) updatePayload.supplier_id = item.supplier_id || null;

  let result = await supabase
    .from('purchase_order_items')
    .update(updatePayload)
    .eq('id', item.id)
    .eq('po_id', poId);

  if (result.error && isMissingColumnError(result.error, ['variant_id', 'supplier_id'])) {
    if (isMissingColumnError(result.error, ['variant_id'])) delete updatePayload.variant_id;
    if (isMissingColumnError(result.error, ['supplier_id'])) delete updatePayload.supplier_id;
    result = await supabase
      .from('purchase_order_items')
      .update(updatePayload)
      .eq('id', item.id)
      .eq('po_id', poId);
  }

  return result.error;
}

async function fetchPOItemsForTotals(poId) {
  let result = await supabase
    .from('purchase_order_items')
    .select('qty_received, price_actual, qty_ordered, source, material:materials(name)')
    .eq('po_id', poId);

  if (!result.error) {
    return { data: (result.data || []).map(normalizePOItem), error: null };
  }

  if (!isMissingColumnError(result.error, ['source'])) {
    return result;
  }

  result = await supabase
    .from('purchase_order_items')
    .select('qty_received, price_actual, qty_ordered, material:materials(name)')
    .eq('po_id', poId);

  if (result.error) return result;
  return { data: (result.data || []).map(normalizePOItem), error: null };
}

async function deleteAdjustmentItems(poId) {
  const result = await supabase
    .from('purchase_order_items')
    .delete()
    .eq('po_id', poId)
    .eq('source', 'adjustment');

  if (result.error && isMissingColumnError(result.error, ['source'])) return null;
  return result.error;
}

async function fetchOrderedItemIds(poId) {
  let result = await supabase
    .from('purchase_order_items')
    .select('id')
    .eq('po_id', poId)
    .or('source.eq.ordered,source.is.null');

  if (!result.error) return result;
  if (!isMissingColumnError(result.error, ['source'])) return result;

  return supabase
    .from('purchase_order_items')
    .select('id')
    .eq('po_id', poId);
}

function addPositiveDistributionRow(rows, poItemId, outletId, qty) {
  if (!poItemId || !outletId) return;
  const numericQty = Number(qty) || 0;
  if (numericQty <= 0) return;
  rows.push({
    po_item_id: poItemId,
    outlet_id: outletId,
    qty: numericQty,
  });
}

async function replaceBranchDistributions(poItemIds, rows) {
  const itemIds = [...new Set((poItemIds || []).filter(Boolean))];
  if (itemIds.length === 0) return null;

  const { error: deleteError } = await supabase
    .from('purchase_item_branch_distribution')
    .delete()
    .in('po_item_id', itemIds);
  if (deleteError) return deleteError;

  if (!rows.length) return null;
  const mergedRows = [
    ...new Map(rows.map((row) => [`${row.po_item_id}:${row.outlet_id}`, row])).values(),
  ];

  const { error: insertError } = await supabase
    .from('purchase_item_branch_distribution')
    .insert(mergedRows);
  return insertError || null;
}

// GET detail PO
router.get('/:po_id', async (req, res) => {
  const { po_id } = req.params;

  const { data: po, error } = await fetchPODetail(po_id);

  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500;
    return res.status(status).json({ error: status === 404 ? 'PO tidak ditemukan' : error.message });
  }
  res.json(await attachLiveMapping(po));
});

// GET list PO (dengan filter status)
router.get('/', async (req, res) => {
  const { status } = req.query;

  const buildQuery = () => {
    let query = supabase
      .from('purchase_orders')
      .select(`
        *,
        supplier:suppliers(id, name),
        session:order_sessions(id, order_date)
      `)
      .order('created_at', { ascending: false })
      .order('id');

    if (status) query = query.eq('status', status);
    return query;
  };

  const { data, error } = await fetchAllRows(buildQuery);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PUT catat penerimaan barang (mendukung item adjustment + distribusi cabang)
router.put('/:po_id/receive', async (req, res) => {
  const { po_id } = req.params;
  const {
    items,
    deleted_adjustment_item_ids,
    notes,
    branch_distributions,
    supplier_id,
  } = req.body;

  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ error: 'items wajib berupa array' });
  }

  const { data: existingPO, error: existingPOError } = await supabase
    .from('purchase_orders')
    .select('id, status')
    .eq('id', po_id)
    .single();

  if (existingPOError || !existingPO) {
    return res.status(404).json({ error: 'PO tidak ditemukan' });
  }

  const itemSupplierIds = [
    ...new Set(items.map((item) => item.supplier_id).filter(Boolean)),
  ];
  const hasEmptyItemSupplier = items.some(
    (item) => item.supplier_id !== undefined && !item.supplier_id
  );
  if (hasEmptyItemSupplier) {
    return res.status(400).json({ error: 'Supplier setiap item penerimaan wajib dipilih' });
  }

  if (itemSupplierIds.length > 0) {
    const { data: validSuppliers, error: itemSupplierError } = await supabase
      .from('suppliers')
      .select('id')
      .in('id', itemSupplierIds);

    if (itemSupplierError) return res.status(500).json({ error: itemSupplierError.message });

    const validSupplierIds = new Set((validSuppliers || []).map((supplier) => supplier.id));
    const hasInvalidSupplier = itemSupplierIds.some((id) => !validSupplierIds.has(id));
    if (hasInvalidSupplier) {
      return res.status(400).json({ error: 'Supplier item penerimaan tidak ditemukan' });
    }
  }

  let supplierIdUpdate;
  if (supplier_id !== undefined) {
    if (!supplier_id) {
      return res.status(400).json({ error: 'Supplier penerimaan wajib dipilih' });
    }

    const { data: supplier, error: supplierError } = await supabase
      .from('suppliers')
      .select('id')
      .eq('id', supplier_id)
      .single();

    if (supplierError || !supplier) {
      return res.status(400).json({ error: 'Supplier penerimaan tidak ditemukan' });
    }

    supplierIdUpdate = supplier_id;
  }

  // Validasi payload
  for (const item of items) {
    const source = item.source || 'ordered';
    if (source === 'ordered' && !item.id) {
      return res.status(400).json({ error: 'Item PO awal harus memiliki id' });
    }
    if (source === 'adjustment' && !item.id && !item.material_id) {
      return res.status(400).json({ error: 'Item adjustment baru harus memiliki material_id' });
    }
    if (source === 'adjustment' && !(Number(item.qty_received) > 0)) {
      return res.status(400).json({ error: 'Item adjustment harus memiliki qty_received lebih dari 0' });
    }
  }

  // Hapus item adjustment yang ditandai deleted
  if (deleted_adjustment_item_ids && deleted_adjustment_item_ids.length > 0) {
    const { error: delError } = await supabase
      .from('purchase_order_items')
      .delete()
      .in('id', deleted_adjustment_item_ids)
      .eq('po_id', po_id)
      .eq('source', 'adjustment');
    if (delError) return res.status(500).json({ error: delError.message });
  }

  const distributionItemIds = new Set();
  const nextDistributionRows = [];

  // Proses setiap item
  for (const item of items) {
    const source = item.source || 'ordered';

    if (source === 'ordered' && item.id) {
      distributionItemIds.add(item.id);
      const itemError = await updateOrderedPOItem(po_id, item);
      if (itemError) return res.status(500).json({ error: itemError.message });

    } else if (source === 'adjustment') {
      if (item.id) {
        distributionItemIds.add(item.id);
        // Update adjustment existing
        const updatePayload = {
          qty_received: item.qty_received,
          price_actual: item.price_actual,
          variant_id: item.variant_id || null,
          supplier_id: item.supplier_id || null,
          adjustment_note: item.adjustment_note || null,
        };

        let result = await supabase
          .from('purchase_order_items')
          .update(updatePayload)
          .eq('id', item.id)
          .eq('po_id', po_id)
          .eq('source', 'adjustment');
        if (result.error && isMissingColumnError(result.error, ['supplier_id'])) {
          delete updatePayload.supplier_id;
          result = await supabase
            .from('purchase_order_items')
            .update(updatePayload)
            .eq('id', item.id)
            .eq('po_id', po_id)
            .eq('source', 'adjustment');
        }
        if (result.error) return res.status(500).json({ error: result.error.message });
      } else {
        // Insert adjustment baru — ambil id untuk simpan inline_branch_distributions
        const insertPayload = {
          po_id,
          material_id: item.material_id,
          variant_id: item.variant_id || null,
          supplier_id: item.supplier_id || null,
          qty_ordered: 0,
          qty_received: item.qty_received,
          price_actual: item.price_actual,
          source: 'adjustment',
          adjustment_note: item.adjustment_note || null,
        };

        let result = await supabase
          .from('purchase_order_items')
          .insert(insertPayload)
          .select('id')
          .single();
        if (result.error && isMissingColumnError(result.error, ['supplier_id'])) {
          delete insertPayload.supplier_id;
          result = await supabase
            .from('purchase_order_items')
            .insert(insertPayload)
            .select('id')
            .single();
        }
        if (result.error) return res.status(500).json({ error: result.error.message });
        const insertedAdj = result.data;

        // Simpan inline_branch_distributions jika ada (untuk adj roti baru) — non-fatal
        if (insertedAdj?.id) {
          distributionItemIds.add(insertedAdj.id);
          if (Array.isArray(item.inline_branch_distributions)) {
            item.inline_branch_distributions.forEach((d) => {
              addPositiveDistributionRow(
                nextDistributionRows,
                insertedAdj.id,
                d.outlet_id,
                d.qty
              );
            });
          }
        }
      }
    }
  }

  if (Array.isArray(branch_distributions)) {
    branch_distributions.forEach((d) => {
      if (!distributionItemIds.has(d.po_item_id)) return;
      addPositiveDistributionRow(nextDistributionRows, d.po_item_id, d.outlet_id, d.qty);
    });
  }

  // Distribusi adalah snapshot terbaru. Hapus dulu agar qty 0/cabang yang dihapus
  // tidak tertinggal dan tidak ikut tersinkron ulang ke stok POS.
  if (distributionItemIds.size > 0) {
    const distError = await replaceBranchDistributions(
      [...distributionItemIds],
      nextDistributionRows
    );
    if (distError) {
      // Non-fatal: log saja, jangan gagalkan penerimaan utama
      console.error('Distribusi cabang gagal disimpan:', distError.message);
    }
  }

  // Hitung ulang total_actual dari DB (semua item termasuk adjustment)
  const { data: allItems, error: fetchError } = await fetchPOItemsForTotals(po_id);

  if (fetchError) return res.status(500).json({ error: fetchError.message });

  const totalActual = allItems.reduce((sum, item) => {
    return sum + (Number(item.qty_received || 0) * Number(item.price_actual || 0));
  }, 0);

  // Cek discrepancy hanya dari item source = ordered
  const orderedItems = allItems.filter((item) => (item.source || 'ordered') === 'ordered');
  const discrepancies = orderedItems.filter(
    (item) => Number(item.qty_received ?? item.qty_ordered) < Number(item.qty_ordered)
  );

  const hasDiscrepancy = discrepancies.length > 0;
  const poStatus = hasDiscrepancy ? 'received_partial' : 'received';

  // Buat catatan discrepancy otomatis.
  // Baris [Selisih Penerimaan] lama dibuang dulu agar tidak terduplikasi saat re-save.
  let autoNotes = String(notes || '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('[Selisih Penerimaan]'))
    .join('\n')
    .trim();
  if (hasDiscrepancy) {
    const discLines = discrepancies.map(
      (item) =>
        `${item.material?.name}: dipesan ${item.qty_ordered}, diterima ${item.qty_received ?? 0}`
    );
    autoNotes = [autoNotes, `[Selisih Penerimaan] ${discLines.join('; ')}`]
      .filter(Boolean)
      .join('\n');
  }

  // Update PO
  const poUpdates = {
    status: poStatus,
    total_actual: totalActual,
    notes: autoNotes || null,
  };
  if (supplierIdUpdate !== undefined) poUpdates.supplier_id = supplierIdUpdate;

  const { data: po, error: poError } = await supabase
    .from('purchase_orders')
    .update(poUpdates)
    .eq('id', po_id)
    .select('*, supplier:suppliers(id, name)')
    .single();

  if (poError) return res.status(500).json({ error: poError.message });

  // Cek apakah semua PO dalam sesi sudah received
  if (po.session_id) {
    const { data: allPOs } = await supabase
      .from('purchase_orders')
      .select('status')
      .eq('session_id', po.session_id);

    const allDone = allPOs && allPOs.every(
      (p) => p.status === 'received' || p.status === 'received_partial'
    );
    if (allDone) {
      await supabase
        .from('order_sessions')
        .update({ status: 'completed' })
        .eq('id', po.session_id);
    }
  }

  const wasAlreadyReceived = ['received', 'received_partial'].includes(existingPO.status);
  const posSync = wasAlreadyReceived
    ? await posStockSync.syncPOReviseToInventory(po_id, poStatus)
    : await posStockSync.syncPOReceiveToInventory(po_id, poStatus);

  // Auto-update harga master bahan dari harga aktual penerimaan + tulis log.
  // Non-fatal: kegagalan sinkron harga tidak menggagalkan penerimaan.
  const priceResult = await priceSync.syncPricesFromReceive(po_id);
  if (!priceResult.ok) {
    console.error('Sinkronisasi harga bahan gagal:', priceResult.error);
  }

  res.json({
    ...po,
    has_discrepancy: hasDiscrepancy,
    pos_sync: posSync,
    price_changes: priceResult.changes || [],
  });
});

// DELETE hapus PO yang masih pending/confirmed
router.delete('/:po_id', async (req, res) => {
  const { po_id } = req.params;

  const { data: po, error: fetchError } = await supabase
    .from('purchase_orders')
    .select('id, status, session_id')
    .eq('id', po_id)
    .single();

  if (fetchError || !po) return res.status(404).json({ error: 'PO tidak ditemukan' });
  if (po.status !== 'pending' && po.status !== 'confirmed') {
    return res.status(400).json({ error: 'Hanya PO berstatus Pending atau Dikonfirmasi yang dapat dihapus' });
  }

  const { error: deleteError } = await supabase
    .from('purchase_orders')
    .delete()
    .eq('id', po_id);

  if (deleteError) return res.status(500).json({ error: deleteError.message });

  if (po.session_id) {
    await supabase
      .from('order_sessions')
      .update({ status: 'sent' })
      .eq('id', po.session_id)
      .eq('status', 'completed');
  }

  res.json({ success: true });
});

// PUT reset PO ke pending (hapus adjustment, kosongkan data penerimaan ordered)
router.put('/:po_id/reset', async (req, res) => {
  const { po_id } = req.params;

  const { data: po, error: fetchError } = await supabase
    .from('purchase_orders')
    .select('id, status, session_id')
    .eq('id', po_id)
    .single();

  if (fetchError || !po) return res.status(404).json({ error: 'PO tidak ditemukan' });

  const posSync = await posStockSync.syncPOCancelToInventory(po_id);

  // Hapus semua item adjustment (distribusi adjustment terhapus via CASCADE)
  const deleteAdjustmentError = await deleteAdjustmentItems(po_id);
  if (deleteAdjustmentError) return res.status(500).json({ error: deleteAdjustmentError.message });

  // Reset item ordered: qty_received dan price_actual kembali null
  const { data: orderedItems, error: orderedItemsError } = await fetchOrderedItemIds(po_id);
  if (orderedItemsError) return res.status(500).json({ error: orderedItemsError.message });

  // Hapus distribusi cabang untuk semua item ordered (reset bersih)
  if ((orderedItems || []).length > 0) {
    const orderedItemIds = orderedItems.map((i) => i.id);
    await supabase
      .from('purchase_item_branch_distribution')
      .delete()
      .in('po_item_id', orderedItemIds);
  }

  for (const item of (orderedItems || [])) {
    const updatePayload = {
      qty_received: null,
      price_actual: null,
      supplier_id: null,
      variant_id: null,
    };

    let result = await supabase
      .from('purchase_order_items')
      .update(updatePayload)
      .eq('id', item.id);

    if (result.error && isMissingColumnError(result.error, ['variant_id', 'supplier_id'])) {
      if (isMissingColumnError(result.error, ['variant_id'])) delete updatePayload.variant_id;
      if (isMissingColumnError(result.error, ['supplier_id'])) delete updatePayload.supplier_id;
      await supabase
        .from('purchase_order_items')
        .update(updatePayload)
        .eq('id', item.id);
    }
  }

  // Reset PO ke pending
  const { data: updated, error: updateError } = await supabase
    .from('purchase_orders')
    .update({ status: 'pending', total_actual: null, notes: null })
    .eq('id', po_id)
    .select('*, supplier:suppliers(id, name)')
    .single();

  if (updateError) return res.status(500).json({ error: updateError.message });

  if (po.session_id) {
    await supabase
      .from('order_sessions')
      .update({ status: 'sent' })
      .eq('id', po.session_id)
      .eq('status', 'completed');
  }

  res.json({ ...updated, pos_sync: posSync });
});

// POST re-trigger sinkronisasi stok ke POS untuk PO yang sudah diterima
// Berguna saat: env var POS_API_URL baru ditambah, mapping baru dikonfigurasi, atau sync sebelumnya gagal
router.post('/:po_id/resync', async (req, res) => {
  const { po_id } = req.params;

  const { data: po, error: fetchError } = await supabase
    .from('purchase_orders')
    .select('id, status')
    .eq('id', po_id)
    .single();

  if (fetchError || !po) return res.status(404).json({ error: 'PO tidak ditemukan' });
  if (!['received', 'received_partial'].includes(po.status)) {
    return res.status(400).json({ error: `PO berstatus '${po.status}', hanya PO yang sudah diterima yang bisa di-resync.` });
  }

  const posSync = await posStockSync.syncPOReviseToInventory(po_id, po.status);
  res.json({ success: true, pos_sync: posSync });
});

module.exports = router;
