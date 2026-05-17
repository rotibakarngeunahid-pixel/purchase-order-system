import { AlertTriangle, Store } from 'lucide-react';
import { calcTotalPerOutlet } from '../../lib/orderHelpers';
import { DAY_NAMES } from '../../services/holidayService';

function fmtDateShort(dateStr) {
  if (!dateStr) return '';
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short',
  });
}

// Deskripsi satu holiday record (bisa one-time atau weekly)
function holidayLabel(h) {
  if (!h) return null;
  const datePart = h.recurrence_type === 'weekly'
    ? `Setiap ${DAY_NAMES[h.day_of_week]}`
    : fmtDateShort(h.holiday_date);
  return h.holiday_name ? `${datePart} — ${h.holiday_name}` : datePart;
}

export default function OutletControlsPanel({
  outlets,
  outletOpen,
  outletDays,
  onToggleOpen,
  onToggleDays,
  materials,
  matrix,
  isReadOnly,
  // Holiday props (opsional — backward compatible)
  holidayMap = {},
  outletOverride = {},
  onRequestOverride,
  onCancelOverride,
}) {
  return (
    <div className="card p-4">
      <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <Store className="w-4 h-4 text-brand-red" />
        Pengaturan Outlet
      </h2>
      <div className="space-y-2">
        {outlets.map((outlet) => {
          const isOpen = outletOpen[outlet.id] !== false;
          const days = outletDays[outlet.id] ?? 2;
          const total = calcTotalPerOutlet(outlet, materials, matrix);
          const info = holidayMap[outlet.id] || null; // { date1_holiday, date2_holiday, calculation_days }
          const isOverridden = outletOverride[outlet.id] || false;
          const hasHoliday = !!info;

          return (
            <div key={outlet.id} className="rounded-lg border border-gray-200 overflow-hidden">
              {/* Baris utama outlet */}
              <div className={`flex items-center gap-2 px-3 py-2 transition-colors ${isOpen ? 'bg-white' : 'bg-gray-50'}`}>
                <span className={`flex-1 text-sm font-medium truncate ${isOpen ? 'text-gray-800' : 'text-gray-400'}`}>
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
                        days === 0
                          ? 'bg-red-100 text-red-700 border-red-300 hover:bg-red-200'
                          : days === 1
                          ? 'bg-yellow-100 text-yellow-700 border-yellow-300 hover:bg-yellow-200'
                          : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                      }`}
                    >
                      {days === 0 ? '0 Hari' : days === 1 ? '1 Hari' : '2 Hari'}
                    </button>
                  </>
                )}
              </div>

              {/* Warning holiday (belum dioverride) */}
              {hasHoliday && !isOverridden && (
                <div className="bg-amber-50 border-t border-amber-200 px-3 py-2">
                  <div className="flex items-start gap-1.5 mb-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-amber-800">
                        {info.calculation_days === 0
                          ? 'Kedua hari ke depan tercatat libur'
                          : 'Ada hari libur dalam 2 hari ke depan'}
                      </p>
                      {/* Detail hari libur yang terdeteksi */}
                      <div className="mt-0.5 space-y-0.5">
                        {info.date1_holiday && (
                          <p className="text-xs text-amber-700">
                            H+1: {holidayLabel(info.date1_holiday)}
                          </p>
                        )}
                        {info.date2_holiday && (
                          <p className="text-xs text-amber-700">
                            H+2: {holidayLabel(info.date2_holiday)}
                          </p>
                        )}
                      </div>
                      <p className="text-xs text-amber-600 mt-1">
                        {info.calculation_days === 0
                          ? 'Perhitungan otomatis: 0 hari (tidak perlu order).'
                          : 'Perhitungan otomatis menggunakan 1 hari.'}
                      </p>
                    </div>
                  </div>
                  {!isReadOnly && onRequestOverride && (
                    <button
                      type="button"
                      onClick={() => onRequestOverride(outlet.id)}
                      className="w-full text-xs px-2 py-1 rounded border border-amber-300 bg-white text-amber-700 hover:bg-amber-100 transition-colors font-medium"
                    >
                      Override: cabang tetap buka, hitung 2 hari
                    </button>
                  )}
                </div>
              )}

              {/* Badge override aktif */}
              {hasHoliday && isOverridden && (
                <div className="bg-blue-50 border-t border-blue-200 px-3 py-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 whitespace-nowrap flex-shrink-0">
                      Override aktif
                    </span>
                    <span className="text-xs text-blue-600 truncate">Dihitung 2 hari</span>
                  </div>
                  {!isReadOnly && onCancelOverride && (
                    <button
                      type="button"
                      onClick={() => onCancelOverride(outlet.id)}
                      className="text-xs text-blue-500 hover:text-blue-700 underline whitespace-nowrap flex-shrink-0"
                    >
                      Batalkan
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
