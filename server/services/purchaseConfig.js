'use strict';

// ============================================================
// purchaseConfig.js — Konfigurasi pembelian efektif per (outlet, bahan).
//
// Satu bahan punya satu identitas master (materials) supaya inventory dan
// laporan konsisten, tetapi ATURAN PEMBELIANNYA bisa berbeda per outlet:
// supplier, satuan beli, isi kemasan, harga, minimum, dan kelipatan order.
// Konfigurasi itu disimpan di outlet_material_suppliers; kolom yang NULL
// berarti "ikut master bahan", bukan "kosong".
//
//   Outlet → Bahan → Supplier → Satuan Beli / Min Order → Harga Beli
//
// Semua fungsi di sini murni (tanpa I/O) supaya mudah diuji dan bisa dipakai
// dari calculator PO maupun endpoint preview di Master Data.
// ============================================================

const REQUEST_BASIS = {
  // qty yang diinput di Order Entry sudah dalam satuan beli (perilaku lama)
  PURCHASE_UNIT: 'purchase_unit',
  // qty yang diinput adalah kebutuhan dalam satuan inventory (gram/ml/pcs),
  // sistem yang mengonversi ke jumlah satuan beli lewat package_qty
  BASE_UNIT: 'base_unit',
};

const REQUEST_BASIS_VALUES = [REQUEST_BASIS.PURCHASE_UNIT, REQUEST_BASIS.BASE_UNIT];

// Toleransi noise floating point. 1000/500 bisa menghasilkan 2.0000000000000004
// yang kalau langsung di-Math.ceil jadi 3 pack — overspend yang tidak kelihatan.
const EPSILON = 1e-9;

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toPositiveNumber(value) {
  const number = toFiniteNumber(value);
  return number !== null && number > 0 ? number : null;
}

function toNonNegativeNumber(value) {
  const number = toFiniteNumber(value);
  return number !== null && number >= 0 ? number : null;
}

function toCleanString(value) {
  const text = String(value ?? '').trim();
  return text === '' ? null : text;
}

// Buang sisa pembagian biner (0.1 + 0.2 = 0.30000000000000004) sebelum
// dibandingkan atau ditampilkan.
function roundQty(value) {
  return Math.round(value * 1e6) / 1e6;
}

// Math.ceil yang tahan noise floating point.
function ceilQty(value) {
  const nearest = Math.round(value);
  if (Math.abs(value - nearest) < EPSILON) return nearest;
  return Math.ceil(value);
}

function buildConfigKey(outletId, materialId) {
  return `${outletId}:${materialId}`;
}

function normalizeRequestBasis(value) {
  return value === REQUEST_BASIS.BASE_UNIT ? REQUEST_BASIS.BASE_UNIT : REQUEST_BASIS.PURCHASE_UNIT;
}

/**
 * Gabungkan master bahan dengan baris mapping outlet menjadi satu konfigurasi
 * pembelian efektif. Mapping yang tidak aktif diabaikan (kembali ke master).
 *
 * @param {object} material baris materials
 * @param {object|null} mapping baris outlet_material_suppliers (boleh null)
 * @returns {object} konfigurasi efektif
 */
function resolvePurchaseConfig(material, mapping = null) {
  const master = material || {};
  const override = mapping && mapping.is_active !== false ? mapping : null;

  const purchaseUnit =
    (override && toCleanString(override.purchase_unit)) ??
    toCleanString(master.purchase_unit) ??
    'Pcs';

  // Faktor konversi: 1 satuan beli = packageQty satuan inventory.
  const packageQty =
    (override && toPositiveNumber(override.package_qty)) ??
    toPositiveNumber(master.package_qty) ??
    1;

  const packageUnit =
    (override && toCleanString(override.package_unit)) ??
    toCleanString(master.package_unit) ??
    purchaseUnit;

  const price =
    (override && toNonNegativeNumber(override.price_per_purchase_unit)) ??
    toNonNegativeNumber(master.price_per_purchase_unit) ??
    0;

  // Minimum, kelipatan, dan basis input hanya ada di level mapping outlet.
  // Tanpa mapping → 1 / 1 / purchase_unit = persis perilaku sebelum fitur ini.
  const minOrderQty = (override && toPositiveNumber(override.min_order_qty)) ?? 1;
  const orderMultiple = (override && toPositiveNumber(override.order_multiple)) ?? 1;
  const requestBasis = override
    ? normalizeRequestBasis(override.request_basis)
    : REQUEST_BASIS.PURCHASE_UNIT;

  return {
    config_id: override?.id ?? null,
    // supplier_id di sini murni hasil mapping outlet. Fallback ke supplier
    // default bahan dilakukan pemanggil supaya routing lama tetap berlaku.
    supplier_id: override?.supplier_id ?? null,
    purchase_unit: purchaseUnit,
    package_qty: packageQty,
    package_unit: packageUnit,
    price_per_purchase_unit: price,
    min_order_qty: minOrderQty,
    order_multiple: orderMultiple,
    request_basis: requestBasis,
    source: override ? 'outlet_mapping' : 'material_default',
  };
}

// Satuan yang dipakai saat mengisi qty di Order Entry untuk konfigurasi ini.
function getRequestUnit(config) {
  return config.request_basis === REQUEST_BASIS.BASE_UNIT
    ? config.package_unit
    : config.purchase_unit;
}

/**
 * Ubah qty permintaan menjadi jumlah satuan beli — belum dibulatkan ke
 * minimum/kelipatan. Untuk basis base_unit, 700 gram dengan kemasan 500 gram
 * menghasilkan 1.4 (satuan beli).
 */
function toRawPurchaseQty(requestedQty, config) {
  const qty = toNonNegativeNumber(requestedQty) ?? 0;
  if (qty <= 0) return 0;
  if (config.request_basis !== REQUEST_BASIS.BASE_UNIT) return roundQty(qty);
  const factor = toPositiveNumber(config.package_qty) ?? 1;
  return roundQty(qty / factor);
}

/**
 * Bulatkan ke jumlah pembelian yang valid: minimal min_order_qty, lalu naik ke
 * kelipatan order_multiple terdekat. 1.4 pack dengan min 1 & kelipatan 1 → 2.
 * Dengan default (1 dan 1) hasilnya identik dengan Math.ceil sebelumnya.
 */
function roundToPurchaseQty(rawQty, config) {
  const qty = toNonNegativeNumber(rawQty) ?? 0;
  if (qty <= 0) return 0;

  const multiple = toPositiveNumber(config.order_multiple) ?? 1;
  const minimum = toPositiveNumber(config.min_order_qty) ?? 0;

  const target = Math.max(qty, minimum);
  const steps = Math.max(1, ceilQty(roundQty(target / multiple)));
  return roundQty(steps * multiple);
}

// Jumlah satuan inventory yang masuk dari sekian satuan beli.
function toBaseQty(purchaseQty, config) {
  const qty = toNonNegativeNumber(purchaseQty) ?? 0;
  const factor = toPositiveNumber(config.package_qty) ?? 1;
  return roundQty(qty * factor);
}

/**
 * Tanda tangan konfigurasi — dipakai calculator untuk mengelompokkan.
 * Dua outlet dengan supplier sama TAPI kemasan/harga berbeda tidak boleh
 * digabung jadi satu baris PO karena qty-nya tidak sebanding.
 */
function purchaseConfigSignature(config) {
  return [
    config.purchase_unit,
    config.package_qty,
    config.package_unit,
    config.price_per_purchase_unit,
    config.min_order_qty,
    config.order_multiple,
    config.request_basis,
  ].join('|');
}

/**
 * Hitung usulan pembelian untuk satu konfigurasi.
 * Dipakai endpoint preview di Master Data dan dipakai ulang logikanya oleh
 * calculator PO.
 *
 * @returns {{ raw_purchase_qty, purchase_qty, base_qty_needed, base_qty_ordered,
 *             subtotal, rounded_up, surplus_base_qty }}
 */
function calculatePurchaseSuggestion(requestedQty, config) {
  const rawPurchaseQty = toRawPurchaseQty(requestedQty, config);
  const purchaseQty = roundToPurchaseQty(rawPurchaseQty, config);
  const baseQtyNeeded = toBaseQty(rawPurchaseQty, config);
  const baseQtyOrdered = toBaseQty(purchaseQty, config);

  return {
    raw_purchase_qty: rawPurchaseQty,
    purchase_qty: purchaseQty,
    base_qty_needed: baseQtyNeeded,
    base_qty_ordered: baseQtyOrdered,
    surplus_base_qty: roundQty(Math.max(0, baseQtyOrdered - baseQtyNeeded)),
    rounded_up: purchaseQty - rawPurchaseQty > EPSILON,
    subtotal: roundQty(purchaseQty * (toNonNegativeNumber(config.price_per_purchase_unit) ?? 0)),
  };
}

module.exports = {
  REQUEST_BASIS,
  REQUEST_BASIS_VALUES,
  buildConfigKey,
  calculatePurchaseSuggestion,
  ceilQty,
  getRequestUnit,
  normalizeRequestBasis,
  purchaseConfigSignature,
  resolvePurchaseConfig,
  roundQty,
  roundToPurchaseQty,
  toBaseQty,
  toRawPurchaseQty,
};
