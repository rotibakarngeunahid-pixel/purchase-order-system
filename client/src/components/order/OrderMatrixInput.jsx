import { useState } from 'react';
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
  const [focusedRow, setFocusedRow] = useState(null);
  const [focusedCol, setFocusedCol] = useState(null);

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="text-sm border-collapse" style={{ minWidth: '600px' }}>
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-brand-red text-white px-4 py-3 text-left font-medium min-w-[170px] border-r border-red-700">
                Bahan Baku
              </th>
              {outlets.map((outlet) => {
                const open = outletOpen[outlet.id] !== false;
                const isColFocused = focusedCol === outlet.id;
                return (
                  <th
                    key={outlet.id}
                    className={`px-3 py-3 text-center font-medium min-w-[100px] border-r border-red-700 transition-colors ${
                      isColFocused
                        ? 'bg-red-700 text-white'
                        : open
                        ? 'bg-brand-red text-white'
                        : 'bg-red-900 text-red-300'
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
          <tbody>
            {materials.map((mat) => {
              const rowTotal = outlets.reduce(
                (sum, outlet) => sum + (Number(matrix[getMatrixKey(outlet.id, mat.id)]) || 0),
                0
              );
              const isRoti = isRotiTawar(mat);
              const isRowFocused = focusedRow === mat.id;
              const rowHasValue = rowTotal > 0;
              const rowBg = isRowFocused
                ? '#fff8f8'
                : rowHasValue
                ? '#f0fdf4'
                : undefined;

              return (
                <tr
                  key={mat.id}
                  style={{ backgroundColor: rowBg }}
                  className="border-b border-gray-100 transition-colors hover:bg-orange-50/30"
                >
                  <td
                    className="sticky left-0 z-10 px-4 py-2.5 border-r border-gray-200 font-medium text-gray-800"
                    style={{ backgroundColor: rowBg ?? '#ffffff' }}
                  >
                    <div className="text-xs text-gray-400 leading-none font-mono">{mat.code}</div>
                    <div className="leading-tight mt-0.5">{mat.name}</div>
                    <div className="text-xs text-brand-orange leading-none mt-0.5">
                      {mat.purchase_unit}
                    </div>
                    {isRoti && (
                      <span className="inline-block mt-1 text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">
                        Roti Tawar
                      </span>
                    )}
                  </td>
                  {outlets.map((outlet) => {
                    const key = getMatrixKey(outlet.id, mat.id);
                    const val = matrix[key];
                    const filled = Number(val) > 0;
                    const stockInfo = isRoti ? rotiStockMap[outlet.id] : null;
                    const stockLow = stockInfo && stockInfo.current_stock < stockInfo.min_stock;

                    return (
                      <td
                        key={outlet.id}
                        className={`px-2 py-1.5 text-center border-r border-gray-100 transition-colors ${
                          filled ? 'bg-green-50' : ''
                        }`}
                      >
                        <input
                          type="number"
                          min="0"
                          value={val === '' ? '' : val ?? ''}
                          onChange={(e) => onCellChange(outlet.id, mat.id, e.target.value)}
                          onFocus={() => {
                            setFocusedRow(mat.id);
                            setFocusedCol(outlet.id);
                          }}
                          onBlur={() => {
                            setFocusedRow(null);
                            setFocusedCol(null);
                          }}
                          disabled={isReadOnly}
                          className={`w-full text-center border rounded-md px-1 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-brand-red disabled:bg-gray-100 disabled:text-gray-400 transition-colors tabular-nums ${
                            filled
                              ? 'border-green-300 bg-white font-bold text-gray-900'
                              : 'border-gray-200'
                          }`}
                          placeholder="0"
                        />
                        {stockInfo && (
                          <div
                            className={`mt-0.5 text-xs leading-tight ${
                              stockLow ? 'text-red-500 font-semibold' : 'text-gray-400'
                            }`}
                          >
                            {stockInfo.current_stock}
                            <span className="text-gray-300">/{stockInfo.min_stock}</span>
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td
                    className={`px-3 py-2.5 text-center font-bold transition-colors ${
                      rowHasValue ? 'text-brand-red bg-green-50' : 'bg-red-50 text-gray-300'
                    }`}
                  >
                    {rowTotal > 0 ? rowTotal : '—'}
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
                    className="px-3 py-3 text-center font-bold border-r border-gray-100 tabular-nums"
                  >
                    {total > 0 ? (
                      <span className="text-brand-orange">{total}</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                );
              })}
              <td className="px-3 py-3 text-center font-bold text-brand-red text-base tabular-nums">
                {outlets.reduce(
                  (sum, outlet) => sum + calcTotalPerOutlet(outlet, materials, matrix),
                  0
                ) || '—'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
