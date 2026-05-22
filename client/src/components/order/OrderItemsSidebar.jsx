import { ShoppingCart } from 'lucide-react';
import { getMatrixKey } from '../../lib/orderHelpers';

export default function OrderItemsSidebar({ outlet, materials, matrix }) {
  const items = (materials || [])
    .map((mat) => ({
      mat,
      qty: Number(matrix?.[getMatrixKey(outlet?.id, mat.id)]) || 0,
    }))
    .filter(({ qty }) => qty > 0);

  return (
    <div className="card p-4">
      <h2 className="text-sm font-semibold text-gray-700 mb-1 flex items-center gap-2">
        <ShoppingCart className="w-4 h-4 text-brand-red" />
        Bahan yang Akan Diorder
      </h2>

      {outlet ? (
        <p className="text-xs font-semibold text-brand-red mb-3 truncate">{outlet.name}</p>
      ) : (
        <p className="text-xs text-gray-400 mb-3">Pilih cabang untuk melihat ringkasan</p>
      )}

      {!outlet ? (
        <p className="text-sm text-gray-400 italic">
          Pilih cabang untuk melihat ringkasan order.
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400 italic">
          Belum ada order untuk cabang ini.
        </p>
      ) : (
        <>
          <ul className="space-y-1.5">
            {items.map(({ mat, qty }) => (
              <li
                key={mat.id}
                className="flex items-center justify-between gap-2 text-sm py-1.5 border-b border-gray-50 last:border-0"
              >
                <span className="text-gray-700 leading-tight truncate">{mat.name}</span>
                <span className="font-semibold text-gray-900 tabular-nums whitespace-nowrap flex-shrink-0">
                  {qty}{' '}
                  <span className="text-xs text-brand-orange font-medium">
                    {mat.purchase_unit}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-gray-400 mt-3">
            {items.length} jenis bahan &middot; total{' '}
            {items.reduce((s, { qty }) => s + qty, 0)} item
          </p>
        </>
      )}
    </div>
  );
}
