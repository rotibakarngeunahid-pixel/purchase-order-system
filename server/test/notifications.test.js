'use strict';

// Regresi untuk bug: Catat Penerimaan menampilkan supplier & harga dari master
// bahan (materials.supplier_id / materials.price_per_purchase_unit) alih-alih
// mapping aktif outlet_material_suppliers, karena endpoint generate PO
// (POST /session/:id/send-wa) tidak pernah menyimpan snapshot supplier_id/brand
// hasil resolvePurchaseConfig ke purchase_order_items — hanya purchase_unit/
// package_qty/package_unit/price_estimated yang di-snapshot. Item tanpa
// supplier_id/brand tersimpan lalu jatuh ke default master bahan di frontend
// (lihat PurchaseRecord.jsx).
//
// Skenario nyata yang dilaporkan: cabang Pemogan memetakan Keju Parut ->
// supplier Priangan, merk Wincheez Reguler, harga Rp14.000 — tapi master bahan
// defaultnya supplier UD Trisna @ Rp13.000. PO yang dibuat harus memakai hasil
// mapping, bukan default master.
//
// Test ini mem-mock modul supabase (lewat require.cache, pola sama dengan
// dataDeletion.test.js & supplierRouting.test.js) supaya bisa memeriksa payload
// yang benar-benar dikirim ke purchase_order_items.insert(...).

const test = require('node:test');
const assert = require('node:assert/strict');

const supabasePath = require.resolve('../services/supabase');
const supplierRoutingPath = require.resolve('../services/supplierRouting');
const notificationsPath = require.resolve('../routes/notifications');

const OUTLET_ID = 'outlet-pemogan';
const MATERIAL_ID = 'mat-keju-parut';
const SUPPLIER_MASTER_ID = 'sup-ud-trisna';
const SUPPLIER_MAPPING_ID = 'sup-priangan';

function baseFixtures() {
  return {
    session: { id: 'session-1', status: 'draft', order_date: '2026-08-01' },
    requestItems: [
      { id: 'req-1', session_id: 'session-1', outlet_id: OUTLET_ID, material_id: MATERIAL_ID, qty: 1 },
    ],
    materials: [
      {
        id: MATERIAL_ID,
        name: 'Keju Parut',
        code: 'KJ01',
        is_active: true,
        purchase_unit: 'Bungkus',
        package_qty: 250,
        package_unit: 'Gram',
        price_per_purchase_unit: 13000,
        brand: 'Wincheez Reguler',
        supplier_id: SUPPLIER_MASTER_ID,
        supplier: { id: SUPPLIER_MASTER_ID, name: 'UD Trisna', wa_number: '0800' },
      },
    ],
    mappingRows: [
      {
        id: 'map-1',
        outlet_id: OUTLET_ID,
        material_id: MATERIAL_ID,
        supplier_id: SUPPLIER_MAPPING_ID,
        is_active: true,
        purchase_unit: 'Bungkus',
        package_qty: 250,
        package_unit: 'Gram',
        price_per_purchase_unit: 14000,
        brand: 'Wincheez Reguler',
        min_order_qty: 1,
        order_multiple: 1,
        request_basis: 'purchase_unit',
      },
    ],
    suppliers: [
      { id: SUPPLIER_MASTER_ID, name: 'UD Trisna', wa_number: '0800', gives_roti_tawar_bonus: true },
      { id: SUPPLIER_MAPPING_ID, name: 'Priangan', wa_number: '0801', gives_roti_tawar_bonus: true },
    ],
    outlets: [{ id: OUTLET_ID, name: 'Pemogan' }],
  };
}

// Fake query builder minimal: cukup untuk menangkap payload insert dan
// membalas data statis per tabel sesuai method (select/insert/update).
function installFakeSupabase(fixtures, { poItemsInsertImpl } = {}) {
  const calls = { insertedPOItems: [], insertedPOs: [] };
  let poSeq = 0;

  function makeBuilder(table) {
    const state = { method: null, insertPayload: null };
    const builder = {
      select() { if (!state.method) state.method = 'select'; return builder; },
      eq() { return builder; },
      gt() { return builder; },
      in() { return builder; },
      order() { return builder; },
      single() { state.single = true; return builder; },
      insert(payload) { state.method = 'insert'; state.insertPayload = payload; return builder; },
      update(payload) { state.method = 'update'; state.updatePayload = payload; return builder; },
      then(resolve, reject) {
        return resolveResult().then(resolve, reject);
      },
    };

    async function resolveResult() {
      switch (table) {
        case 'order_sessions':
          if (state.method === 'update') return { data: null, error: null };
          return { data: fixtures.session, error: null };
        case 'order_request_items':
          return { data: fixtures.requestItems, error: null };
        case 'materials':
          return { data: fixtures.materials, error: null };
        case 'outlet_material_suppliers':
          return { data: fixtures.mappingRows, error: null };
        case 'suppliers':
          return { data: fixtures.suppliers, error: null };
        case 'outlets':
          return { data: fixtures.outlets, error: null };
        case 'app_settings':
          return { data: [], error: null };
        case 'purchase_orders': {
          poSeq += 1;
          const record = { id: `po-${poSeq}`, ...state.insertPayload };
          calls.insertedPOs.push(record);
          return { data: record, error: null };
        }
        case 'purchase_order_items': {
          calls.insertedPOItems.push(state.insertPayload);
          if (poItemsInsertImpl) return poItemsInsertImpl(state.insertPayload, calls.insertedPOItems.length);
          return { error: null };
        }
        default:
          throw new Error(`Tabel tak terduga dalam fake supabase: ${table}`);
      }
    }

    return builder;
  }

  const fake = { from: (table) => makeBuilder(table) };

  delete require.cache[supplierRoutingPath];
  delete require.cache[notificationsPath];
  require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

  return calls;
}

function restoreSupabase() {
  delete require.cache[supabasePath];
  delete require.cache[supplierRoutingPath];
  delete require.cache[notificationsPath];
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

test('generate PO (send-wa) menyimpan supplier_id & brand hasil mapping outlet, bukan default master bahan', async () => {
  const fixtures = baseFixtures();
  const calls = installFakeSupabase(fixtures);

  try {
    const router = require(notificationsPath);
    const handler = getHandler(router, 'post', '/session/:id/send-wa');
    const req = { params: { id: 'session-1' } };
    const res = fakeRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200, `handler harus sukses, dapat: ${JSON.stringify(res.body)}`);
    assert.equal(calls.insertedPOItems.length, 1, 'harus ada satu insert batch purchase_order_items');

    const insertedItems = calls.insertedPOItems[0];
    assert.equal(insertedItems.length, 1);
    const item = insertedItems[0];

    assert.equal(
      item.supplier_id,
      SUPPLIER_MAPPING_ID,
      'supplier_id item harus mengikuti mapping outlet (Priangan), bukan default master bahan (UD Trisna)'
    );
    assert.equal(
      item.brand,
      'Wincheez Reguler',
      'brand item harus tersimpan sebagai snapshot dari mapping'
    );
    assert.equal(
      item.price_estimated,
      14000,
      'price_estimated item harus mengikuti harga mapping (14000), bukan harga master bahan (13000)'
    );

    // PO header pun harus dibuat dengan supplier hasil mapping.
    assert.equal(calls.insertedPOs[0].supplier_id, SUPPLIER_MAPPING_ID);
  } finally {
    restoreSupabase();
  }
});

test('generate PO tetap jalan (fallback) bila kolom brand/supplier_id di purchase_order_items belum ada (migration belum dijalankan)', async () => {
  const fixtures = baseFixtures();
  let attempt = 0;
  const calls = installFakeSupabase(fixtures, {
    poItemsInsertImpl: (payload) => {
      attempt += 1;
      if (attempt === 1) {
        assert.ok('brand' in payload[0], 'percobaan pertama harus menyertakan kolom brand');
        return {
          error: { message: "Could not find the 'brand' column of 'purchase_order_items' in the schema cache" },
        };
      }
      // Percobaan kedua: tanpa brand/supplier_id, tapi snapshot dasar (price_estimated dkk) tetap ada
      assert.ok(!('brand' in payload[0]), 'percobaan kedua tidak boleh lagi menyertakan brand');
      assert.ok(!('supplier_id' in payload[0]), 'percobaan kedua tidak boleh lagi menyertakan supplier_id');
      assert.equal(payload[0].price_estimated, 14000, 'snapshot harga dasar tetap terkirim di fallback');
      return { error: null };
    },
  });

  try {
    const router = require(notificationsPath);
    const handler = getHandler(router, 'post', '/session/:id/send-wa');
    const req = { params: { id: 'session-1' } };
    const res = fakeRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200, `handler harus tetap sukses via fallback, dapat: ${JSON.stringify(res.body)}`);
    assert.equal(attempt, 2, 'harus mencoba insert dengan brand/supplier_id dulu, baru fallback tanpa keduanya');
  } finally {
    restoreSupabase();
  }
});
