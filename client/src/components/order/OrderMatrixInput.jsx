import { getMatrixKey, calcTotalPerOutlet, isRotiTawar } from '../../lib/orderHelpers';

export default function OrderMatrixInput({
  materials,
  outlets,
  matrix,
  onCellChange,
  outletOpen,
  isReadOnly,
  rotiStockMap,
}) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="text-sm border-collapse" style={{ minWidth: '600px' }}>
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-brand-red text-white px-4 py-3 text-left font-medium min-w-[160px] border-r border-red-700">
                Bahan Baku
              </th>
              {outlets.map((outlet) => {
                const open = outletOpen[outlet.id] !== false;
                return (
                  <th
                    key={outlet.id}
                    className={`px-3 py-3 text-center font-medium min-w-[90px] border-r border-red-700 ${
                      open ? 'bg-brand-red text-white' : 'bg-red-900 text-red-300'
                    }`}
                  >
                    <div className="text-xs leading-tight">{outlet.name}</div>
                    {!open && (
                      <div className="text-xs mt-0.5 font-normal opacity-60">Tutup</div>
                    )}
                  </th>
                );
              })}
              <th className="bg-red-900 text-white px-3 py-3 text-center font-medium min-w-[70px]">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {materials.map((mat, matIdx) => {
              const rowTotal = outlets.reduce(
                (sum, outlet) => sum + (Number(matrix[getMatrixKey(outlet.id, mat.id)]) || 0),
                0
              );
              const isRoti = isRotiTawar(mat);
              const rowBg = matIdx % 2 === 0 ? '#ffffff' : '#f9fafb';
              return (
                <tr key={mat.id} style={{ backgroundColor: rowBg }}>
                  <td
                    className="sticky left-0 z-10 px-4 py-2 border-r border-gray-200 font-medium text-gray-800"
                    style={{ backgroundColor: rowBg }}
                  >
                    <div className="text-xs text-gray-400 leading-none">{mat.code}</div>
                    <div className="leading-tight">{mat.name}</div>
                    <div className="text-xs text-brand-orange leading-none">{mat.purchase_unit}</div>
                    {isRoti && (
                      <span className="inline-block mt-0.5 text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">
                        Roti Tawar
                      </span>
                    )}
                  </td>
                  {outlets.map((outlet) => {
                    const key = getMatrixKey(outlet.id, mat.id);
                    const val = matrix[key];
                    const stockInfo = isRoti ? rotiStockMap[outlet.id] : null;
                    const stockLow = stockInfo && stockInfo.current_stock < stockInfo.min_stock;
                    return (
                      <td key={outlet.id} className="px-2 py-1.5 text-center border-r border-gray-100">
                        <input
                          type="number"
                          min="0"
                          value={val === '' ? '' : val ?? ''}
                          onChange={(e) => onCellChange(outlet.id, mat.id, e.target.value)}
                          disabled={isReadOnly}
                          className="w-full text-center border border-gray-200 rounded-md px-1 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-red focus:border-brand-red disabled:bg-gray-100 disabled:text-gray-400"
                          placeholder="0"
                        />
                        {stockInfo && (
                          <div
                            className={`mt-0.5 text-xs leading-tight ${
                              stockLow ? 'text-red-500 font-semibold' : 'text-gray-400'
                            }`}
                          >
                            {stockInfo.current_stock}
                            <span className="text-gray-300"> / {stockInfo.min_stock}</span>
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-center font-semibold text-brand-red bg-red-50">
                    {rowTotal > 0 ? rowTotal : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-orange-50 border-t-2 border-brand-orange">
              <td className="sticky left-0 px-4 py-3 font-semibold text-gray-700 border-r border-gray-200 bg-orange-50 text-sm">
                Total per Outlet
              </td>
              {outlets.map((outlet) => {
                const total = calcTotalPerOutlet(outlet, materials, matrix);
                return (
                  <td
                    key={outlet.id}
                    className="px-3 py-3 text-center font-semibold text-brand-orange border-r border-gray-100"
                  >
                    {total > 0 ? total : <span className="text-gray-300">—</span>}
                  </td>
                );
              })}
              <td className="px-3 py-3 text-center font-bold text-brand-red">
                {outlets.reduce(
                  (sum, outlet) => sum + calcTotalPerOutlet(outlet, materials, matrix),
                  0
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
