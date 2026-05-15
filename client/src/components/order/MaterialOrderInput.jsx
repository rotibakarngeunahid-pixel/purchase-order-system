import { useState } from 'react';
import { Zap, Loader2 } from 'lucide-react';
import { getMatrixKey, isRotiTawar } from '../../lib/orderHelpers';

export default function MaterialOrderInput({
  outlets,
  materials,
  matrix,
  onCellChange,
  outletOpen,
  isReadOnly,
  rotiLoading,
  onRotiAutoFill,
  rotiStockMap,
}) {
  const [selectedMaterialId, setSelectedMaterialId] = useState(materials[0]?.id ?? null);
  const selectedMaterial = materials.find((m) => m.id === selectedMaterialId);
  const isRoti = selectedMaterial ? isRotiTawar(selectedMaterial) : false;
  const matTotal = selectedMaterial
    ? outlets.reduce(
        (sum, outlet) =>
          sum + (Number(matrix[getMatrixKey(outlet.id, selectedMaterial.id)]) || 0),
        0
      )
    : 0;

  return (
    <div>
      {/* Material selector */}
      <div className="card mb-4 overflow-hidden">
        <div className="overflow-y-auto max-h-48 divide-y divide-gray-50">
          {materials.map((mat) => {
            const total = outlets.reduce(
              (sum, outlet) =>
                sum + (Number(matrix[getMatrixKey(outlet.id, mat.id)]) || 0),
              0
            );
            const active = mat.id === selectedMaterialId;
            const roti = isRotiTawar(mat);
            return (
              <button
                key={mat.id}
                type="button"
                onClick={() => setSelectedMaterialId(mat.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  active ? 'bg-red-50' : 'hover:bg-gray-50'
                }`}
              >
                <span className="text-xs font-mono text-gray-400 w-14 flex-shrink-0">{mat.code}</span>
                <span
                  className={`flex-1 text-sm font-medium truncate ${
                    active ? 'text-brand-red' : 'text-gray-700'
                  }`}
                >
                  {mat.name}
                </span>
                {roti && (
                  <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded flex-shrink-0">
                    Roti Tawar
                  </span>
                )}
                <span className="text-xs text-brand-orange flex-shrink-0">{mat.purchase_unit}</span>
                {total > 0 && (
                  <span
                    className={`text-xs tabular-nums flex-shrink-0 ${
                      active ? 'text-brand-red font-semibold' : 'text-gray-400'
                    }`}
                  >
                    {total}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selectedMaterial && (
        <div className="card">
          {/* Material header */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-400 font-mono">{selectedMaterial.code}</span>
                {isRoti && (
                  <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">
                    Roti Tawar
                  </span>
                )}
              </div>
              <h3 className="font-semibold text-gray-800">{selectedMaterial.name}</h3>
              <p className="text-xs text-brand-orange">{selectedMaterial.purchase_unit}</p>
            </div>
            <div className="flex items-center gap-2">
              {matTotal > 0 && (
                <span className="text-sm font-bold text-brand-red tabular-nums">
                  Total: {matTotal}
                </span>
              )}
              {isRoti && !isReadOnly && (
                <button
                  type="button"
                  onClick={onRotiAutoFill}
                  disabled={rotiLoading}
                  className="btn-outline text-xs gap-1 py-1.5"
                >
                  {rotiLoading ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Menghitung...
                    </>
                  ) : (
                    <>
                      <Zap className="w-3 h-3 text-brand-orange" />
                      Hitung Otomatis
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Outlet list */}
          <div className="divide-y divide-gray-50">
            {outlets.map((outlet) => {
              const key = getMatrixKey(outlet.id, selectedMaterial.id);
              const val = matrix[key];
              const open = outletOpen[outlet.id] !== false;
              const stockInfo = isRoti ? rotiStockMap[outlet.id] : null;
              const stockLow = stockInfo && stockInfo.current_stock < stockInfo.min_stock;
              return (
                <div key={outlet.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div
                      className={`text-sm font-medium ${
                        open ? 'text-gray-800' : 'text-gray-400'
                      }`}
                    >
                      {outlet.name}
                    </div>
                    {!open && (
                      <div className="text-xs text-red-400">Tutup</div>
                    )}
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
                    onChange={(e) => onCellChange(outlet.id, selectedMaterial.id, e.target.value)}
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
