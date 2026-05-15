import { Store } from 'lucide-react';
import { calcTotalPerOutlet } from '../../lib/orderHelpers';

export default function OutletControlsPanel({
  outlets,
  outletOpen,
  outletDays,
  onToggleOpen,
  onToggleDays,
  materials,
  matrix,
  isReadOnly,
}) {
  return (
    <div className="card p-4">
      <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <Store className="w-4 h-4 text-brand-red" />
        Pengaturan Outlet
      </h2>
      <div className="space-y-1.5">
        {outlets.map((outlet) => {
          const isOpen = outletOpen[outlet.id] !== false;
          const days = outletDays[outlet.id] ?? 2;
          const total = calcTotalPerOutlet(outlet, materials, matrix);
          return (
            <div
              key={outlet.id}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 border transition-colors ${
                isOpen ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50'
              }`}
            >
              <span
                className={`flex-1 text-sm font-medium truncate ${
                  isOpen ? 'text-gray-800' : 'text-gray-400'
                }`}
              >
                {outlet.name}
              </span>
              <span className="text-xs text-gray-400 tabular-nums w-6 text-right flex-shrink-0">
                {total > 0 ? total : '—'}
              </span>
              {!isReadOnly && (
                <>
                  <button
                    type="button"
                    onClick={() => onToggleOpen(outlet.id)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors whitespace-nowrap flex-shrink-0 ${
                      isOpen
                        ? 'bg-green-100 text-green-700 border-green-300 hover:bg-green-200'
                        : 'bg-red-100 text-red-700 border-red-300 hover:bg-red-200'
                    }`}
                  >
                    {isOpen ? 'Buka' : 'Tutup'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleDays(outlet.id)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors whitespace-nowrap flex-shrink-0 ${
                      days === 1
                        ? 'bg-yellow-100 text-yellow-700 border-yellow-300 hover:bg-yellow-200'
                        : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    {days === 1 ? '1 Hari' : '2 Hari'}
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
