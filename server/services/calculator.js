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

// routing: { supplierOverrides, suppliersById, outletsById } — hasil dari
// server/services/supplierRouting.js. supplierOverrides memetakan
// "outlet_id:material_id" -> supplier_id, dipakai untuk mengalihkan sebagian
// qty sebuah bahan ke supplier lain tergantung outlet pemesan (mis. cabang
// yang lebih dekat ke supplier tertentu). Tanpa mapping, tetap pakai
// supplier default bahan seperti sebelumnya.
function calculatePOs(requestItems, materials, routing = {}) {
  const { supplierOverrides = {}, suppliersById = {}, outletsById = {} } = routing;

  const materialMap = {};
  materials.forEach((m) => {
    materialMap[m.id] = m;
  });

  // Kelompokkan qty per (supplier efektif, bahan) — bukan per bahan saja,
  // karena outlet berbeda bisa dialihkan ke supplier berbeda untuk bahan yang sama.
  const totals = {};
  requestItems.forEach((item) => {
    if (!(Number(item.qty) > 0)) return;
    const material = materialMap[item.material_id];
    if (!material) return;

    const overrideSupplierId = supplierOverrides[`${item.outlet_id}:${item.material_id}`];
    const supplierId = overrideSupplierId || material.supplier_id;
    if (!supplierId) return;

    const key = `${supplierId}::${item.material_id}`;
    if (!totals[key]) {
      totals[key] = {
        supplierId,
        materialId: item.material_id,
        qty: 0,
        overrideOutletIds: new Set(),
      };
    }
    totals[key].qty += Number(item.qty);
    if (overrideSupplierId) totals[key].overrideOutletIds.add(item.outlet_id);
  });

  const supplierGroups = {};
  Object.values(totals).forEach(({ supplierId, materialId, qty, overrideOutletIds }) => {
    const material = materialMap[materialId];

    let qtyOrdered = Math.ceil(qty);
    let rotiTawarBonus = null;

    if (isRotiTawar(material.name)) {
      const { order, bonus, fulfilled } = calcRotiTawarSupplierOrder(Math.ceil(qty));
      rotiTawarBonus = { total_needed: Math.ceil(qty), bonus, fulfilled };
      qtyOrdered = order;
    }

    if (!supplierGroups[supplierId]) {
      supplierGroups[supplierId] = {
        supplier_id: supplierId,
        supplier: suppliersById[supplierId] || material.supplier || null,
        items: [],
        total_estimated: 0,
      };
    }

    const subtotal = qtyOrdered * Number(material.price_per_purchase_unit || 0);
    const itemEntry = {
      material_id: materialId,
      material_name: material.name,
      material_code: material.code,
      material_brand: material.brand || null,
      qty_ordered: qtyOrdered,
      purchase_unit: material.purchase_unit,
      package_qty: material.package_qty,
      package_unit: material.package_unit,
      price_per_purchase_unit: Number(material.price_per_purchase_unit || 0),
      subtotal_estimated: subtotal,
    };
    if (rotiTawarBonus) itemEntry.roti_tawar_bonus = rotiTawarBonus;
    if (overrideOutletIds.size > 0) {
      itemEntry.mapped_outlets = [...overrideOutletIds].map(
        (oid) => outletsById[oid]?.name || oid
      );
    }
    supplierGroups[supplierId].items.push(itemEntry);
    supplierGroups[supplierId].total_estimated += subtotal;
  });

  return Object.values(supplierGroups);
}

module.exports = { calculatePOs };
