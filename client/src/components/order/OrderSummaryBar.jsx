import { Store, Package, ShoppingCart, CheckSquare2 } from 'lucide-react';
import { calcGrandTotal, calcFilledOutlets, getMatrixKey } from '../../lib/orderHelpers';
import { formatRupiah } from '../../lib/api';

export default function OrderSummaryBar({ outlets, materials, matrix, outletOpen, orderEstimate }) {
  const activeOutlets = outlets.filter((o) => outletOpen[o.id] !== false);
  const grandTotal = calcGrandTotal(outlets, materials, matrix);
  const filledOutlets = calcFilledOutlets(outlets, materials, matrix);

  const stats = [
    { icon: Store, label: 'Outlet Buka', value: activeOutlets.length },
    { icon: Package, label: 'Jenis Bahan', value: materials.length },
    { icon: ShoppingCart, label: 'Total Qty', value: grandTotal },
    { icon: CheckSquare2, label: 'Outlet Terisi', value: `${filledOutlets} / ${outlets.length}` },
  ];

  const outletSummaries = outlets.map((outlet) => {
    const materialCount = materials.filter(
      (mat) => (Number(matrix[getMatrixKey(outlet.id, mat.id)]) || 0) > 0
    ).length;
    const totalQty = materials.reduce(
      (sum, mat) => sum + (Number(matrix[getMatrixKey(outlet.id, mat.id)]) || 0),
      0
    );
    return {
      outlet,
      materialCount,
      totalQty,
      isOpen: outletOpen[outlet.id] !== false,
    };
  });

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        {stats.map(({ icon: Icon, label, value }) => (
          <div key={label} className="card p-3 flex items-center gap-3">
            <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <Icon className="w-4 h-4 text-brand-red" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-gray-500 truncate">{label}</div>
              <div className="font-bold text-gray-800 tabular-nums">{value}</div>
            </div>
          </div>
        ))}
      </div>

      {orderEstimate && (
        <div className="card p-3 mb-3 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-xs text-gray-500">Estimasi Total Order</div>
            <div className="text-xl font-bold text-brand-red tabular-nums">
              {formatRupiah(orderEstimate.total)}
            </div>
          </div>
          {orderEstimate.hasMissingPrices && (
            <div className="text-xs text-orange-500 flex items-center gap-1">
              <span>⚠</span>
              <span>Beberapa bahan belum memiliki harga</span>
            </div>
          )}
        </div>
      )}

      <div className="card p-3 mb-4">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <Store className="w-4 h-4 text-brand-red flex-shrink-0" />
            <p className="text-sm font-semibold text-gray-700 truncate">Ringkasan per Cabang</p>
          </div>
          <span className="text-xs text-gray-400">{filledOutlets}/{outlets.length} terisi</span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {outletSummaries.map(({ outlet, materialCount, totalQty, isOpen }) => (
            <div
              key={outlet.id}
              className={`flex-shrink-0 min-w-[132px] rounded-lg border px-3 py-2 ${
                !isOpen
                  ? 'border-gray-200 bg-gray-50 opacity-70'
                  : totalQty > 0
                  ? 'border-green-200 bg-green-50'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <div className="text-xs font-medium text-gray-700 truncate">{outlet.name}</div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className={`text-lg font-bold tabular-nums ${totalQty > 0 ? 'text-brand-red' : 'text-gray-300'}`}>
                  {totalQty}
                </span>
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  {materialCount} bahan
                </span>
              </div>
              {!isOpen && <div className="mt-1 text-xs text-red-400">Tutup</div>}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
