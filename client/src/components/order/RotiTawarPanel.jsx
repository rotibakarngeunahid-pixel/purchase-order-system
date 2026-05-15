import { Loader2, AlertCircle, X, Zap, Package } from 'lucide-react';
import { formatDateID, getLocalOperationalYesterday, getLocalOperationalDate } from '../../lib/api';

export default function RotiTawarPanel({
  rotiLoading,
  rotiError,
  rotiDetail,
  onRotiAutoFill,
  onDismissDetail,
  rotiReferenceDate,
  onRefDateChange,
  isReadOnly,
}) {
  return (
    <div className="card p-4">
      <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <Package className="w-4 h-4 text-brand-red" />
        Roti Tawar
      </h2>

      {!isReadOnly && (
        <>
          <div className="mb-3">
            <p className="text-xs text-gray-500 mb-1.5">Referensi data stok tanggal:</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => onRefDateChange(getLocalOperationalYesterday())}
                className={`text-xs px-2 py-1 rounded border transition-colors ${
                  rotiReferenceDate === getLocalOperationalYesterday()
                    ? 'bg-brand-red text-white border-brand-red'
                    : 'border-gray-300 text-gray-500 hover:border-brand-red hover:text-brand-red'
                }`}
              >
                Kemarin
              </button>
              <button
                type="button"
                onClick={() => onRefDateChange(getLocalOperationalDate())}
                className={`text-xs px-2 py-1 rounded border transition-colors ${
                  rotiReferenceDate === getLocalOperationalDate()
                    ? 'bg-brand-red text-white border-brand-red'
                    : 'border-gray-300 text-gray-500 hover:border-brand-red hover:text-brand-red'
                }`}
              >
                Hari Ini
              </button>
              <input
                type="date"
                value={rotiReferenceDate}
                onChange={(e) => onRefDateChange(e.target.value)}
                className="text-xs border border-gray-200 rounded px-1.5 py-1 text-gray-600 focus:outline-none focus:ring-1 focus:ring-brand-red"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={onRotiAutoFill}
            disabled={rotiLoading}
            className="w-full btn-outline text-sm gap-2"
          >
            {rotiLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Menghitung...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 text-brand-orange" />
                Hitung Otomatis Roti Tawar
              </>
            )}
          </button>
        </>
      )}

      {rotiError && (
        <div className="mt-3 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700">{rotiError}</p>
        </div>
      )}

      {rotiDetail && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-600">Hasil Kalkulasi</p>
            <button
              type="button"
              onClick={onDismissDetail}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3">
            {[
              { label: 'Total Kebutuhan', value: rotiDetail.total_needed },
              { label: 'Order Supplier', value: rotiDetail.optimal_order },
              { label: 'Bonus Supplier', value: rotiDetail.bonus },
              { label: 'Terpenuhi', value: rotiDetail.fulfilled },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-50 rounded-lg p-2 text-center">
                <div className="text-xs text-gray-400">{label}</div>
                <div className="font-bold text-gray-800 text-sm tabular-nums">{value}</div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-1 pr-2 font-medium text-gray-400">Cabang</th>
                  <th className="text-right py-1 pr-2 font-medium text-gray-400">Stok</th>
                  <th className="text-right py-1 pr-2 font-medium text-gray-400">Min</th>
                  <th className="text-right py-1 font-medium text-gray-400">Butuh</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rotiDetail.branches.map((b) => (
                  <tr key={b.inv_cabang_id}>
                    <td className="py-1.5 pr-2 text-gray-700">{b.display_name}</td>
                    <td className="py-1.5 pr-2 text-right text-gray-500 tabular-nums">
                      {b.current_stock}
                    </td>
                    <td className="py-1.5 pr-2 text-right text-gray-500 tabular-nums">
                      {b.min_stock}
                    </td>
                    <td
                      className={`py-1.5 text-right font-semibold tabular-nums ${
                        b.need > 0 ? 'text-brand-red' : 'text-gray-300'
                      }`}
                    >
                      {b.need}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rotiDetail.warnings && rotiDetail.warnings.length > 0 && (
            <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">
              <p className="font-medium mb-0.5">Peringatan:</p>
              {rotiDetail.warnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </div>
          )}

          <p className="text-xs text-gray-400 mt-2">
            Order: {formatDateID(rotiDetail.order_date || rotiDetail.tanggal)} •{' '}
            Stok referensi: {formatDateID(rotiDetail.reference_date || rotiDetail.tanggal)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            Nilai sudah diisi otomatis, Anda bisa mengubah secara manual.
          </p>
        </div>
      )}
    </div>
  );
}
