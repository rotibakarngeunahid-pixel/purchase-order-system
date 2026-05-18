import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { toInputDate, formatDateID } from '../lib/api';

const baseURL = import.meta.env.VITE_API_URL ?? '';
const publicApi = axios.create({ baseURL, timeout: 30000 });

const STORAGE_KEY = (date, outletId) => `dist_check_${date}_${outletId}`;

function loadChecks(date, outletId) {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY(date, outletId)) || '{}'); }
  catch { return {}; }
}
function saveChecks(date, outletId, checks) {
  localStorage.setItem(STORAGE_KEY(date, outletId), JSON.stringify(checks));
}

function mergeOutletTabs(masterOutlets, distributionOutlets) {
  const map = new Map((masterOutlets || []).map((outlet) => [String(outlet.id), outlet]));
  (distributionOutlets || []).forEach((entry) => {
    const outlet = entry.outlet;
    if (outlet?.id && !map.has(String(outlet.id))) {
      map.set(String(outlet.id), outlet);
    }
  });
  return Array.from(map.values());
}

// Roti Tawar selalu paling atas
function sortItems(items) {
  return [...items].sort((a, b) => {
    const aIsRoti = a.material_name?.toLowerCase().includes('roti tawar');
    const bIsRoti = b.material_name?.toLowerCase().includes('roti tawar');
    if (aIsRoti && !bIsRoti) return -1;
    if (!aIsRoti && bIsRoti) return 1;
    return 0;
  });
}

export default function DistributionListing() {
  const [date, setDate] = useState(toInputDate());
  const [outlets, setOutlets] = useState([]);
  const [selectedOutletId, setSelectedOutletId] = useState('');
  const [distributionData, setDistributionData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [checks, setChecks] = useState({});

  useEffect(() => {
    publicApi.get('/api/public/outlets').then((res) => {
      setOutlets(res.data || []);
      if ((res.data || []).length > 0) setSelectedOutletId(String(res.data[0].id));
    }).catch(console.error);
  }, []);

  const loadDistribution = useCallback(async () => {
    setLoading(true);
    try {
      const res = await publicApi.get(`/api/public/distribution?date=${date}`);
      setDistributionData(res.data);
    } catch (err) {
      console.error(err);
      setDistributionData(null);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { loadDistribution(); }, [loadDistribution]);
  useEffect(() => {
    const merged = mergeOutletTabs(outlets, distributionData?.outlets || []);
    const selectedExists = merged.some((outlet) => String(outlet.id) === String(selectedOutletId));
    if ((!selectedOutletId || !selectedExists) && merged.length > 0) {
      setSelectedOutletId(String(merged[0].id));
    }
  }, [outlets, distributionData, selectedOutletId]);
  useEffect(() => {
    if (selectedOutletId) setChecks(loadChecks(date, selectedOutletId));
  }, [date, selectedOutletId]);

  const toggleCheck = (itemId) => {
    const next = { ...checks, [itemId]: !checks[itemId] };
    setChecks(next);
    saveChecks(date, selectedOutletId, next);
  };

  const displayOutlets = mergeOutletTabs(outlets, distributionData?.outlets || []);
  const outletData = distributionData?.outlets?.find(
    (o) => String(o.outlet?.id) === String(selectedOutletId)
  );
  const isAdjustmentGroup = !!outletData?.is_adjustment_group;
  const rawItems = outletData?.items || [];
  const items = sortItems(rawItems);
  const checkedCount = items.filter((item) => checks[item.id]).length;
  const allDone = items.length > 0 && checkedCount === items.length;
  const progressPct = items.length > 0 ? (checkedCount / items.length) * 100 : 0;
  const selectedOutletName = displayOutlets.find((o) => String(o.id) === String(selectedOutletId))?.name || '';

  return (
    // text-[16px] mencegah auto-zoom iOS saat tap input
    <div className="min-h-screen bg-gray-100 text-[16px]">

      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-20 bg-brand-red shadow-md">
        {/* Baris atas: judul + date */}
        <div className="px-4 pt-5 pb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-red-300 text-[11px] font-bold tracking-widest uppercase mb-0.5">
              Roti Bakar Ngeunah
            </p>
            <h1 className="text-white text-xl font-bold leading-tight">Distribution Listing</h1>
            <p className="text-red-200 text-sm mt-0.5">{formatDateID(date)}</p>
          </div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-red-700 text-white text-sm rounded-xl px-3 py-2 border border-red-600 focus:outline-none focus:ring-2 focus:ring-white/40 flex-shrink-0 mt-1"
          />
        </div>

        {/* Tab navigasi cabang — horizontal scroll */}
        <div className="pb-3">
          <p className="px-4 text-red-300 text-[10px] font-bold tracking-widest uppercase mb-2">
            Pilih Cabang
          </p>
          <div className="flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none">
            {displayOutlets.map((o) => {
              const active = String(o.id) === String(selectedOutletId);
              return (
                <button
                  key={o.id}
                  onClick={() => setSelectedOutletId(String(o.id))}
                  className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all active:scale-95 ${
                    active
                      ? 'bg-white text-brand-red shadow-sm'
                      : 'bg-red-700/60 text-red-100 border border-red-600'
                  }`}
                >
                  {o.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="px-4 pt-3 pb-24 max-w-lg mx-auto space-y-3">

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-400">Memuat data...</p>
          </div>
        ) : !distributionData?.session ? (
          <div className="bg-white rounded-2xl shadow-sm p-10 text-center mt-4">
            <p className="text-5xl mb-3">📋</p>
            <p className="font-semibold text-gray-700 text-base">Belum ada order untuk tanggal ini</p>
            <p className="text-sm text-gray-400 mt-1">Order belum dibuat atau belum ada item yang diisi</p>
          </div>
        ) : (
          <>
            {/* Progress bar */}
            <div className="bg-white rounded-2xl shadow-sm px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-600">Progress Pengecekan</span>
                <span className={`text-sm font-bold tabular-nums ${allDone ? 'text-green-600' : 'text-brand-red'}`}>
                  {checkedCount} / {items.length}
                </span>
              </div>
              <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${allDone ? 'bg-green-500' : 'bg-brand-red'}`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              {allDone && (
                <p className="text-green-600 text-xs font-bold mt-2 text-center tracking-wide">
                  ✓ Semua item sudah dicek!
                </p>
              )}
            </div>

            {/* Daftar item */}
            {items.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
                <p className="text-4xl mb-2">📦</p>
                <p className="font-medium text-gray-600">Tidak ada bahan untuk outlet ini</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">

                {/* Card header */}
                <div className="flex items-center justify-between px-4 py-3.5 bg-orange-50 border-b border-orange-100">
                  <h2 className="font-bold text-brand-red text-base">{selectedOutletName}</h2>
                  <span className={`${isAdjustmentGroup ? 'bg-blue-600' : 'bg-brand-red'} text-white text-xs font-bold px-3 py-1 rounded-full`}>
                    {items.length} item
                  </span>
                </div>

                {/* Rows */}
                {items.map((item, idx) => {
                  const checked = !!checks[item.id];
                  const isRoti = item.material_name?.toLowerCase().includes('roti tawar');
                  const isAdjustment = item.source === 'adjustment';
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center border-b border-gray-100 last:border-b-0 transition-colors active:bg-gray-50 ${
                        checked
                          ? 'bg-green-50'
                          : isAdjustment
                          ? 'bg-blue-50/50'
                          : isRoti
                          ? 'bg-orange-50/40'
                          : 'bg-white'
                      }`}
                    >
                      {/* Tap area kiri: nomor + nama (flex-1, tinggi 60px min) */}
                      <button
                        onClick={() => toggleCheck(item.id)}
                        className="flex-1 min-w-0 flex items-center gap-3 px-4 py-4 text-left"
                      >
                        <span className="w-5 text-right text-sm text-gray-300 font-semibold flex-shrink-0 tabular-nums">
                          {idx + 1}
                        </span>
                        <span className={`flex-1 min-w-0 text-base font-medium leading-tight ${
                          checked ? 'line-through text-gray-400' : isRoti ? 'text-brand-red font-semibold' : 'text-gray-800'
                        }`}>
                          {item.material_name}
                          {isAdjustment && !checked && (
                            <span className="ml-2 text-[10px] font-bold bg-blue-600 text-white px-1.5 py-0.5 rounded-full align-middle">
                              MENYUSUL
                            </span>
                          )}
                          {isRoti && !checked && (
                            <span className="ml-2 text-[10px] font-bold bg-brand-red text-white px-1.5 py-0.5 rounded-full align-middle">
                              UTAMA
                            </span>
                          )}
                          {(item.material_brand || item.supplier?.name || item.adjustment_note) && (
                            <span className={`block mt-1 text-xs font-normal leading-snug ${checked ? 'text-gray-400' : 'text-gray-500'}`}>
                              {item.material_brand ? `Merk: ${item.material_brand}` : ''}
                              {item.material_brand && item.supplier?.name ? ' | ' : ''}
                              {item.supplier?.name ? `Supplier: ${item.supplier.name}` : ''}
                              {(item.material_brand || item.supplier?.name) && item.adjustment_note ? ' | ' : ''}
                              {item.adjustment_note || ''}
                            </span>
                          )}
                        </span>
                      </button>

                      {/* Qty + Satuan */}
                      <div className="flex items-center gap-1.5 flex-shrink-0 pr-2">
                        <span className={`w-9 text-right text-lg font-bold tabular-nums ${checked ? 'text-gray-400' : 'text-gray-800'}`}>
                          {item.qty}
                        </span>
                        <span className="w-[52px] text-center text-xs font-medium text-gray-500 bg-gray-100 rounded-full py-0.5">
                          {item.purchase_unit || 'pcs'}
                        </span>
                      </div>

                      {/* Tombol centang — 44×44px tap target */}
                      <button
                        onClick={() => toggleCheck(item.id)}
                        className={`w-11 h-11 flex-shrink-0 flex items-center justify-center mr-2 rounded-full transition-all active:scale-90 ${
                          checked
                            ? 'text-green-500'
                            : 'text-gray-300 hover:text-gray-400'
                        }`}
                      >
                        {checked ? (
                          <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
                            <path fillRule="evenodd" d="M2.25 12a9.75 9.75 0 1119.5 0 9.75 9.75 0 01-19.5 0zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor" className="w-7 h-7">
                            <circle cx="12" cy="12" r="9.25" />
                          </svg>
                        )}
                      </button>
                    </div>
                  );
                })}

                {/* Footer */}
                <div className="bg-brand-red px-4 py-4 flex items-center justify-between">
                  <span className="text-white text-sm font-semibold">
                    {isAdjustmentGroup ? 'Total Bahan Menyusul' : 'Total Bahan Masuk'}
                  </span>
                  <span className="text-white font-bold">{items.length} item</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
