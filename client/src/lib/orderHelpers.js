export const getMatrixKey = (outletId, materialId) => `${outletId}_${materialId}`;

const normalizeName = (value) => String(value || '').trim().toLowerCase();

const toNonNegativeNumber = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return number;
};

export const isRotiTawar = (mat) =>
  normalizeName(typeof mat === 'string' ? mat : mat?.name).includes('roti tawar');

export const calcRotiTawarSupplierOrder = (totalNeeded) => {
  const needed = Math.ceil(toNonNegativeNumber(totalNeeded));
  if (needed <= 0) return { order: 0, bonus: 0, fulfilled: 0 };
  if (needed < 20) return { order: needed, bonus: 0, fulfilled: needed };

  let optimal = needed;
  for (let qty = needed; qty >= 1; qty -= 1) {
    if (qty + Math.floor(qty / 20) >= needed) {
      optimal = qty;
    } else {
      break;
    }
  }

  const bonus = Math.floor(optimal / 20);
  return { order: optimal, bonus, fulfilled: optimal + bonus };
};

export const buildRotiTawarLiveSummary = ({
  materials = [],
  outlets = [],
  matrix = {},
  rotiDetail = null,
} = {}) => {
  const rotiMaterial = materials.find(isRotiTawar);
  const recommendationTotal =
    rotiDetail?.total_needed == null ? null : toNonNegativeNumber(rotiDetail.total_needed);

  if (!rotiMaterial) {
    return {
      hasRotiMaterial: false,
      currentTotal: 0,
      supplierOrder: 0,
      bonus: 0,
      fulfilled: 0,
      recommendationTotal,
      deltaTotal: null,
      branches: [],
    };
  }

  const getInputQty = (outletId) =>
    toNonNegativeNumber(matrix[getMatrixKey(outletId, rotiMaterial.id)]);

  const currentTotal = outlets.reduce((sum, outlet) => sum + getInputQty(outlet.id), 0);
  const supplier = calcRotiTawarSupplierOrder(currentTotal);
  const outletByName = new Map(outlets.map((outlet) => [normalizeName(outlet.name), outlet]));
  const branches = Array.isArray(rotiDetail?.branches)
    ? rotiDetail.branches.map((branch) => {
        const outlet = outletByName.get(normalizeName(branch.display_name));
        const recommendedNeed = toNonNegativeNumber(branch.need);
        const inputQty = outlet ? getInputQty(outlet.id) : 0;
        const delta = inputQty - recommendedNeed;

        return {
          ...branch,
          outlet_id: outlet?.id ?? null,
          current_stock: toNonNegativeNumber(branch.current_stock),
          min_stock: toNonNegativeNumber(branch.min_stock),
          recommended_need: recommendedNeed,
          input_qty: inputQty,
          delta,
          status: delta < 0 ? 'less' : delta > 0 ? 'more' : 'match',
          mapping_found: !!outlet,
        };
      })
    : [];

  return {
    hasRotiMaterial: true,
    currentTotal,
    supplierOrder: supplier.order,
    bonus: supplier.bonus,
    fulfilled: supplier.fulfilled,
    recommendationTotal,
    deltaTotal: recommendationTotal == null ? null : currentTotal - recommendationTotal,
    branches,
  };
};

export const calcTotalPerOutlet = (outlet, materials, matrix) =>
  materials.reduce((sum, mat) => sum + (Number(matrix[getMatrixKey(outlet.id, mat.id)]) || 0), 0);

export const calcGrandTotal = (outlets, materials, matrix) =>
  outlets.reduce((sum, outlet) => sum + calcTotalPerOutlet(outlet, materials, matrix), 0);

export const calcFilledOutlets = (outlets, materials, matrix) =>
  outlets.filter((outlet) =>
    materials.some((mat) => (Number(matrix[getMatrixKey(outlet.id, mat.id)]) || 0) > 0)
  ).length;

// Ambil harga satuan beli dari material. Mengembalikan null jika tidak ada harga.
export const getMaterialUnitPrice = (material) => {
  if (!material) return null;
  const price = Number(material.price_per_purchase_unit);
  return Number.isFinite(price) && price > 0 ? price : null;
};

// Hitung estimasi total harga purchase order dari matrix input.
// Hasil: { total, hasMissingPrices, missingPriceCount }
export const calculateOrderEstimate = (matrix = {}, materials = [], outlets = []) => {
  let total = 0;
  const missingMaterialIds = new Set();

  for (const outlet of outlets) {
    for (const material of materials) {
      const qty = toNonNegativeNumber(matrix[getMatrixKey(outlet.id, material.id)]);
      if (qty <= 0) continue;
      const price = getMaterialUnitPrice(material);
      if (price === null) {
        missingMaterialIds.add(material.id);
      } else {
        total += qty * price;
      }
    }
  }

  return {
    total: Math.max(0, total),
    hasMissingPrices: missingMaterialIds.size > 0,
    missingPriceCount: missingMaterialIds.size,
  };
};
