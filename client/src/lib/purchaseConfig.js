// ============================================================
// purchaseConfig.js (client) — versi ringan dari server/services/purchaseConfig.js
// dipakai untuk menampilkan satuan & hasil hitung pembelian di UI (Order Entry,
// Master Data preview) tanpa perlu round-trip ke server untuk sekadar label.
//
// Sumber kebenaran hitungan tetap di backend (server/services/purchaseConfig.js
// dan calculator.js) — fungsi di sini hanya untuk preview/label, bukan untuk
// menyimpan angka final ke database.
// ============================================================

export const REQUEST_BASIS = {
  PURCHASE_UNIT: 'purchase_unit',
  BASE_UNIT: 'base_unit',
};

const toPositiveNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
};

const toNonNegativeNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : null;
};

const toCleanString = (value) => {
  const text = String(value ?? '').trim();
  return text === '' ? null : text;
};

export const buildConfigKey = (outletId, materialId) => `${outletId}:${materialId}`;

// Gabungkan master bahan + baris mapping outlet (jika ada & aktif) menjadi
// konfigurasi pembelian efektif. Cermin dari resolvePurchaseConfig di server.
export function resolvePurchaseConfig(material, mapping = null) {
  const master = material || {};
  const override = mapping && mapping.is_active !== false ? mapping : null;

  const purchaseUnit =
    (override && toCleanString(override.purchase_unit)) ??
    toCleanString(master.purchase_unit) ??
    'Pcs';

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

  const minOrderQty = (override && toPositiveNumber(override.min_order_qty)) ?? 1;
  const orderMultiple = (override && toPositiveNumber(override.order_multiple)) ?? 1;
  const requestBasis =
    override && override.request_basis === REQUEST_BASIS.BASE_UNIT
      ? REQUEST_BASIS.BASE_UNIT
      : REQUEST_BASIS.PURCHASE_UNIT;

  return {
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

// Satuan yang staff harus input di Order Entry untuk konfigurasi ini.
export function getRequestUnit(config) {
  return config.request_basis === REQUEST_BASIS.BASE_UNIT
    ? config.package_unit
    : config.purchase_unit;
}

const round6 = (value) => Math.round(value * 1e6) / 1e6;

// Perkiraan cepat jumlah satuan beli dari qty input — untuk preview UI saja
// (pembulatan akhir & subtotal tetap dihitung server saat Review Order).
export function estimatePurchaseQty(requestedQty, config) {
  const qty = toNonNegativeNumber(requestedQty) ?? 0;
  if (qty <= 0) return 0;
  const raw =
    config.request_basis === REQUEST_BASIS.BASE_UNIT
      ? qty / (toPositiveNumber(config.package_qty) ?? 1)
      : qty;
  const multiple = toPositiveNumber(config.order_multiple) ?? 1;
  const minimum = toPositiveNumber(config.min_order_qty) ?? 0;
  const target = Math.max(raw, minimum);
  const steps = Math.max(1, Math.ceil(round6(target / multiple)));
  return round6(steps * multiple);
}

// Preview lengkap untuk form admin ("700 gram jadi berapa pack, berapa rupiah?").
// Cermin ringan dari calculatePurchaseSuggestion di server — dipakai HANYA
// untuk pratinjau instan di UI, bukan sumber kebenaran angka PO.
export function calculatePurchaseSuggestion(requestedQty, config) {
  const qty = toNonNegativeNumber(requestedQty) ?? 0;
  const factor = toPositiveNumber(config.package_qty) ?? 1;
  const rawPurchaseQty =
    qty <= 0 ? 0 : round6(config.request_basis === REQUEST_BASIS.BASE_UNIT ? qty / factor : qty);
  const purchaseQty = estimatePurchaseQty(requestedQty, config);
  const baseQtyNeeded = round6(rawPurchaseQty * factor);
  const baseQtyOrdered = round6(purchaseQty * factor);

  return {
    raw_purchase_qty: rawPurchaseQty,
    purchase_qty: purchaseQty,
    base_qty_needed: baseQtyNeeded,
    base_qty_ordered: baseQtyOrdered,
    surplus_base_qty: round6(Math.max(0, baseQtyOrdered - baseQtyNeeded)),
    rounded_up: purchaseQty > rawPurchaseQty,
    subtotal: round6(purchaseQty * (toNonNegativeNumber(config.price_per_purchase_unit) ?? 0)),
  };
}
