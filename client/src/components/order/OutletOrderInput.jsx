import { useState, useRef } from 'react';
import { ChevronLeft, ChevronRight, AlertTriangle, Check, Store } from 'lucide-react';
import { getMatrixKey, isRotiTawar, calcTotalPerOutlet } from '../../lib/orderHelpers';
import { DAY_NAMES } from '../../services/holidayService';
import { getMaterialIcon, getMaterialHue } from '../../lib/materialIcons';
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
  // Controlled state dari parent (opsional — jika tidak diberikan, pakai local state)
  selectedOutletIdx,
  onSelectOutletIdx,
}) {
  const [localIdx, setLocalIdx] = useState(0);
  // Gunakan controlled state jika disediakan parent, otherwise local
  const selectedIdx = selectedOutletIdx !== undefined ? selectedOutletIdx : localIdx;
  const setSelectedIdx = (val) => {
    const idx = typeof val === 'function' ? val(selectedIdx) : val;
    if (onSelectOutletIdx) onSelectOutletIdx(idx);
    setLocalIdx(idx);
  };
  const clampedIdx = Math.min(selectedIdx, outlets.length - 1);
  const selectedOutlet = outlets[clampedIdx];
  const isOpen = selectedOutlet ? outletOpen[selectedOutlet.id] !== false : true;
  const days = selectedOutlet ? (outletDays[selectedOutlet.id] ?? 1) : 1;
  const outletTotal = selectedOutlet ? calcTotalPerOutlet(selectedOutlet, materials, matrix) : 0;
  const filledCount = outlets.filter((o) => calcTotalPerOutlet(o, materials, matrix) > 0).length;
  const allFilled = filledCount === outlets.length && outlets.length > 0;

  const goPrev = () => setSelectedIdx((i) => Math.max(0, i - 1));
  const goNext = () => setSelectedIdx((i) => Math.min(outlets.length - 1, i + 1));

  if (!selectedOutlet) return null;

  const info = holidayMap[selectedOutlet.id] || null;
  const isOverridden = outletOverride[selectedOutlet.id] || false;
  const hasHoliday = !!info;

  return (
    <div className="flex gap-4 items-start">

      {/* ═══════════════════════════════════════════
          PANEL KIRI — Outlet list + progress (desktop)
          ═══════════════════════════════════════════ */}
      <div className="hidden md:flex flex-col w-52 flex-shrink-0 gap-3 sticky top-4 self-start">

        {/* Progress card */}
        <div className="card p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-600">Progress Pengisian</span>
            <span className="text-xs font-bold tabular-nums text-gray-600">
              {filledCount}/{outlets.length}
            </span>
          </div>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                allFilled ? 'bg-green-500' : 'bg-brand-red'
              }`}
              style={{ width: `${outlets.length > 0 ? (filledCount / outlets.length) * 100 : 0}%` }}
            />
          </div>
          {allFilled && (
            <p className="text-xs text-green-600 font-medium mt-2 flex items-center gap-1">
              <Check className="w-3 h-3" /> Semua outlet terisi!
            </p>
          )}
        </div>

        {/* Outlet list */}
        <div className="card overflow-hidden">
          <div className="px-3 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
            <Store className="w-3.5 h-3.5 text-brand-red" />
            <span className="text-xs font-semibold text-gray-600">Pilih Outlet</span>
          </div>
          {outlets.map((outlet, idx) => {
            const total = calcTotalPerOutlet(outlet, materials, matrix);
            const isFilled = total > 0;
            const active = idx === clampedIdx;
            const open = outletOpen[outlet.id] !== false;
            const hasHol = !!holidayMap[outlet.id] && !outletOverride[outlet.id];

            return (
              <button
                key={outlet.id}
                type="button"
                onClick={() => setSelectedIdx(idx)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 border-b border-gray-50 last:border-0 text-left transition-colors ${
                  active ? 'bg-red-50' : 'hover:bg-gray-50'
                }`}
              >
                {/* Status dot */}
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                    isFilled ? 'bg-green-100' : active ? 'bg-red-100' : 'bg-gray-100'
                  }`}
                >
                  {isFilled ? (
                    <Check className="w-3 h-3 text-green-600" />
                  ) : (
                    <div
                      className={`w-2 h-2 rounded-full ${active ? 'bg-brand-red' : 'bg-gray-300'}`}
                    />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div
                    className={`text-sm font-medium truncate leading-tight ${
                      active ? 'text-brand-red' : open ? 'text-gray-700' : 'text-gray-400'
                    }`}
                  >
                    {outlet.name}
                  </div>
                  {hasHol && (
                    <div className="text-xs text-amber-500 flex items-center gap-0.5 mt-0.5">
                      <AlertTriangle className="w-2.5 h-2.5 flex-shrink-0" />
                      <span>Ada libur</span>
                    </div>
                  )}
                  {!open && !hasHol && (
                    <div className="text-xs text-red-400 mt-0.5">Tutup</div>
                  )}
                </div>

                {total > 0 && (
                  <span
                    className={`text-xs font-bold tabular-nums flex-shrink-0 ${
                      active ? 'text-brand-red' : 'text-gray-400'
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

      {/* ═══════════════════════════════════════════
          AREA UTAMA — Input material
          ═══════════════════════════════════════════ */}
      <div className="flex-1 min-w-0">

        {/* Mobile: tab outlet + prev/next + progress */}
        <div className="md:hidden mb-3 space-y-2">
          <div className="flex items-center gap-2">
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
                        className={`text-xs font-bold rounded-full px-1.5 ${
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
          {/* Progress bar mobile */}
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-xs text-gray-500">{filledCount} dari {outlets.length} outlet terisi</span>
              <span className="text-xs text-gray-500 tabular-nums">
                {outlets.length > 0 ? Math.round((filledCount / outlets.length) * 100) : 0}%
              </span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-red rounded-full transition-all duration-300"
                style={{ width: `${outlets.length > 0 ? (filledCount / outlets.length) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>

        {/* ─── Sticky Header — HARUS di luar overflow-hidden agar sticky bekerja ─── */}
        <div className="sticky top-0 z-20 bg-white border border-gray-100 border-b-0 rounded-t-lg shadow-sm px-4 py-3.5 flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3
                className={`font-bold text-lg leading-tight ${
                  isOpen ? 'text-gray-800' : 'text-gray-500'
                }`}
              >
                {selectedOutlet.name}
              </h3>
              {!isOpen && (
                <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">
                  Tutup
                </span>
              )}
              {outletTotal > 0 && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold tabular-nums">
                  ✓ {outletTotal} item
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              <span className="tabular-nums">{clampedIdx + 1}</span> dari{' '}
              <span className="tabular-nums">{outlets.length}</span> outlet
            </p>
          </div>
          {!isReadOnly && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => onToggleOpen(selectedOutlet.id)}
                className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                  isOpen
                    ? 'bg-green-100 text-green-700 border-green-300 hover:bg-green-200'
                    : 'bg-red-100 text-red-600 border-red-300 hover:bg-red-200'
                }`}
              >
                {isOpen ? 'Buka' : 'Tutup'}
              </button>
              <button
                type="button"
                onClick={() => onToggleDays(selectedOutlet.id)}
                className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                  days === 0
                    ? 'bg-red-100 text-red-600 border-red-300 hover:bg-red-200'
                    : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                }`}
              >
                {days === 0 ? '0 Hari' : '1 Hari'}
              </button>
            </div>
          )}
        </div>

        {/* ─── Card Body — overflow-hidden di sini TIDAK memblokir sticky di atas ─── */}
        <div className="overflow-hidden rounded-b-lg border border-gray-100 bg-white shadow-sm">

          {/* Holiday warning */}
          {hasHoliday && !isOverridden && (
            <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-amber-800">
                    Besok (H+1) tercatat libur
                  </p>
                  <div className="mt-0.5 space-y-0.5">
                    {info.date1_holiday && (
                      <p className="text-xs text-amber-700">H+1: {holidayLabel(info.date1_holiday)}</p>
                    )}
                  </div>
                  <p className="text-xs text-amber-600 mt-1">
                    Perhitungan otomatis: 0 hari (tidak perlu order).
                  </p>
                </div>
              </div>
              {!isReadOnly && onRequestOverride && (
                <button
                  type="button"
                  onClick={() => onRequestOverride(selectedOutlet.id)}
                  className="mt-2 w-full text-xs px-2 py-1.5 rounded border border-amber-300 bg-white text-amber-700 hover:bg-amber-100 transition-colors font-medium"
                >
                  Override: cabang tetap buka, hitung 1 hari
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
                <span className="text-xs text-blue-600">Dihitung 1 hari</span>
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

          {/* ─── Grid Material — 2 kolom di sm+ ─── */}
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {materials.map((mat) => {
              const key = getMatrixKey(selectedOutlet.id, mat.id);
              const val = matrix[key];
              const isFilled = Number(val) > 0;
              const isRoti = isRotiTawar(mat);
              const stockInfo = isRoti ? rotiStockMap[selectedOutlet.id] : null;
              const stockLow = stockInfo && stockInfo.current_stock < stockInfo.min_stock;
              const icon = getMaterialIcon(mat.name);
              const hue = getMaterialHue(mat.name);

              return (
                <div
                  key={mat.id}
                  className={`rounded-xl border p-3.5 transition-all duration-200 hover:scale-[1.015] hover:shadow-md active:scale-100 cursor-default ${
                    isFilled
                      ? 'border-green-200 bg-green-50 shadow-sm'
                      : `${hue.border} ${hue.bg} hover:shadow-sm`
                  }`}
                >
                  {/* Baris atas: icon + badge isi */}
                  <div className="flex items-start justify-between mb-2">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${
                      isFilled ? 'bg-green-100' : hue.icon
                    }`}>
                      {icon}
                    </div>
                    {isFilled ? (
                      <span className="text-xs font-bold bg-green-500 text-white px-2 py-0.5 rounded-full tabular-nums shadow-sm">
                        ✓ {Number(val)}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300 font-mono">{mat.code}</span>
                    )}
                  </div>

                  {/* Info bahan */}
                  <div className="mb-2.5">
                    <div className="text-sm font-bold text-gray-800 leading-tight">{mat.name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className="text-xs text-brand-orange font-medium">{mat.purchase_unit}</span>
                      {isRoti && (
                        <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full">
                          Roti Tawar
                        </span>
                      )}
                    </div>
                    {stockInfo && (
                      <div className={`text-xs mt-1 flex items-center gap-1 ${stockLow ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                        {stockLow ? '⚠' : '📊'} Stok: {stockInfo.current_stock}/{stockInfo.min_stock}
                      </div>
                    )}
                  </div>

                  <StepperInput
                    value={val}
                    onChange={(v) => onCellChange(selectedOutlet.id, mat.id, v)}
                    disabled={isReadOnly}
                    fullWidth
                  />
                </div>
              );
            })}
          </div>

          {/* ─── Footer navigasi ─── */}
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

            {/* Dot indicators — klik untuk navigasi */}
            <div className="flex items-center gap-1.5">
              {outlets.map((o, idx) => {
                const filled = calcTotalPerOutlet(o, materials, matrix) > 0;
                const active = idx === clampedIdx;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setSelectedIdx(idx)}
                    title={o.name}
                    className={`rounded-full transition-all duration-200 ${
                      active
                        ? 'w-5 h-2.5 bg-brand-red'
                        : filled
                        ? 'w-2.5 h-2.5 bg-green-400 hover:bg-green-500'
                        : 'w-2.5 h-2.5 bg-gray-200 hover:bg-gray-300'
                    }`}
                  />
                );
              })}
            </div>

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
    </div>
  );
}
