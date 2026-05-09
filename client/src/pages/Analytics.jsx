import { useEffect, useState } from 'react';
import api, { formatRupiah } from '../lib/api';

function getFirstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function toInputDate(date = new Date()) {
  return date.toISOString().split('T')[0];
}

function formatMonth(yyyymm) {
  const [year, month] = yyyymm.split('-');
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
    'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
  ];
  return `${months[parseInt(month, 10) - 1]} ${year}`;
}

function BarRow({ label, value, maxValue, unit = '' }) {
  const pct = maxValue > 0 ? Math.round((value / maxValue) * 100) : 0;
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-32 text-sm text-gray-700 truncate flex-shrink-0">{label}</div>
      <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
        <div
          className="bg-brand-red h-4 rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="w-24 text-right text-sm font-semibold text-gray-800 flex-shrink-0">
        {value.toLocaleString('id-ID')} {unit}
      </div>
    </div>
  );
}

export default function Analytics() {
  const [activeTab, setActiveTab] = useState('materials');
  const [dateFrom, setDateFrom] = useState(getFirstOfMonth());
  const [dateTo, setDateTo] = useState(toInputDate());
  const [outletId, setOutletId] = useState('');
  const [outlets, setOutlets] = useState([]);

  const [materialsData, setMaterialsData] = useState([]);
  const [outletsData, setOutletsData] = useState([]);
  const [trendsData, setTrendsData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/api/outlets').then((res) => setOutlets((res.data || []).filter((o) => o.is_active)));
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    const params = new URLSearchParams();
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    if (outletId) params.set('outlet_id', outletId);

    const [matRes, outletRes, trendRes] = await Promise.all([
      api.get(`/api/reports/analytics/materials?${params}`),
      api.get(`/api/reports/analytics/outlets?${params}`),
      api.get(`/api/reports/analytics/trends?${params}`),
    ]);

    setMaterialsData(matRes.data || []);
    setOutletsData(outletRes.data || []);
    setTrendsData(trendRes.data || []);
    setLoading(false);
  }

  const maxMaterialQty = Math.max(...materialsData.map((m) => m.total_qty), 1);
  const maxOutletQty = Math.max(...outletsData.map((o) => o.total_qty), 1);
  const maxTrendValue = Math.max(...trendsData.map((t) => t.total_actual), 1);

  const tabs = [
    { id: 'materials', label: 'Top Bahan' },
    { id: 'outlets', label: 'Per Cabang' },
    { id: 'trends', label: 'Tren Bulanan' },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Analitik</h1>
        <p className="text-gray-500 text-sm mt-0.5">Konsumsi bahan, per cabang, dan tren bulanan</p>
      </div>

      {/* Filter */}
      <div className="card p-4 mb-6 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 whitespace-nowrap">Dari:</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="input text-sm w-auto"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 whitespace-nowrap">Sampai:</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="input text-sm w-auto"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 whitespace-nowrap">Cabang:</label>
          <select
            value={outletId}
            onChange={(e) => setOutletId(e.target.value)}
            className="input text-sm w-auto"
          >
            <option value="">Semua Cabang</option>
            {outlets.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>
        <button onClick={loadAll} disabled={loading} className="btn-primary text-sm">
          {loading ? 'Memuat...' : 'Terapkan'}
        </button>
      </div>

      {/* Summary cards (trends) */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total PO Selesai</p>
          <p className="text-2xl font-bold text-gray-900">
            {trendsData.reduce((s, t) => s + t.order_count, 0)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Estimasi</p>
          <p className="text-2xl font-bold text-gray-900">
            {formatRupiah(trendsData.reduce((s, t) => s + t.total_estimated, 0))}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Aktual</p>
          <p className="text-2xl font-bold text-brand-red">
            {formatRupiah(trendsData.reduce((s, t) => s + t.total_actual, 0))}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white text-brand-red shadow-sm'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
        </div>
      ) : activeTab === 'materials' ? (
        <div className="card p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Top 20 Bahan Paling Banyak Dipesan</h2>
          {materialsData.length === 0 ? (
            <p className="text-center text-gray-400 py-10">Tidak ada data dalam periode ini</p>
          ) : (
            <div>
              {materialsData.map((item) => (
                <BarRow
                  key={item.material.id}
                  label={`${item.material.name}`}
                  value={item.total_qty}
                  maxValue={maxMaterialQty}
                  unit={item.material.purchase_unit}
                />
              ))}
            </div>
          )}
        </div>
      ) : activeTab === 'outlets' ? (
        <div className="card p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Konsumsi per Cabang (Total Qty Permintaan)</h2>
          {outletsData.length === 0 ? (
            <p className="text-center text-gray-400 py-10">Tidak ada data dalam periode ini</p>
          ) : (
            <div>
              {outletsData.map((item) => (
                <BarRow
                  key={item.outlet.id}
                  label={item.outlet.name}
                  value={item.total_qty}
                  maxValue={maxOutletQty}
                />
              ))}
            </div>
          )}
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-2.5 text-left font-medium text-gray-600">Cabang</th>
                  <th className="px-4 py-2.5 text-right font-medium text-gray-600">Total Qty Dipesan</th>
                  <th className="px-4 py-2.5 text-right font-medium text-gray-600">Frekuensi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {outletsData.map((item) => (
                  <tr key={item.outlet.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-800">{item.outlet.name}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">
                      {item.total_qty.toLocaleString('id-ID')}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{item.order_count} x</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Tren Pengeluaran Bulanan</h2>
          {trendsData.length === 0 ? (
            <p className="text-center text-gray-400 py-10">Tidak ada data dalam periode ini</p>
          ) : (
            <>
              <div className="mb-5">
                {trendsData.map((item) => (
                  <BarRow
                    key={item.month}
                    label={formatMonth(item.month)}
                    value={item.total_actual}
                    maxValue={maxTrendValue}
                  />
                ))}
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-4 py-2.5 text-left font-medium text-gray-600">Bulan</th>
                    <th className="px-4 py-2.5 text-right font-medium text-gray-600">Jml PO</th>
                    <th className="px-4 py-2.5 text-right font-medium text-gray-600">Est. Total</th>
                    <th className="px-4 py-2.5 text-right font-medium text-gray-600">Aktual</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {trendsData.map((item) => (
                    <tr key={item.month} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-800">{formatMonth(item.month)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{item.order_count}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700">{formatRupiah(item.total_estimated)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-brand-red">{formatRupiah(item.total_actual)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-orange-50 border-t-2 border-orange-200">
                    <td className="px-4 py-2.5 font-semibold text-gray-700">Total</td>
                    <td className="px-4 py-2.5 text-right font-bold text-gray-800">
                      {trendsData.reduce((s, t) => s + t.order_count, 0)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-gray-800">
                      {formatRupiah(trendsData.reduce((s, t) => s + t.total_estimated, 0))}
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-brand-red">
                      {formatRupiah(trendsData.reduce((s, t) => s + t.total_actual, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  );
}
