import { Store, Package, ShoppingCart, CheckSquare2 } from 'lucide-react';
import { calcGrandTotal, calcFilledOutlets } from '../../lib/orderHelpers';

export default function OrderSummaryBar({ outlets, materials, matrix, outletOpen }) {
  const activeOutlets = outlets.filter((o) => outletOpen[o.id] !== false);
  const grandTotal = calcGrandTotal(outlets, materials, matrix);
  const filledOutlets = calcFilledOutlets(outlets, materials, matrix);

  const stats = [
    { icon: Store, label: 'Outlet Buka', value: activeOutlets.length },
    { icon: Package, label: 'Jenis Bahan', value: materials.length },
    { icon: ShoppingCart, label: 'Total Qty', value: grandTotal },
    { icon: CheckSquare2, label: 'Outlet Terisi', value: `${filledOutlets} / ${outlets.length}` },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
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
  );
}
