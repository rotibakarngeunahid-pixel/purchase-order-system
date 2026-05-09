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

    const qtyOrdered = Math.ceil(totalQty);
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
    supplierGroups[supplierId].items.push({
      material_id: materialId,
      material_name: material.name,
      material_code: material.code,
      qty_ordered: qtyOrdered,
      purchase_unit: material.purchase_unit,
      package_qty: material.package_qty,
      package_unit: material.package_unit,
      price_per_purchase_unit: Number(material.price_per_purchase_unit || 0),
      subtotal_estimated: subtotal,
    });
    supplierGroups[supplierId].total_estimated += subtotal;
  });

  return Object.values(supplierGroups);
}

module.exports = { calculatePOs };
