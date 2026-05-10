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

  // Ambil daftar outlet aktif untuk dropdown
  useEffect(() => {
    publicApi.get('/api/public/outlets').then((res) => {
      setOutlets(res.data || []);
      if ((res.data || []).length > 0) setSelectedOutletId(String(res.data[0].id));
    }).catch(console.error);
  }, []);

  // Muat data distribusi saat tanggal berubah
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

  // Muat checks dari localStorage saat outlet/tanggal berubah
  useEffect(() => {
    if (selectedOutletId) {
      setChecks(loadChecks(date, selectedOutletId));
    }
  }, [date, selectedOutletId]);

  const toggleCheck = (itemId) => {
    const next = { ...checks, [itemId]: !checks[itemId] };
    setChecks(next);
    saveChecks(date, selectedOutletId, next);
  };

  // Cari data untuk outlet yang dipilih
  const outletData = distributionData?.outlets?.find(
    (o) => String(o.outlet?.id) === String(selectedOutletId)
  );
  const items = outletData?.items || [];
  const checkedCount = items.filter((item) => checks[item.id]).length;
  const totalQty = items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
  const progressPct = items.length > 0 ? (checkedCount / items.length) * 100 : 0;

  const selectedOutletName = outlets.find((o) => String(o.id) === String(selectedOutletId))?.name || '';

  return (
    <div className="min-h-screen bg-[#fdf6f0]">
      {/* Header */}
      <div className="bg-brand-red px-6 py-5">
        <p className="text-red-200 text-xs font-medium tracking-widest uppercase mb-0.5">Roti Bakar Ngeunah</p>
        <h1 className="text-white text-2xl font-bold">Distribution Listing</h1>
        <p className="text-red-200 text-sm mt-0.5">{formatDateID(date)}</p>
      </div>

      <div className="p-4 max-w-2xl mx-auto space-y-4 mt-4">
        {/* Pilih Outlet */}
        <div className="bg-white rounded-2xl shadow-sm border border-orange-100 p-4">
          <p className="text-brand-red text-xs font-semibold tracking-widest uppercase mb-2">Pilih Outlet</p>
          <div className="flex gap-2">
            <select
              value={selectedOutletId}
              onChange={(e) => setSelectedOutletId(e.target.value)}
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange bg-white appearance-none"
            >
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-orange"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !distributionData?.session ? (
          <div className="bg-white rounded-2xl shadow-sm border border-orange-100 p-10 text-center text-gray-400">
            <p className="text-4xl mb-3">📋</p>
            <p className="font-medium text-gray-600">Tidak ada order untuk tanggal ini</p>
            <p className="text-sm mt-1">Order belum dibuat atau belum ada item</p>
          </div>
        ) : (
          <>
            {/* Progress Bar */}
            <div className="bg-white rounded-2xl shadow-sm border border-orange-100 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Progress Pengecekan</span>
                <span className="text-sm font-bold text-brand-red">{checkedCount} / {items.length}</span>
              </div>
              <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-red rounded-full transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              {checkedCount === items.length && items.length > 0 && (
                <p className="text-green-600 text-xs font-medium mt-2 text-center">Semua item sudah dicek!</p>
              )}
            </div>

            {/* Daftar Item */}
            {items.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm border border-orange-100 p-8 text-center text-gray-400">
                <p className="text-3xl mb-2">📦</p>
                <p className="font-medium">Tidak ada bahan masuk untuk outlet ini</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm border border-orange-100 overflow-hidden">
                {/* Card header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-orange-50">
                  <h2 className="font-bold text-brand-red text-base">{selectedOutletName}</h2>
                  <span className="bg-brand-red text-white text-xs font-semibold px-3 py-1 rounded-full">
                    {items.length} item
                  </span>
                </div>

                {/* Item list */}
                <div className="divide-y divide-gray-50">
                  {items.map((item, idx) => {
                    const checked = !!checks[item.id];
                    return (
                      <div
                        key={item.id}
                        className={`flex items-center gap-4 px-5 py-4 transition-colors ${checked ? 'bg-green-50' : 'hover:bg-gray-50'}`}
                      >
                        <span className="text-gray-400 text-sm w-5 text-right flex-shrink-0">{idx + 1}</span>
                        <div className="flex-1">
                          <p className={`font-medium text-sm ${checked ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                            {item.material_name}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xl font-bold text-gray-800">{item.qty}</span>
                          <span className="text-xs text-gray-500 border border-gray-200 rounded-full px-2 py-0.5">
                            {item.purchase_unit || 'pcs'}
                          </span>
                        </div>
                        <button
                          onClick={() => toggleCheck(item.id)}
                          className={`w-8 h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                            checked
                              ? 'bg-green-500 border-green-500 text-white'
                              : 'border-gray-300 text-transparent hover:border-brand-orange'
                          }`}
                        >
                          {checked && (
                            <svg viewBox="0 0 12 10" fill="none" className="w-3.5 h-3.5">
                              <path d="M1 5l3.5 3.5L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Footer total */}
                <div className="bg-brand-red px-5 py-3.5 flex items-center justify-between">
                  <span className="text-white text-sm font-semibold">Total Bahan Masuk</span>
                  <span className="text-white font-bold text-base">{totalQty} Pcs</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
