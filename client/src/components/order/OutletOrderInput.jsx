import { useState } from 'react';
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { getMatrixKey, isRotiTawar, calcTotalPerOutlet } from '../../lib/orderHelpers';
import { DAY_NAMES } from '../../services/holidayService';
import StepperInput from './StepperInput';

function fmtDateShort(dateStr) {
  if (!dateStr) return '';
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short',
  });
}

function holidayLabel(h) {
  if (!h) return null;
  const datePart =
    h.recurrence_type === 'weekly'
      ? `Setiap ${DAY_NAMES[h.day_of_week]}`
      : fmtDateShort(h.holiday_date);
  return h.holiday_name ? `${datePart} — ${h.holiday_name}` : datePart;
}

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
  holidayMap = {},
  outletOverride = {},
  onRequestOverride,
  onCancelOverride,
}) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const clampedIdx = Math.min(selectedIdx, outlets.length - 1);
  const selectedOutlet = outlets[clampedIdx];
  const isOpen = selectedOutlet ? outletOpen[selectedOutlet.id] !== false : true;
  const days = selectedOutlet ? (outletDays[selectedOutlet.id] ?? 2) : 2;
  const outletTotal = selectedOutlet ? calcTotalPerOutlet(selectedOutlet, materials, matrix) : 0;
  const filledCount = outlets.filter((o) => calcTotalPerOutlet(o, materials, matrix) > 0).length;

  const goPrev = () => setSelectedIdx((i) => Math.max(0, i - 1));
  const goNext = () => setSelectedIdx((i) => Math.min(outlets.length - 1, i + 1));

  if (!selectedOutlet) return null;

  const info = holidayMap[selectedOutlet.id] || null;
  const isOverridden = outletOverride[selectedOutlet.id] || false;
  const hasHoliday = !!info;

  return (
    <div>
      {/* Outlet navigator */}
      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={goPrev}
          disabled={clampedIdx === 0}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:border-brand-red hover:text-brand-red disabled:opacity-30 disabled:cursor-default transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex-1 overflow-x-auto flex gap-1.5 pb-0.5">
          {outlets.map((outlet, idx) => {
            const open = outletOpen[outlet.id] !== false;
            const total = calcTotalPerOutlet(outlet, materials, matrix);
            const active = idx === clampedIdx;
            const hol = !!holidayMap[outlet.id] && !outletOverride[outlet.id];
            return (
              <button
                key={outlet.id}
                type="button"
                onClick={() => setSelectedIdx(idx)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                  active
                    ? 'bg-brand-red text-white border-brand-red shadow-sm'
                    : open
                    ? 'bg-white text-gray-700 border-gray-200 hover:border-brand-red hover:text-brand-red'
                    : 'bg-gray-50 text-gray-400 border-gray-100'
                }`}
              >
                {hol && (
                  <span
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      active ? 'bg-yellow-300' : 'bg-amber-400'
                    }`}
                  />
                )}
                <span className="whitespace-nowrap">{outlet.name}</span>
                {total > 0 && (
                  <span
                    className={`text-xs font-semibold rounded-full px-1.5 min-w-[20px] text-center ${
                      active ? 'bg-red-700 text-white' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {total}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={goNext}
          disabled={clampedIdx === outlets.length - 1}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:border-brand-red hover:text-brand-red disabled:opacity-30 disabled:cursor-default transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500">
            {filledCount} dari {outlets.length} outlet terisi
          </span>
          <span className="text-xs text-gray-500 tabular-nums">
            {outlets.length > 0 ? Math.round((filledCount / outlets.length) * 100) : 0}%
          </span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-red rounded-full transition-all duration-300"
            style={{
              width: `${outlets.length > 0 ? (filledCount / outlets.length) * 100 : 0}%`,
            }}
          />
        </div>
      </div>

      {/* Outlet card */}
      <div className="card overflow-hidden">
        {/* Card header */}
        <div className={`px-4 py-3 border-b border-gray-100 ${isOpen ? 'bg-white' : 'bg-gray-50'}`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className={`font-semibold ${isOpen ? 'text-gray-800' : 'text-gray-500'}`}>
                {selectedOutlet.name}
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Total:{' '}
                <span className="font-semibold text-brand-red tabular-nums">{outletTotal || 0}</span>
                {!isOpen && <span className="ml-2 text-red-400">· Tutup</span>}
              </p>
            </div>
            {!isReadOnly && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => onToggleOpen(selectedOutlet.id)}
                  className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${
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
                  className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${
                    days === 0
                      ? 'bg-red-100 text-red-700 border-red-300 hover:bg-red-200'
                      : days === 1
                      ? 'bg-yellow-100 text-yellow-700 border-yellow-300 hover:bg-yellow-200'
                      : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                  }`}
                >
                  {days === 0 ? '0 Hari' : days === 1 ? '1 Hari' : '2 Hari'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Holiday warning */}
        {hasHoliday && !isOverridden && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-amber-800">
                  {info.calculation_days === 0
                    ? 'Kedua hari ke depan tercatat libur'
                    : 'Ada hari libur dalam 2 hari ke depan'}
                </p>
                <div className="mt-0.5 space-y-0.5">
                  {info.date1_holiday && (
                    <p className="text-xs text-amber-700">H+1: {holidayLabel(info.date1_holiday)}</p>
                  )}
                  {info.date2_holiday && (
                    <p className="text-xs text-amber-700">H+2: {holidayLabel(info.date2_holiday)}</p>
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
                onClick={() => onRequestOverride(selectedOutlet.id)}
                className="mt-2 w-full text-xs px-2 py-1 rounded border border-amber-300 bg-white text-amber-700 hover:bg-amber-100 transition-colors font-medium"
              >
                Override: cabang tetap buka, hitung 2 hari
              </button>
            )}
          </div>
        )}

        {/* Holiday override active */}
        {hasHoliday && isOverridden && (
          <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                Override aktif
              </span>
              <span className="text-xs text-blue-600">Dihitung 2 hari</span>
            </div>
            {!isReadOnly && onCancelOverride && (
              <button
                type="button"
                onClick={() => onCancelOverride(selectedOutlet.id)}
                className="text-xs text-blue-500 hover:text-blue-700 underline"
              >
                Batalkan
              </button>
            )}
          </div>
        )}

        {/* Material input rows */}
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
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-mono text-gray-400">{mat.code}</span>
                    {isRoti && (
                      <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">
                        Roti Tawar
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-medium text-gray-800 leading-tight">{mat.name}</div>
                  <div className="text-xs text-brand-orange">{mat.purchase_unit}</div>
                  {stockInfo && (
                    <div
                      className={`text-xs mt-0.5 ${
                        stockLow ? 'text-red-500 font-semibold' : 'text-gray-400'
                      }`}
                    >
                      Stok: {stockInfo.current_stock} / min {stockInfo.min_stock}
                      {stockLow && ' ⚠'}
                    </div>
                  )}
                </div>
                <StepperInput
                  value={val}
                  onChange={(v) => onCellChange(selectedOutlet.id, mat.id, v)}
                  disabled={isReadOnly}
                />
              </div>
            );
          })}
        </div>

        {/* Footer navigation */}
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={goPrev}
            disabled={clampedIdx === 0}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-brand-red disabled:opacity-30 disabled:cursor-default transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Sebelumnya
          </button>
          <span className="text-xs text-gray-400 tabular-nums">
            {clampedIdx + 1} / {outlets.length}
          </span>
          <button
            type="button"
            onClick={goNext}
            disabled={clampedIdx === outlets.length - 1}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-brand-red disabled:opacity-30 disabled:cursor-default transition-colors"
          >
            Berikutnya
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
