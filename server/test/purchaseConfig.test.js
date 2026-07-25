'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  REQUEST_BASIS,
  calculatePurchaseSuggestion,
  getRequestUnit,
  purchaseConfigSignature,
  resolvePurchaseConfig,
  roundToPurchaseQty,
  toBaseQty,
  toRawPurchaseQty,
} = require('../services/purchaseConfig');

const mentega = {
  id: 'mat-mentega',
  name: 'Mentega',
  purchase_unit: 'Pcs',
  package_qty: 1,
  package_unit: 'Pcs',
  price_per_purchase_unit: 15000,
  supplier_id: 'sup-default',
};

test('resolvePurchaseConfig: tanpa mapping mengikuti master bahan (perilaku lama)', () => {
  const config = resolvePurchaseConfig(mentega, null);
  assert.equal(config.purchase_unit, 'Pcs');
  assert.equal(config.package_qty, 1);
  assert.equal(config.package_unit, 'Pcs');
  assert.equal(config.price_per_purchase_unit, 15000);
  assert.equal(config.min_order_qty, 1);
  assert.equal(config.order_multiple, 1);
  assert.equal(config.request_basis, REQUEST_BASIS.PURCHASE_UNIT);
  assert.equal(config.source, 'material_default');
});

test('resolvePurchaseConfig: mapping tidak aktif diabaikan, kembali ke master', () => {
  const mapping = {
    is_active: false,
    supplier_id: 'sup-B',
    purchase_unit: 'Pack',
    package_qty: 500,
    package_unit: 'Gram',
  };
  const config = resolvePurchaseConfig(mentega, mapping);
  assert.equal(config.source, 'material_default');
  assert.equal(config.purchase_unit, 'Pcs');
});

test('Skenario: bahan sama, outlet berbeda, supplier & kemasan berbeda', () => {
  // Outlet A -> Supplier A, minimum 500 gram (1 pack = 500 gram)
  const configA = resolvePurchaseConfig(mentega, {
    is_active: true,
    supplier_id: 'sup-A',
    purchase_unit: 'Pack',
    package_qty: 500,
    package_unit: 'Gram',
    min_order_qty: 1,
    order_multiple: 1,
    request_basis: REQUEST_BASIS.BASE_UNIT,
  });
  // Outlet B -> Supplier B, minimum 1 kg (1 pack = 1000 gram)
  const configB = resolvePurchaseConfig(mentega, {
    is_active: true,
    supplier_id: 'sup-B',
    purchase_unit: 'Pack',
    package_qty: 1000,
    package_unit: 'Gram',
    min_order_qty: 1,
    order_multiple: 1,
    request_basis: REQUEST_BASIS.BASE_UNIT,
  });

  assert.equal(configA.supplier_id, 'sup-A');
  assert.equal(configB.supplier_id, 'sup-B');
  assert.notEqual(purchaseConfigSignature(configA), purchaseConfigSignature(configB));

  // Contoh utama dari user: kebutuhan 700 gram, supplier A jual per 500 gram
  const suggestionA = calculatePurchaseSuggestion(700, configA);
  assert.equal(suggestionA.purchase_qty, 2, 'harus beli 2 pack (bukan 1.4)');
  assert.equal(suggestionA.base_qty_ordered, 1000, 'total masuk inventory 1000 gram');
  assert.equal(suggestionA.subtotal, 2 * (configA.price_per_purchase_unit || 0));
});

test('Skenario: bahan sama, supplier sama, harga beda per outlet', () => {
  const cheapOutlet = resolvePurchaseConfig(mentega, {
    is_active: true,
    supplier_id: 'sup-A',
    price_per_purchase_unit: 12000,
  });
  const expensiveOutlet = resolvePurchaseConfig(mentega, {
    is_active: true,
    supplier_id: 'sup-A',
    price_per_purchase_unit: 14000,
  });
  assert.equal(cheapOutlet.price_per_purchase_unit, 12000);
  assert.equal(expensiveOutlet.price_per_purchase_unit, 14000);
  assert.notEqual(purchaseConfigSignature(cheapOutlet), purchaseConfigSignature(expensiveOutlet));
});

test('Skenario: minimum pembelian berbeda antar outlet', () => {
  const config = resolvePurchaseConfig(mentega, {
    is_active: true,
    supplier_id: 'sup-A',
    min_order_qty: 5,
    order_multiple: 1,
  });
  // Butuh hanya 2 pcs, tapi minimum supplier 5
  assert.equal(roundToPurchaseQty(2, config), 5);
  // Butuh 7 pcs, di atas minimum -> tidak dipaksa ke minimum
  assert.equal(roundToPurchaseQty(7, config), 7);
});

test('Skenario: purchase unit berbeda (Pcs vs Dus)', () => {
  const configPcs = resolvePurchaseConfig(mentega, { is_active: true, supplier_id: 'sup-A', purchase_unit: 'Pcs' });
  const configDus = resolvePurchaseConfig(mentega, {
    is_active: true,
    supplier_id: 'sup-B',
    purchase_unit: 'Dus',
    package_qty: 24,
    package_unit: 'Pcs',
  });
  assert.equal(configPcs.purchase_unit, 'Pcs');
  assert.equal(configDus.purchase_unit, 'Dus');
  assert.equal(configDus.package_qty, 24);
});

test('Skenario: konversi kg -> gram', () => {
  const config = resolvePurchaseConfig(
    { ...mentega, purchase_unit: 'Kg', package_qty: 1, package_unit: 'Kg' },
    {
      is_active: true,
      supplier_id: 'sup-A',
      purchase_unit: 'Kg',
      package_qty: 1000,
      package_unit: 'Gram',
      request_basis: REQUEST_BASIS.BASE_UNIT,
    }
  );
  assert.equal(toRawPurchaseQty(2500, config), 2.5); // 2500 gram butuh 2.5 kg
  assert.equal(toBaseQty(2.5, config), 2500);
});

test('Skenario: konversi pack -> gram dengan pembulatan ke kelipatan', () => {
  const config = resolvePurchaseConfig(mentega, {
    is_active: true,
    supplier_id: 'sup-A',
    purchase_unit: 'Pack',
    package_qty: 500,
    package_unit: 'Gram',
    min_order_qty: 1,
    order_multiple: 1,
    request_basis: REQUEST_BASIS.BASE_UNIT,
  });
  const suggestion = calculatePurchaseSuggestion(1200, config); // butuh 1200 gram
  assert.equal(suggestion.purchase_qty, 3); // 1200/500 = 2.4 -> dibulatkan ke 3
  assert.equal(suggestion.base_qty_ordered, 1500);
  assert.equal(suggestion.surplus_base_qty, 300);
  assert.equal(suggestion.rounded_up, true);
});

test('Skenario: kebutuhan lebih kecil dari minimum pembelian', () => {
  const config = resolvePurchaseConfig(mentega, {
    is_active: true,
    supplier_id: 'sup-A',
    purchase_unit: 'Dus',
    package_qty: 24,
    package_unit: 'Pcs',
    min_order_qty: 2,
    order_multiple: 1,
    request_basis: REQUEST_BASIS.BASE_UNIT,
  });
  // Butuh 10 pcs saja (< 1 dus), tapi minimum pembelian 2 dus
  const suggestion = calculatePurchaseSuggestion(10, config);
  assert.equal(suggestion.purchase_qty, 2, 'harus tetap beli minimum 2 dus');
  assert.equal(suggestion.base_qty_ordered, 48);
});

test('Skenario: kebutuhan besar, dibulatkan ke kelipatan pembelian (bukan minimum)', () => {
  const config = resolvePurchaseConfig(mentega, {
    is_active: true,
    supplier_id: 'sup-A',
    purchase_unit: 'Dus',
    package_qty: 24,
    package_unit: 'Pcs',
    min_order_qty: 1,
    order_multiple: 3, // supplier hanya jual kelipatan 3 dus
    request_basis: REQUEST_BASIS.BASE_UNIT,
  });
  // Butuh 100 pcs -> 100/24 = 4.166 dus -> naik ke kelipatan 3 terdekat = 6 dus
  const suggestion = calculatePurchaseSuggestion(100, config);
  assert.equal(suggestion.purchase_qty, 6);
  assert.equal(suggestion.base_qty_ordered, 144);
});

test('request_basis purchase_unit (default): qty input dianggap langsung satuan beli', () => {
  const config = resolvePurchaseConfig(mentega, {
    is_active: true,
    supplier_id: 'sup-A',
    min_order_qty: 1,
    order_multiple: 1,
    request_basis: REQUEST_BASIS.PURCHASE_UNIT,
  });
  assert.equal(getRequestUnit(config), config.purchase_unit);
  const suggestion = calculatePurchaseSuggestion(3, config);
  assert.equal(suggestion.purchase_qty, 3); // tidak dikonversi, identik input
});

test('Tanpa mapping sama sekali (bahan lain / instalasi lama): hasil identik Math.ceil lama', () => {
  const config = resolvePurchaseConfig(mentega, null);
  const suggestion = calculatePurchaseSuggestion(4.2, config);
  assert.equal(suggestion.purchase_qty, Math.ceil(4.2));
});

test('Skenario: merk ikut mapping outlet, beda dari merk default bahan', () => {
  const configDefault = resolvePurchaseConfig(mentega, null);
  assert.equal(configDefault.brand, null, 'bahan tanpa brand master -> null');

  const configWithMasterBrand = resolvePurchaseConfig({ ...mentega, brand: 'Merk Umum' }, null);
  assert.equal(configWithMasterBrand.brand, 'Merk Umum');

  const configA = resolvePurchaseConfig({ ...mentega, brand: 'Merk Umum' }, {
    is_active: true,
    supplier_id: 'sup-A',
    brand: 'Wisman',
  });
  const configB = resolvePurchaseConfig({ ...mentega, brand: 'Merk Umum' }, {
    is_active: true,
    supplier_id: 'sup-B',
    brand: 'Blue Band',
  });
  assert.equal(configA.brand, 'Wisman');
  assert.equal(configB.brand, 'Blue Band');
  assert.notEqual(
    purchaseConfigSignature(configA),
    purchaseConfigSignature(configB),
    'merk beda -> signature beda, tidak boleh digabung jadi 1 baris PO'
  );
});

test('Mapping tanpa brand sendiri jatuh ke merk default bahan (bukan null)', () => {
  const config = resolvePurchaseConfig({ ...mentega, brand: 'Merk Umum' }, {
    is_active: true,
    supplier_id: 'sup-A',
  });
  assert.equal(config.brand, 'Merk Umum');
});

test('Floating point noise tidak memicu pembulatan berlebih (1000/500 harus tetap 2, bukan 3)', () => {
  const config = resolvePurchaseConfig(mentega, {
    is_active: true,
    supplier_id: 'sup-A',
    purchase_unit: 'Pack',
    package_qty: 500,
    package_unit: 'Gram',
    min_order_qty: 1,
    order_multiple: 1,
    request_basis: REQUEST_BASIS.BASE_UNIT,
  });
  const suggestion = calculatePurchaseSuggestion(1000, config);
  assert.equal(suggestion.purchase_qty, 2);
  assert.equal(suggestion.rounded_up, false);
});
