import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { toInputDate, formatDateID } from '../lib/api';

const baseURL = import.meta.env.VITE_API_URL ?? '';
const publicApi = axios.create({ baseURL, timeout: 30000 });

const STORAGE_KEY = (date, outletId) => `dist_check_${date}_${outletId}`;

function loadChecks(date, outletId) {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY(date, outletId)) || '{}');
  } catch {
    return {};
  }
}

function saveChecks(date, outletId, checks) {
  localStorage.setItem(STORAGE_KEY(date, outletId), JSON.stringify(checks));
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
    if (selectedOutletId) setChecks(loadChecks(date, selectedOutletId));
  }, [date, selectedOutletId]);

  const toggleCheck = (itemId) => {
    const next = { ...checks, [itemId]: !checks[itemId] };
    setChecks(next);
    saveChecks(date, selectedOutletId, next);
  };

  const outletData = distributionData?.outlets?.find(
    (o) => String(o.outlet?.id) === String(selectedOutletId)
  );
  const items = outletData?.items || [];
  const checkedCount = items.filter((item) => checks[item.id]).length;
  const allDone = items.length > 0 && checkedCount === items.length;
  const progressPct = items.length > 0 ? (checkedCount / items.length) * 100 : 0;
  const selectedOutletName = outlets.find((o) => String(o.id) === String(selectedOutletId))?.name || '';

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header ── */}
      <div className="bg-brand-red px-5 pt-6 pb-8">
        <p className="text-red-300 text-xs font-semibold tracking-widest uppercase mb-1">Roti Bakar Ngeunah</p>
        <h1 className="text-white text-2xl font-bold leading-tight">Distribution Listing</h1>
        <p className="text-red-200 text-sm mt-0.5">{formatDateID(date)}</p>
      </div>

      {/* ── Content (overlap header) ── */}
      <div className="px-4 -mt-3 max-w-xl mx-auto pb-10 space-y-3">

        {/* Pilih Outlet + Tanggal */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <p className="text-xs font-semibold text-brand-red tracking-widest uppercase mb-3">Pilih Outlet</p>
          <select
            value={selectedOutletId}
            onChange={(e) => setSelectedOutletId(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange bg-white mb-2"
          >
            {outlets.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-orange"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !distributionData?.session ? (
          <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
            <p className="text-4xl mb-3">📋</p>
            <p className="font-semibold text-gray-700">Belum ada order untuk tanggal ini</p>
            <p className="text-sm text-gray-400 mt-1">Order belum dibuat atau belum ada item yang diisi</p>
          </div>
        ) : (
          <>
            {/* Progress */}
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-700">Progress Pengecekan</span>
                <span className={`text-sm font-bold ${allDone ? 'text-green-600' : 'text-brand-red'}`}>
                  {checkedCount} / {items.length}
                </span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${allDone ? 'bg-green-500' : 'bg-brand-red'}`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              {allDone && (
                <p className="text-green-600 text-xs font-semibold mt-2 text-center">
                  Semua item sudah dicek!
                </p>
              )}
            </div>

            {/* Item list */}
            {items.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
                <p className="text-3xl mb-2">📦</p>
                <p className="font-medium text-gray-600">Tidak ada bahan masuk untuk outlet ini</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {/* Card title */}
                <div className="flex items-center justify-between px-5 py-4">
                  <h2 className="font-bold text-brand-red text-base">{selectedOutletName}</h2>
                  <span className="bg-brand-red text-white text-xs font-bold px-3 py-1 rounded-full">
                    {items.length} item
                  </span>
                </div>

                <div className="border-t border-gray-100">
                  {items.map((item, idx) => {
                    const checked = !!checks[item.id];
                    return (
                      <div
                        key={item.id}
                        className={`flex items-center px-5 py-3.5 border-b border-gray-50 last:border-b-0 transition-colors ${checked ? 'bg-green-50' : ''}`}
                      >
                        {/* Nomor — lebar tetap, rata kanan */}
                        <span className="w-6 flex-shrink-0 text-right text-sm text-gray-300 font-medium mr-3">
                          {idx + 1}
                        </span>

                        {/* Nama — ambil sisa ruang */}
                        <p className={`flex-1 min-w-0 text-sm font-medium truncate ${checked ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                          {item.material_name}
                        </p>

                        {/* Qty — lebar tetap, rata kanan */}
                        <span className={`w-10 flex-shrink-0 text-right text-base font-bold ml-3 ${checked ? 'text-gray-400' : 'text-gray-800'}`}>
                          {item.qty}
                        </span>

                        {/* Satuan — lebar tetap, rata kiri */}
                        <span className="w-16 flex-shrink-0 ml-1.5 text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5 font-medium text-center">
                          {item.purchase_unit || 'pcs'}
                        </span>

                        {/* Tombol centang — lebar tetap */}
                        <button
                          onClick={() => toggleCheck(item.id)}
                          className={`ml-3 w-7 h-7 flex-shrink-0 rounded-full border-2 flex items-center justify-center transition-all ${
                            checked
                              ? 'bg-green-500 border-green-500'
                              : 'border-gray-300 hover:border-brand-orange'
                          }`}
                        >
                          {checked && (
                            <svg viewBox="0 0 12 10" fill="none" className="w-3 h-3">
                              <path d="M1 5l3.5 3.5L11 1" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Footer */}
                <div className="bg-brand-red px-5 py-3.5 flex items-center justify-between">
                  <span className="text-white text-sm font-semibold">Total Bahan Masuk</span>
                  <span className="text-white font-bold text-sm">{items.length} item</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

