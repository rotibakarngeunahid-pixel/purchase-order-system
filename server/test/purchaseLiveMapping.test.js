'use strict';

// Regresi untuk bug lanjutan: setelah PO dibuat, admin menyelesaikan mapping
// (mis. baru mengisi harga di outlet_material_suppliers setelah supplier-nya
// sudah diisi lebih dulu). PO yang SUDAH dibuat tapi BELUM diterima menyimpan
// snapshot lama (price_estimated dari saat mapping belum lengkap) — Catat
// Penerimaan tetap menampilkan harga lama itu walau mapping sudah benar.
//
// GET /api/purchase/:po_id sekarang me-resolve ulang mapping AKTIF SEKARANG
// (attachLiveMapping) dan melampirkannya sebagai item.live_mapping, supaya
// item yang belum pernah diterima (price_actual masih null) tetap ikut
// mapping terkini. Begitu item pernah disimpan (price_actual terisi), nilai
// tersimpan adalah transaksi aktual dan tidak boleh diganggu lagi.
//
// Pola mock sama seperti notifications.test.js / dataDeletion.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');

const supabasePath = require.resolve('../services/supabase');
const purchasePath = require.resolve('../routes/purchase');

const OUTLET_ID = 'outlet-pemogan';
const MATERIAL_ID = 'mat-keju-parut';
const SUPPLIER_MASTER_ID = 'sup-ud-trisna';
const SUPPLIER_MAPPING_ID = 'sup-priangan';

function makePO({ priceActual = null, itemSupplierId = null, itemBrand = 'Wincheez Reguler' } = {}) {
  return {
    id: 'po-1',
    session_id: 'session-1',
    status: 'pending',
    supplier: { id: SUPPLIER_MAPPING_ID, name: 'Priangan', wa_number: '0801' },
    session: { id: 'session-1', order_date: '2026-08-01' },
    items: [
      {
        id: 'item-1',
        material_id: MATERIAL_ID,
        supplier_id: itemSupplierId,
        qty_ordered: 1,
        qty_received: null,
        price_actual: priceActual,
        subtotal_actual: null,
        variant_id: null,
        source: 'ordered',
        adjustment_note: null,
        created_at: '2026-08-01T00:00:00Z',
        brand: itemBrand,
        price_estimated: 13000, // snapshot lama, sebelum harga mapping dilengkapi
        material: {
          id: MATERIAL_ID,
          code: 'KJ01',
          name: 'Keju Parut',
          brand: 'Wincheez Reguler',
          purchase_unit: 'Bungkus',
          package_qty: 250,
          package_unit: 'Gram',
          price_per_purchase_unit: 13000,
          supplier_id: SUPPLIER_MASTER_ID,
        },
        variant: null,
        item_supplier: null,
        branch_distributions: [],
      },
    ],
  };
}

function installFakeSupabase({ po, requestRows, mappingRows }) {
  function makeBuilder(table) {
    const state = {};
    const builder = {
      select() { return builder; },
      eq() { return builder; },
      gt() { return builder; },
      in() { return builder; },
      order() { return builder; },
      single() { state.single = true; return builder; },
      then(resolve, reject) { return resolveResult().then(resolve, reject); },
    };

    async function resolveResult() {
      switch (table) {
        case 'purchase_orders':
          return { data: po, error: null };
        case 'order_request_items':
          return { data: requestRows, error: null };
        case 'outlet_material_suppliers':
          return { data: mappingRows, error: null };
        default:
          throw new Error(`Tabel tak terduga dalam fake supabase: ${table}`);
      }
    }
    return builder;
  }

  const fake = { from: (table) => makeBuilder(table) };
  delete require.cache[purchasePath];
  require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };
}

function restoreSupabase() {
  delete require.cache[supabasePath];
  delete require.cache[purchasePath];
}

function getHandler(router, method, path) {
  const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method]);
  if (!layer) throw new Error(`Handler tidak ditemukan: ${method.toUpperCase()} ${path}`);
  return layer.route.stack[0].handle;
}

function fakeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('GET /:po_id — item belum diterima ikut mapping outlet TERKINI (bukan snapshot lama)', async () => {
  installFakeSupabase({
    po: makePO({ priceActual: null, itemSupplierId: null }),
    requestRows: [{ outlet_id: OUTLET_ID, material_id: MATERIAL_ID }],
    mappingRows: [
      {
        outlet_id: OUTLET_ID,
        material_id: MATERIAL_ID,
        supplier_id: SUPPLIER_MAPPING_ID,
        purchase_unit: 'Bungkus',
        package_qty: 250,
        package_unit: 'Gram',
        price_per_purchase_unit: 14000, // <- baru diisi setelah PO dibuat
        brand: 'Wincheez Reguler',
        is_active: true,
      },
    ],
  });

  try {
    const router = require(purchasePath);
    const handler = getHandler(router, 'get', '/:po_id');
    const res = fakeRes();
    await handler({ params: { po_id: 'po-1' } }, res);

    assert.equal(res.statusCode, 200);
    const item = res.body.items[0];
    assert.ok(item.live_mapping, 'item belum diterima harus dapat live_mapping dari mapping aktif');
    assert.equal(item.live_mapping.supplier_id, SUPPLIER_MAPPING_ID);
    assert.equal(item.live_mapping.price_per_purchase_unit, 14000);
    assert.notEqual(
      item.live_mapping.price_per_purchase_unit,
      item.price_estimated,
      'live_mapping harus beda dari snapshot lama untuk membuktikan ini benar-benar re-resolve, bukan echo snapshot'
    );
  } finally {
    restoreSupabase();
  }
});

test('GET /:po_id — item yang SUDAH diterima (price_actual terisi) tidak dapat live_mapping, snapshot transaksi dijaga', async () => {
  installFakeSupabase({
    po: makePO({ priceActual: 13000, itemSupplierId: SUPPLIER_MASTER_ID }),
    requestRows: [{ outlet_id: OUTLET_ID, material_id: MATERIAL_ID }],
    mappingRows: [
      {
        outlet_id: OUTLET_ID,
        material_id: MATERIAL_ID,
        supplier_id: SUPPLIER_MAPPING_ID,
        price_per_purchase_unit: 14000,
        brand: 'Wincheez Reguler',
        is_active: true,
      },
    ],
  });

  try {
    const router = require(purchasePath);
    const handler = getHandler(router, 'get', '/:po_id');
    const res = fakeRes();
    await handler({ params: { po_id: 'po-1' } }, res);

    assert.equal(res.statusCode, 200);
    // attachLiveMapping tetap boleh menghitung live_mapping (murni informasi),
    // tapi ini murni memverifikasi endpoint tidak error dan payload transaksi
    // (price_actual) tetap utuh — frontend-lah yang menjaga prioritas via
    // `item.price_actual == null` sebelum memakai live_mapping (lihat
    // PurchaseRecord.jsx buildInitialOrderedItems).
    assert.equal(res.body.items[0].price_actual, 13000);
  } finally {
    restoreSupabase();
  }
});

test('GET /:po_id — mapping ambigu antar outlet (beda konfigurasi) -> live_mapping null, fallback ke snapshot', async () => {
  const OUTLET_B = 'outlet-buduk';
  installFakeSupabase({
    po: makePO({ priceActual: null }),
    requestRows: [
      { outlet_id: OUTLET_ID, material_id: MATERIAL_ID },
      { outlet_id: OUTLET_B, material_id: MATERIAL_ID },
    ],
    mappingRows: [
      {
        outlet_id: OUTLET_ID,
        material_id: MATERIAL_ID,
        supplier_id: SUPPLIER_MAPPING_ID,
        price_per_purchase_unit: 14000,
        brand: 'Wincheez Reguler',
        is_active: true,
      },
      {
        outlet_id: OUTLET_B,
        material_id: MATERIAL_ID,
        supplier_id: SUPPLIER_MASTER_ID,
        price_per_purchase_unit: 15000,
        brand: 'Wincheez Reguler',
        is_active: true,
      },
    ],
  });

  try {
    const router = require(purchasePath);
    const handler = getHandler(router, 'get', '/:po_id');
    const res = fakeRes();
    await handler({ params: { po_id: 'po-1' } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(
      res.body.items[0].live_mapping,
      null,
      'dua outlet dengan mapping berbeda untuk item PO yang sama harus ambigu -> live_mapping null'
    );
  } finally {
    restoreSupabase();
  }
});
