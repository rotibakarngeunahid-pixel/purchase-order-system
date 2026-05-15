export const getMatrixKey = (outletId, materialId) => `${outletId}_${materialId}`;

export const isRotiTawar = (mat) => mat.name.toLowerCase().includes('roti tawar');

export const calcTotalPerOutlet = (outlet, materials, matrix) =>
  materials.reduce((sum, mat) => sum + (Number(matrix[getMatrixKey(outlet.id, mat.id)]) || 0), 0);

export const calcGrandTotal = (outlets, materials, matrix) =>
  outlets.reduce((sum, outlet) => sum + calcTotalPerOutlet(outlet, materials, matrix), 0);

export const calcFilledOutlets = (outlets, materials, matrix) =>
  outlets.filter((outlet) =>
    materials.some((mat) => (Number(matrix[getMatrixKey(outlet.id, mat.id)]) || 0) > 0)
  ).length;
