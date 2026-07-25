const {
  REQUEST_BASIS,
  buildConfigKey,
  ceilQty,
  getRequestUnit,
  purchaseConfigSignature,
  resolvePurchaseConfig,
  roundQty,
  roundToPurchaseQty,
  toBaseQty,
  toRawPurchaseQty,
} = require('./purchaseConfig');

// For every 20 units ordered from supplier, 1 bonus unit is received free.
// Finds the minimum qty to order so that order + floor(order/20) >= totalNeeded.
function calcRotiTawarSupplierOrder(totalNeeded) {
  if (totalNeeded <= 0) return { order: 0, bonus: 0, fulfilled: 0 };
  if (totalNeeded < 20) return { order: totalNeeded, bonus: 0, fulfilled: totalNeeded };
  let optimal = totalNeeded;
  for (let q = totalNeeded; q >= 1; q--) {
    if (q + Math.floor(q / 20) >= totalNeeded) optimal = q;
    else break;
  }
  const bonus = Math.floor(optimal / 20);
  return { order: optimal, bonus, fulfilled: optimal + bonus };
}

function isRotiTawar(name) {
  return String(name || '').toLowerCase().includes('roti tawar');
}

// routing: { supplierOverrides, purchaseConfigs, suppliersById, outletsById } —
// hasil dari server/services/supplierRouting.js.
//
// purchaseConfigs memetakan "outlet_id:material_id" -> baris
// outlet_material_suppliers, yaitu konfigurasi pembelian bahan tersebut khusus
// untuk outlet itu: supplier, satuan beli, isi kemasan (faktor konversi ke
// satuan inventory), harga, minimum pembelian, dan kelipatan pembelian.
// Tanpa mapping, semuanya jatuh ke master bahan seperti sebelumnya.
//
// supplierOverrides tetap didukung untuk instalasi yang baru menjalankan
// migration mapping supplier tetapi belum migration konfigurasi pembelian.
function calculatePOs(requestItems, materials, routing = {}) {
  const {
    supplierOverrides = {},
    purchaseConfigs = {},
    suppliersById = {},
    outletsById = {},
  } = routing;

  const materialMap = {};
  materials.forEach((m) => {
    materialMap[m.id] = m;
  });

  // Kelompokkan per (supplier efektif, bahan, konfigurasi pembelian).
  // Konfigurasi ikut jadi kunci karena dua outlet bisa memesan bahan yang sama
  // ke supplier yang sama dengan kemasan/harga berbeda — qty-nya tidak
  // sebanding sehingga tidak boleh dijumlahkan jadi satu baris PO.
  const groups = {};
  requestItems.forEach((item) => {
    const requestedQty = Number(item.qty);
    if (!(requestedQty > 0)) return;
    const material = materialMap[item.material_id];
    if (!material) return;

    const mappingKey = buildConfigKey(item.outlet_id, item.material_id);
    const mapping = purchaseConfigs[mappingKey] || null;
    const config = resolvePurchaseConfig(material, mapping);

    const overrideSupplierId = config.supplier_id || supplierOverrides[mappingKey] || null;
    const supplierId = overrideSupplierId || material.supplier_id;
    if (!supplierId) return;

    const key = `${supplierId}::${item.material_id}::${purchaseConfigSignature(config)}`;
    if (!groups[key]) {
      groups[key] = {
        supplierId,
        materialId: item.material_id,
        config,
        requestedQty: 0,
        rawPurchaseQty: 0,
        overrideOutletIds: new Set(),
        outletRequests: [],
      };
    }

    const group = groups[key];
    group.requestedQty = roundQty(group.requestedQty + requestedQty);
    // Konversi per outlet lalu dijumlahkan. Karena konfigurasi dalam satu grup
    // identik, hasilnya sama dengan menjumlah dulu baru konversi — tetapi
    // pembulatan ke minimum/kelipatan sengaja dilakukan sekali di level
    // supplier (bukan per outlet) agar tidak memesan berlebih.
    group.rawPurchaseQty = roundQty(group.rawPurchaseQty + toRawPurchaseQty(requestedQty, config));
    if (overrideSupplierId) group.overrideOutletIds.add(item.outlet_id);
    group.outletRequests.push({
      outlet_id: item.outlet_id,
      outlet_name: outletsById[item.outlet_id]?.name || null,
      qty_requested: requestedQty,
    });
  });

  const supplierGroups = {};
  Object.values(groups).forEach((group) => {
    const { supplierId, materialId, config, rawPurchaseQty, overrideOutletIds } = group;
    const material = materialMap[materialId];
    const supplierRecord = suppliersById[supplierId] || material.supplier || null;
    // Tidak semua supplier memberi bonus kelipatan 20 — default true bila
    // belum diatur (lihat suppliersById di supplierRouting.js).
    const suppliesRotiTawarBonus = supplierRecord?.gives_roti_tawar_bonus !== false;

    let qtyOrdered = roundToPurchaseQty(rawPurchaseQty, config);
    let rotiTawarBonus = null;

    if (isRotiTawar(material.name) && suppliesRotiTawarBonus) {
      // Bonus dihitung dalam satuan beli, lalu hasilnya tetap divalidasi ke
      // minimum/kelipatan supplier (default 1/1 = tidak mengubah apa pun).
      const needed = ceilQty(rawPurchaseQty);
      const { order, bonus, fulfilled } = calcRotiTawarSupplierOrder(needed);
      rotiTawarBonus = { total_needed: needed, bonus, fulfilled };
      qtyOrdered = roundToPurchaseQty(order, config);
    }

    if (!supplierGroups[supplierId]) {
      supplierGroups[supplierId] = {
        supplier_id: supplierId,
        supplier: supplierRecord,
        items: [],
        total_estimated: 0,
      };
    }

    const price = Number(config.price_per_purchase_unit || 0);
    const subtotal = roundQty(qtyOrdered * price);
    const baseQtyNeeded = toBaseQty(rawPurchaseQty, config);
    const baseQtyOrdered = toBaseQty(qtyOrdered, config);

    const itemEntry = {
      material_id: materialId,
      material_name: material.name,
      material_code: material.code,
      // Merk ikut konfigurasi outlet+supplier (config.brand) — supplier
      // berbeda bisa jual merk berbeda walau bahan masternya sama. Fallback
      // ke material.brand sudah ditangani resolvePurchaseConfig.
      material_brand: config.brand,
      qty_ordered: qtyOrdered,
      purchase_unit: config.purchase_unit,
      package_qty: config.package_qty,
      package_unit: config.package_unit,
      price_per_purchase_unit: price,
      subtotal_estimated: subtotal,
      // Rincian konversi & pembulatan agar bisa ditampilkan di Review Order
      // dan diaudit ("kenapa 700 gram jadi 2 pack?").
      purchase_conversion: {
        config_source: config.source,
        request_basis: config.request_basis,
        request_unit: getRequestUnit(config),
        qty_requested: group.requestedQty,
        raw_purchase_qty: rawPurchaseQty,
        min_order_qty: config.min_order_qty,
        order_multiple: config.order_multiple,
        base_unit: config.package_unit,
        base_qty_needed: baseQtyNeeded,
        base_qty_ordered: baseQtyOrdered,
        surplus_base_qty: roundQty(Math.max(0, baseQtyOrdered - baseQtyNeeded)),
        rounded_up: qtyOrdered > rawPurchaseQty,
        converted: config.request_basis === REQUEST_BASIS.BASE_UNIT,
      },
      outlet_requests: group.outletRequests,
    };
    if (rotiTawarBonus) itemEntry.roti_tawar_bonus = rotiTawarBonus;
    if (overrideOutletIds.size > 0) {
      itemEntry.mapped_outlets = [...overrideOutletIds].map(
        (oid) => outletsById[oid]?.name || oid
      );
    }
    supplierGroups[supplierId].items.push(itemEntry);
    supplierGroups[supplierId].total_estimated = roundQty(
      supplierGroups[supplierId].total_estimated + subtotal
    );
  });

  return Object.values(supplierGroups);
}

module.exports = { calculatePOs };
