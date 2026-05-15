import { useState } from 'react';
import { getMatrixKey, isRotiTawar, calcTotalPerOutlet } from '../../lib/orderHelpers';

export default function OutletOrderInput({
  outlets,
  materials,
  matrix,
  onCellChange,
  outletOpen,
  outletDays,
  onToggleOpen,
  onToggleDays,
  rotiStockMap,
  isReadOnly,
}) {
  const [selectedOutletId, setSelectedOutletId] = useState(outlets[0]?.id ?? null);
  const selectedOutlet = outlets.find((o) => o.id === selectedOutletId);
  const isOpen = selectedOutlet ? outletOpen[selectedOutlet.id] !== false : true;
  const days = selectedOutlet ? (outletDays[selectedOutlet.id] ?? 2) : 2;
  const outletTotal = selectedOutlet
    ? calcTotalPerOutlet(selectedOutlet, materials, matrix)
    : 0;

  return (
    <div>
      {/* Outlet selector tabs */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {outlets.map((outlet) => {
          const open = outletOpen[outlet.id] !== false;
          const total = calcTotalPerOutlet(outlet, materials, matrix);
          const active = outlet.id === selectedOutletId;
          return (
            <button
              key={outlet.id}
              type="button"
              onClick={() => setSelectedOutletId(outlet.id)}
              className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                active
                  ? 'bg-brand-red text-white border-brand-red'
                  : open
                  ? 'bg-white text-gray-700 border-gray-200 hover:border-brand-red hover:text-brand-red'
                  : 'bg-gray-50 text-gray-400 border-gray-100'
              }`}
            >
              {outlet.name}
              {total > 0 && (
                <span className={`ml-1.5 text-xs ${active ? 'text-red-200' : 'text-gray-400'}`}>
                  {total}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selectedOutlet && (
        <div className="card">
          {/* Outlet header info */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="font-semibold text-gray-800">{selectedOutlet.name}</h3>
              <p className="text-xs text-gray-400">
                Total:{' '}
                <span className="font-semibold text-brand-red tabular-nums">{outletTotal}</span>
              </p>
            </div>
            {!isReadOnly && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onToggleOpen(selectedOutlet.id)}
                  className={`text-sm px-3 py-1 rounded-full border transition-colors ${
                    isOpen
                      ? 'bg-green-100 text-green-700 border-green-300 hover:bg-green-200'
                      : 'bg-red-100 text-red-700 border-red-300 hover:bg-red-200'
                  }`}
                >
                  {isOpen ? 'Buka' : 'Tutup'}
                </button>
                <button
                  type="button"
                  onClick={() => onToggleDays(selectedOutlet.id)}
                  className={`text-sm px-3 py-1 rounded-full border transition-colors ${
                    days === 1
                      ? 'bg-yellow-100 text-yellow-700 border-yellow-300 hover:bg-yellow-200'
                      : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                  }`}
                >
                  {days === 1 ? '1 Hari' : '2 Hari'}
                </button>
              </div>
            )}
          </div>

          {/* Material list */}
          <div className="divide-y divide-gray-50">
            {materials.map((mat) => {
              const key = getMatrixKey(selectedOutlet.id, mat.id);
              const val = matrix[key];
              const isRoti = isRotiTawar(mat);
              const stockInfo = isRoti ? rotiStockMap[selectedOutlet.id] : null;
              const stockLow = stockInfo && stockInfo.current_stock < stockInfo.min_stock;
              return (
                <div key={mat.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-gray-400 font-mono">{mat.code}</span>
                      {isRoti && (
                        <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">
                          Roti Tawar
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-medium text-gray-800 leading-tight">
                      {mat.name}
                    </div>
                    <div className="text-xs text-brand-orange">{mat.purchase_unit}</div>
                    {stockInfo && (
                      <div
                        className={`text-xs mt-0.5 ${
                          stockLow ? 'text-red-500 font-semibold' : 'text-gray-400'
                        }`}
                      >
                        Stok: {stockInfo.current_stock} / min {stockInfo.min_stock}
                      </div>
                    )}
                  </div>
                  <input
                    type="number"
                    min="0"
                    value={val === '' ? '' : val ?? ''}
                    onChange={(e) => onCellChange(selectedOutlet.id, mat.id, e.target.value)}
                    disabled={isReadOnly}
                    className="w-24 text-center border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-red disabled:bg-gray-100 disabled:text-gray-400"
                    placeholder="0"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
