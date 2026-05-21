import { Loader2, AlertCircle, X, Zap, Package } from 'lucide-react';
import { formatDateID, getLocalOperationalYesterday, getLocalOperationalDate } from '../../lib/api';

function formatQty(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  if (Number.isInteger(number)) return String(number);
  return number.toLocaleString('id-ID', { maximumFractionDigits: 2 });
}

function formatDelta(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  if (number === 0) return 'Pas';
  return `${number > 0 ? '+' : ''}${formatQty(number)}`;
}

function deltaClass(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'text-gray-500 bg-gray-50 border-gray-100';
  if (number < 0) return 'text-red-700 bg-red-50 border-red-100';
  if (number > 0) return 'text-blue-700 bg-blue-50 border-blue-100';
  return 'text-green-700 bg-green-50 border-green-100';
}

function SummaryCard({ label, value, emphasis = false, tone = 'gray' }) {
  const toneClass = {
    gray: 'bg-gray-50 border-gray-100',
    red: 'bg-red-50 border-red-100',
    orange: 'bg-orange-50 border-orange-100',
    green: 'bg-green-50 border-green-100',
  }[tone];

  return (
    <div className={`rounded-lg border p-2 min-h-[58px] ${toneClass}`}>
      <div className="text-[11px] leading-tight text-gray-500">{label}</div>
      <div
        className={`mt-1 text-sm leading-tight tabular-nums ${
          emphasis ? 'font-bold text-gray-900' : 'font-semibold text-gray-800'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

export default function RotiTawarPanel({
  rotiLoading,
  rotiError,
  rotiDetail,
  rotiLiveSummary,
  onRotiAutoFill,
  onRotiDist,
  onDismissDetail,
  rotiReferenceDate,
  onRefDateChange,
  isReadOnly,
}) {
  const live = rotiLiveSummary || {};
  const hasLiveSummary = live.hasRotiMaterial;
  const hasRecommendation = !!rotiDetail;
  const branchRows = Array.isArray(live.branches) ? live.branches : [];

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
          {onRotiDist && (
            <button
              type="button"
              onClick={onRotiDist}
              className="w-full mt-2 inline-flex items-center justify-center gap-2 border border-brand-orange text-brand-orange bg-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-orange-50 transition-colors"
            >
              <Package className="w-4 h-4" />
              Distribusi Roti Tambahan
            </button>
          )}
        </>
      )}

      {rotiError && (
        <div className="mt-3 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700">{rotiError}</p>
        </div>
      )}

      {hasLiveSummary && (
        <div className="mt-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-xs font-semibold text-gray-600">
              {hasRecommendation ? 'Rekomendasi & Input' : 'Order Roti Saat Ini'}
            </p>
            {hasRecommendation && (
              <button
                type="button"
                onClick={onDismissDetail}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Tutup hasil kalkulasi roti tawar"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {hasRecommendation && (
              <SummaryCard
                label="Kebutuhan Rekomendasi"
                value={formatQty(live.recommendationTotal)}
              />
            )}
            <SummaryCard
              label="Input Saat Ini"
              value={formatQty(live.currentTotal)}
              emphasis
              tone="red"
            />
            <SummaryCard
              label="Order Supplier Saat Ini"
              value={formatQty(live.supplierOrder)}
              emphasis
              tone="orange"
            />
            <SummaryCard label="Bonus Supplier" value={`+${formatQty(live.bonus)}`} />
            <SummaryCard
              label="Terpenuhi Saat Ini"
              value={formatQty(live.fulfilled)}
              tone="green"
            />
            {hasRecommendation && (
              <SummaryCard
                label="Selisih Input"
                value={
                  <span
                    className={`inline-flex items-center rounded border px-1.5 py-0.5 ${deltaClass(
                      live.deltaTotal
                    )}`}
                  >
                    {formatDelta(live.deltaTotal)}
                  </span>
                }
              />
            )}
          </div>

          {!hasRecommendation && (
            <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">
              Rekomendasi stok belum dihitung.
            </div>
          )}
        </div>
      )}

      {rotiDetail && (
        <div className="mt-3">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[390px] text-[11px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-1 pr-2 font-medium text-gray-400">Cabang</th>
                  <th className="text-right py-1 pr-2 font-medium text-gray-400">Stok</th>
                  <th className="text-right py-1 pr-2 font-medium text-gray-400">Min</th>
                  <th className="text-right py-1 pr-2 font-medium text-gray-400">Butuh</th>
                  <th className="text-right py-1 pr-2 font-medium text-gray-400">Input</th>
                  <th className="text-right py-1 font-medium text-gray-400">Selisih</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {branchRows.map((branch) => (
                  <tr key={branch.inv_cabang_id}>
                    <td className="py-1.5 pr-2 text-gray-700 leading-tight max-w-[125px] whitespace-normal">
                      {branch.display_name}
                      {branch.mapping_found === false && (
                        <div className="text-[10px] text-yellow-600">Outlet tidak cocok</div>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 text-right text-gray-500 tabular-nums">
                      {formatQty(branch.current_stock)}
                    </td>
                    <td className="py-1.5 pr-2 text-right text-gray-500 tabular-nums">
                      {formatQty(branch.min_stock)}
                    </td>
                    <td
                      className={`py-1.5 pr-2 text-right font-semibold tabular-nums ${
                        branch.recommended_need > 0 ? 'text-brand-red' : 'text-gray-300'
                      }`}
                    >
                      {formatQty(branch.recommended_need)}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-semibold text-gray-800 tabular-nums">
                      {formatQty(branch.input_qty)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      <span
                        className={`inline-flex justify-end min-w-[42px] rounded border px-1.5 py-0.5 font-semibold ${deltaClass(
                          branch.delta
                        )}`}
                      >
                        {formatDelta(branch.delta)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rotiDetail.warnings && rotiDetail.warnings.length > 0 && (
            <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">
              <p className="font-medium mb-0.5">Peringatan:</p>
              {rotiDetail.warnings.map((warning, index) => (
                <p key={index}>{warning}</p>
              ))}
            </div>
          )}

          <p className="text-xs text-gray-400 mt-2">
            Order: {formatDateID(rotiDetail.order_date || rotiDetail.tanggal)} | Stok referensi:{' '}
            {formatDateID(rotiDetail.reference_date || rotiDetail.tanggal)}
          </p>
        </div>
      )}
    </div>
  );
}
