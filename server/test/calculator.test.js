'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { calculatePOs } = require('../services/calculator');
const { REQUEST_BASIS } = require('../services/purchaseConfig');

const outletA = { id: 'outlet-A', name: 'Outlet A' };
const outletB = { id: 'outlet-B', name: 'Outlet B' };
const supplierDefault = { id: 'sup-default', name: 'Supplier Default', gives_roti_tawar_bonus: true };
const supplierA = { id: 'sup-A', name: 'Supplier A', gives_roti_tawar_bonus: true };
const supplierB = { id: 'sup-B', name: 'Supplier B', gives_roti_tawar_bonus: true };

const outletsById = { [outletA.id]: outletA, [outletB.id]: outletB };
const suppliersById = { [supplierDefault.id]: supplierDefault, [supplierA.id]: supplierA, [supplierB.id]: supplierB };

const mentega = {
  id: 'mat-mentega',
  name: 'Mentega',
  code: 'MTG',
  purchase_unit: 'Pcs',
  package_qty: 1,
  package_unit: 'Pcs',
  price_per_purchase_unit: 15000,
  supplier_id: supplierDefault.id,
};

function baseRouting(overrides = {}) {
  return { supplierOverrides: {}, purchaseConfigs: {}, suppliersById, outletsById, ...overrides };
}

test('Tanpa mapping sama sekali: perilaku identik sebelum fitur ini (Math.ceil qty, supplier default)', () => {
  const items = [
    { outlet_id: outletA.id, material_id: mentega.id, qty: 4.2 },
  ];
  const pos = calculatePOs(items, [mentega], baseRouting());
  assert.equal(pos.length, 1);
  assert.equal(pos[0].supplier_id, supplierDefault.id);
  assert.equal(pos[0].items[0].qty_ordered, 5);
  assert.equal(pos[0].items[0].subtotal_estimated, 5 * 15000);
});

test('Skenario 1: bahan sama, outlet berbeda, supplier berbeda -> 2 baris PO terpisah', () => {
  const items = [
    { outlet_id: outletA.id, material_id: mentega.id, qty: 700 },
    { outlet_id: outletB.id, material_id: mentega.id, qty: 700 },
  ];
  const purchaseConfigs = {
    [`${outletA.id}:${mentega.id}`]: {
      outlet_id: outletA.id, material_id: mentega.id, supplier_id: supplierA.id, is_active: true,
      purchase_unit: 'Pack', package_qty: 500, package_unit: 'Gram',
      min_order_qty: 1, order_multiple: 1, request_basis: REQUEST_BASIS.BASE_UNIT,
      price_per_purchase_unit: 10000,
    },
    [`${outletB.id}:${mentega.id}`]: {
      outlet_id: outletB.id, material_id: mentega.id, supplier_id: supplierB.id, is_active: true,
      purchase_unit: 'Pack', package_qty: 1000, package_unit: 'Gram',
      min_order_qty: 1, order_multiple: 1, request_basis: REQUEST_BASIS.BASE_UNIT,
      price_per_purchase_unit: 18000,
    },
  };
  const pos = calculatePOs(items, [mentega], baseRouting({ purchaseConfigs }));
  assert.equal(pos.length, 2, 'harus jadi 2 PO terpisah (supplier berbeda)');

  const poA = pos.find((p) => p.supplier_id === supplierA.id);
  const poB = pos.find((p) => p.supplier_id === supplierB.id);
  assert.ok(poA && poB);

  // 700 gram / 500 gram per pack = 1.4 -> dibulatkan ke 2 pack
  assert.equal(poA.items[0].qty_ordered, 2);
  assert.equal(poA.items[0].purchase_conversion.base_qty_ordered, 1000);
  // 700 gram / 1000 gram per pack = 0.7 -> dibulatkan ke 1 pack
  assert.equal(poB.items[0].qty_ordered, 1);
  assert.equal(poB.items[0].purchase_conversion.base_qty_ordered, 1000);
});

test('Skenario 2: bahan sama, supplier sama, harga outlet berbeda -> tidak digabung, subtotal beda', () => {
  const items = [
    { outlet_id: outletA.id, material_id: mentega.id, qty: 3 },
    { outlet_id: outletB.id, material_id: mentega.id, qty: 3 },
  ];
  const purchaseConfigs = {
    [`${outletA.id}:${mentega.id}`]: {
      outlet_id: outletA.id, material_id: mentega.id, supplier_id: supplierA.id, is_active: true,
      price_per_purchase_unit: 12000, min_order_qty: 1, order_multiple: 1, request_basis: REQUEST_BASIS.PURCHASE_UNIT,
    },
    [`${outletB.id}:${mentega.id}`]: {
      outlet_id: outletB.id, material_id: mentega.id, supplier_id: supplierA.id, is_active: true,
      price_per_purchase_unit: 14000, min_order_qty: 1, order_multiple: 1, request_basis: REQUEST_BASIS.PURCHASE_UNIT,
    },
  };
  const pos = calculatePOs(items, [mentega], baseRouting({ purchaseConfigs }));
  assert.equal(pos.length, 1, 'supplier sama -> satu PO');
  assert.equal(pos[0].items.length, 2, 'tapi dua baris item karena harga beda (config beda)');
  const line12k = pos[0].items.find((i) => i.price_per_purchase_unit === 12000);
  const line14k = pos[0].items.find((i) => i.price_per_purchase_unit === 14000);
  assert.equal(line12k.subtotal_estimated, 36000);
  assert.equal(line14k.subtotal_estimated, 42000);
  assert.equal(pos[0].total_estimated, 78000);
});

test('Skenario 3: minimum pembelian berbeda antar outlet mempengaruhi qty_ordered', () => {
  const items = [
    { outlet_id: outletA.id, material_id: mentega.id, qty: 2 },
    { outlet_id: outletB.id, material_id: mentega.id, qty: 2 },
  ];
  const purchaseConfigs = {
    [`${outletA.id}:${mentega.id}`]: {
      outlet_id: outletA.id, material_id: mentega.id, supplier_id: supplierA.id, is_active: true,
      min_order_qty: 1, order_multiple: 1, request_basis: REQUEST_BASIS.PURCHASE_UNIT,
    },
    [`${outletB.id}:${mentega.id}`]: {
      outlet_id: outletB.id, material_id: mentega.id, supplier_id: supplierB.id, is_active: true,
      min_order_qty: 10, order_multiple: 1, request_basis: REQUEST_BASIS.PURCHASE_UNIT,
    },
  };
  const pos = calculatePOs(items, [mentega], baseRouting({ purchaseConfigs }));
  const poA = pos.find((p) => p.supplier_id === supplierA.id);
  const poB = pos.find((p) => p.supplier_id === supplierB.id);
  assert.equal(poA.items[0].qty_ordered, 2);
  assert.equal(poB.items[0].qty_ordered, 10, 'dipaksa ke minimum supplier B');
});

test('Skenario 4: purchase unit berbeda antar outlet ditampilkan sesuai config masing-masing', () => {
  const items = [
    { outlet_id: outletA.id, material_id: mentega.id, qty: 1 },
    { outlet_id: outletB.id, material_id: mentega.id, qty: 1 },
  ];
  const purchaseConfigs = {
    [`${outletA.id}:${mentega.id}`]: {
      outlet_id: outletA.id, material_id: mentega.id, supplier_id: supplierA.id, is_active: true,
      purchase_unit: 'Pcs', min_order_qty: 1, order_multiple: 1, request_basis: REQUEST_BASIS.PURCHASE_UNIT,
    },
    [`${outletB.id}:${mentega.id}`]: {
      outlet_id: outletB.id, material_id: mentega.id, supplier_id: supplierB.id, is_active: true,
      purchase_unit: 'Dus', package_qty: 24, package_unit: 'Pcs', min_order_qty: 1, order_multiple: 1,
      request_basis: REQUEST_BASIS.PURCHASE_UNIT,
    },
  };
  const pos = calculatePOs(items, [mentega], baseRouting({ purchaseConfigs }));
  const poA = pos.find((p) => p.supplier_id === supplierA.id);
  const poB = pos.find((p) => p.supplier_id === supplierB.id);
  assert.equal(poA.items[0].purchase_unit, 'Pcs');
  assert.equal(poB.items[0].purchase_unit, 'Dus');
});

test('Skenario 5a: konversi kg -> gram, supplier hanya jual per kg utuh (order_multiple 1)', () => {
  const items = [{ outlet_id: outletA.id, material_id: mentega.id, qty: 2500 }]; // 2500 gram
  const purchaseConfigs = {
    [`${outletA.id}:${mentega.id}`]: {
      outlet_id: outletA.id, material_id: mentega.id, supplier_id: supplierA.id, is_active: true,
      purchase_unit: 'Kg', package_qty: 1000, package_unit: 'Gram',
      min_order_qty: 1, order_multiple: 1, request_basis: REQUEST_BASIS.BASE_UNIT,
      price_per_purchase_unit: 40000,
    },
  };
  const pos = calculatePOs(items, [mentega], baseRouting({ purchaseConfigs }));
  // 2500 gram = 2.5 kg, tapi order_multiple=1 -> supplier ini hanya jual kg utuh -> naik ke 3
  assert.equal(pos[0].items[0].qty_ordered, 3);
  assert.equal(pos[0].items[0].purchase_conversion.base_qty_ordered, 3000);
  assert.equal(pos[0].items[0].subtotal_estimated, 3 * 40000);
});

test('Skenario 5b: konversi kg -> gram, supplier menjual pecahan kg (order_multiple 0.1)', () => {
  const items = [{ outlet_id: outletA.id, material_id: mentega.id, qty: 2500 }]; // 2500 gram
  const purchaseConfigs = {
    [`${outletA.id}:${mentega.id}`]: {
      outlet_id: outletA.id, material_id: mentega.id, supplier_id: supplierA.id, is_active: true,
      purchase_unit: 'Kg', package_qty: 1000, package_unit: 'Gram',
      min_order_qty: 0.1, order_multiple: 0.1, request_basis: REQUEST_BASIS.BASE_UNIT,
      price_per_purchase_unit: 40000,
    },
  };
  const pos = calculatePOs(items, [mentega], baseRouting({ purchaseConfigs }));
  // Supplier menjual pecahan kg -> 2.5 kg persis, tidak perlu dibulatkan
  assert.equal(pos[0].items[0].qty_ordered, 2.5);
  assert.equal(pos[0].items[0].purchase_conversion.base_qty_ordered, 2500);
  assert.equal(pos[0].items[0].subtotal_estimated, 2.5 * 40000);
});

test('Skenario 6: kebutuhan lebih kecil dari minimum pembelian dipaksa naik ke minimum', () => {
  const items = [{ outlet_id: outletA.id, material_id: mentega.id, qty: 100 }]; // 100 gram saja
  const purchaseConfigs = {
    [`${outletA.id}:${mentega.id}`]: {
      outlet_id: outletA.id, material_id: mentega.id, supplier_id: supplierA.id, is_active: true,
      purchase_unit: 'Pack', package_qty: 500, package_unit: 'Gram',
      min_order_qty: 1, order_multiple: 1, request_basis: REQUEST_BASIS.BASE_UNIT,
    },
  };
  const pos = calculatePOs(items, [mentega], baseRouting({ purchaseConfigs }));
  assert.equal(pos[0].items[0].qty_ordered, 1, 'tetap beli minimum 1 pack walau cuma butuh 100 gram');
  assert.equal(pos[0].items[0].purchase_conversion.surplus_base_qty, 400);
});

test('Skenario 7: kebutuhan besar dibulatkan ke kelipatan pembelian supplier', () => {
  const items = [{ outlet_id: outletA.id, material_id: mentega.id, qty: 1300 }]; // 1300 gram
  const purchaseConfigs = {
    [`${outletA.id}:${mentega.id}`]: {
      outlet_id: outletA.id, material_id: mentega.id, supplier_id: supplierA.id, is_active: true,
      purchase_unit: 'Pack', package_qty: 500, package_unit: 'Gram',
      min_order_qty: 1, order_multiple: 2, request_basis: REQUEST_BASIS.BASE_UNIT, // supplier hanya jual kelipatan 2 pack
    },
  };
  const pos = calculatePOs(items, [mentega], baseRouting({ purchaseConfigs }));
  // 1300/500 = 2.6 pack -> naik ke kelipatan 2 terdekat = 4 pack
  assert.equal(pos[0].items[0].qty_ordered, 4);
});

test('Skenario: dua outlet mapping ke supplier sama dengan config identik -> digabung satu baris', () => {
  const items = [
    { outlet_id: outletA.id, material_id: mentega.id, qty: 2 },
    { outlet_id: outletB.id, material_id: mentega.id, qty: 3 },
  ];
  const sharedConfig = {
    supplier_id: supplierA.id, is_active: true,
    min_order_qty: 1, order_multiple: 1, request_basis: REQUEST_BASIS.PURCHASE_UNIT,
  };
  const purchaseConfigs = {
    [`${outletA.id}:${mentega.id}`]: { outlet_id: outletA.id, material_id: mentega.id, ...sharedConfig },
    [`${outletB.id}:${mentega.id}`]: { outlet_id: outletB.id, material_id: mentega.id, ...sharedConfig },
  };
  const pos = calculatePOs(items, [mentega], baseRouting({ purchaseConfigs }));
  assert.equal(pos.length, 1);
  assert.equal(pos[0].items.length, 1, 'config identik -> satu baris gabungan');
  assert.equal(pos[0].items[0].qty_ordered, 5);
  assert.deepEqual(
    pos[0].items[0].outlet_requests.map((r) => r.outlet_id).sort(),
    [outletA.id, outletB.id].sort()
  );
});

test('Roti tawar: bonus kelipatan 20 tetap bekerja dengan config default (backward compatible)', () => {
  const rotiTawar = { ...mentega, id: 'mat-roti', name: 'Roti Tawar', code: 'RTW' };
  const items = [{ outlet_id: outletA.id, material_id: rotiTawar.id, qty: 45 }];
  const pos = calculatePOs(items, [rotiTawar], baseRouting());
  assert.equal(pos[0].items[0].roti_tawar_bonus.total_needed, 45);
  // Sama seperti sebelum fitur ini: order 43 + bonus 2 = fulfilled 45
  assert.equal(pos[0].items[0].qty_ordered, 43);
  assert.equal(pos[0].items[0].roti_tawar_bonus.bonus, 2);
});

test('Item tanpa supplier (tidak ada mapping & tidak ada default) diabaikan, tidak melempar error', () => {
  const noSupplierMaterial = { ...mentega, id: 'mat-no-supplier', supplier_id: null };
  const items = [{ outlet_id: outletA.id, material_id: noSupplierMaterial.id, qty: 5 }];
  const pos = calculatePOs(items, [noSupplierMaterial], baseRouting());
  assert.equal(pos.length, 0);
});

test('Skenario merk: bahan sama, supplier beda, merk beda -> baris PO terpisah dengan merk masing-masing', () => {
  const items = [
    { outlet_id: outletA.id, material_id: mentega.id, qty: 2 },
    { outlet_id: outletB.id, material_id: mentega.id, qty: 3 },
  ];
  const purchaseConfigs = {
    [`${outletA.id}:${mentega.id}`]: {
      outlet_id: outletA.id, material_id: mentega.id, supplier_id: supplierA.id, is_active: true,
      brand: 'Wisman', min_order_qty: 1, order_multiple: 1, request_basis: REQUEST_BASIS.PURCHASE_UNIT,
    },
    [`${outletB.id}:${mentega.id}`]: {
      outlet_id: outletB.id, material_id: mentega.id, supplier_id: supplierB.id, is_active: true,
      brand: 'Blue Band', min_order_qty: 1, order_multiple: 1, request_basis: REQUEST_BASIS.PURCHASE_UNIT,
    },
  };
  const pos = calculatePOs(items, [mentega], baseRouting({ purchaseConfigs }));
  const poA = pos.find((p) => p.supplier_id === supplierA.id);
  const poB = pos.find((p) => p.supplier_id === supplierB.id);
  assert.equal(poA.items[0].material_brand, 'Wisman');
  assert.equal(poB.items[0].material_brand, 'Blue Band');
});

test('Skenario merk: supplier sama, outlet beda, merk beda -> tidak digabung walau harga/satuan sama', () => {
  const items = [
    { outlet_id: outletA.id, material_id: mentega.id, qty: 2 },
    { outlet_id: outletB.id, material_id: mentega.id, qty: 3 },
  ];
  const purchaseConfigs = {
    [`${outletA.id}:${mentega.id}`]: {
      outlet_id: outletA.id, material_id: mentega.id, supplier_id: supplierA.id, is_active: true,
      brand: 'Wisman', min_order_qty: 1, order_multiple: 1, request_basis: REQUEST_BASIS.PURCHASE_UNIT,
    },
    [`${outletB.id}:${mentega.id}`]: {
      outlet_id: outletB.id, material_id: mentega.id, supplier_id: supplierA.id, is_active: true,
      brand: 'Merk Lain', min_order_qty: 1, order_multiple: 1, request_basis: REQUEST_BASIS.PURCHASE_UNIT,
    },
  };
  const pos = calculatePOs(items, [mentega], baseRouting({ purchaseConfigs }));
  assert.equal(pos.length, 1, 'supplier sama -> satu PO');
  assert.equal(pos[0].items.length, 2, 'merk beda -> dua baris terpisah walau supplier/harga sama');
});

test('Tanpa merk di mapping, item PO pakai merk default bahan (backward compatible)', () => {
  const mentegaWithBrand = { ...mentega, brand: 'Merk Default' };
  const items = [{ outlet_id: outletA.id, material_id: mentegaWithBrand.id, qty: 2 }];
  const pos = calculatePOs(items, [mentegaWithBrand], baseRouting());
  assert.equal(pos[0].items[0].material_brand, 'Merk Default');
});

test('Mapping is_active=false pada purchaseConfigs (baris tidak difilter oleh caller) tetap fallback ke default', () => {
  const items = [{ outlet_id: outletA.id, material_id: mentega.id, qty: 3 }];
  const purchaseConfigs = {
    [`${outletA.id}:${mentega.id}`]: {
      outlet_id: outletA.id, material_id: mentega.id, supplier_id: supplierA.id, is_active: false,
      purchase_unit: 'Dus', package_qty: 24,
    },
  };
  const pos = calculatePOs(items, [mentega], baseRouting({ purchaseConfigs }));
  assert.equal(pos[0].supplier_id, supplierDefault.id, 'mapping nonaktif -> supplier default bahan');
  assert.equal(pos[0].items[0].purchase_unit, 'Pcs');
});
