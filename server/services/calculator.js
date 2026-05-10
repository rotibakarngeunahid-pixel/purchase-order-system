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

function calculatePOs(requestItems, materials) {
  const totalByMaterial = {};
  requestItems.forEach((item) => {
    if (item.qty > 0) {
      totalByMaterial[item.material_id] =
        (totalByMaterial[item.material_id] || 0) + Number(item.qty);
    }
  });

  const materialMap = {};
  materials.forEach((m) => {
    materialMap[m.id] = m;
  });

  const supplierGroups = {};
  Object.entries(totalByMaterial).forEach(([materialId, totalQty]) => {
    const material = materialMap[materialId];
    if (!material || !material.supplier_id) return;

    let qtyOrdered = Math.ceil(totalQty);
    let rotiTawarBonus = null;

    if (isRotiTawar(material.name)) {
      const { order, bonus, fulfilled } = calcRotiTawarSupplierOrder(Math.ceil(totalQty));
      rotiTawarBonus = { total_needed: Math.ceil(totalQty), bonus, fulfilled };
      qtyOrdered = order;
    }

    const supplierId = material.supplier_id;

    if (!supplierGroups[supplierId]) {
      supplierGroups[supplierId] = {
        supplier_id: supplierId,
        supplier: material.supplier,
        items: [],
        total_estimated: 0,
      };
    }

    const subtotal = qtyOrdered * Number(material.price_per_purchase_unit || 0);
    const itemEntry = {
      material_id: materialId,
      material_name: material.name,
      material_code: material.code,
      qty_ordered: qtyOrdered,
      purchase_unit: material.purchase_unit,
      package_qty: material.package_qty,
      package_unit: material.package_unit,
      price_per_purchase_unit: Number(material.price_per_purchase_unit || 0),
      subtotal_estimated: subtotal,
    };
    if (rotiTawarBonus) itemEntry.roti_tawar_bonus = rotiTawarBonus;
    supplierGroups[supplierId].items.push(itemEntry);
    supplierGroups[supplierId].total_estimated += subtotal;
  });

  return Object.values(supplierGroups);
}

module.exports = { calculatePOs };
