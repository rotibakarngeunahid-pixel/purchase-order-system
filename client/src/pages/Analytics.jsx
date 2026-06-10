import { useEffect, useState } from 'react';
import api, { formatRupiah, toInputDate } from '../lib/api';

function getFirstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function formatMonth(yyyymm) {
  const [year, month] = yyyymm.split('-');
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
    'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
  ];
  return `${months[parseInt(month, 10) - 1]} ${year}`;
}

function BarRow({ label, value, maxValue, unit = '', secondaryValue = '' }) {
  const pct = maxValue > 0 ? Math.round((value / maxValue) * 100) : 0;
  return (
    <div className="grid grid-cols-[minmax(96px,140px)_minmax(80px,1fr)_minmax(116px,148px)] sm:grid-cols-[minmax(140px,180px)_minmax(120px,1fr)_minmax(136px,172px)] items-center gap-3 py-2">
      <div className="text-sm text-gray-700 truncate">{label}</div>
      <div className="bg-gray-100 rounded-full h-4 overflow-hidden">
        <div
          className="bg-brand-red h-4 rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-right tabular-nums whitespace-nowrap">
        <div className="text-sm font-semibold text-gray-800">
          {value.toLocaleString('id-ID')} {unit}
        </div>
        {secondaryValue ? (
          <div className="text-xs font-semibold text-brand-red mt-0.5">
            Total {secondaryValue}
          </div>
        ) : null}
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
    try {
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
    } catch (err) {
      console.error('loadAll analytics error:', err);
    } finally {
      setLoading(false);
    }
  }

  const maxMaterialQty = Math.max(...materialsData.map((m) => m.total_qty), 1);
  const maxOutletQty = Math.max(...outletsData.map((o) => o.total_qty), 1);
  const maxTrendValue = Math.max(...trendsData.map((t) => t.total_actual), 1);
  const totalActual = materialsData.reduce((s, item) => s + Number(item.total_expense || 0), 0);

  const tabs = [
    { id: 'materials', label: 'Top Bahan' },
    { id: 'outlets', label: 'Per Cabang' },
    { id: 'trends', label: 'Tren Bulanan' },
  ];

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1 className="page-title">Analitik</h1>
          <p className="page-subtitle">Konsumsi bahan, per cabang, dan tren bulanan</p>
        </div>
      </div>

      {/* Filter */}
      <div className="filter-card">
        <div className="filter-field">
          <label className="filter-label">Dari</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="input"
          />
        </div>
        <div className="filter-field">
          <label className="filter-label">Sampai</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="input"
          />
        </div>
        <div className="filter-field">
          <label className="filter-label">Cabang</label>
          <select
            value={outletId}
            onChange={(e) => setOutletId(e.target.value)}
            className="input"
          >
            <option value="">Semua Cabang</option>
            {outlets.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>
        <button onClick={loadAll} disabled={loading} className="btn-primary text-sm h-10">
          {loading ? 'Memuat...' : 'Terapkan'}
        </button>
      </div>

      {/* Summary cards (trends) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="stat-card">
          <p className="stat-label">Total PO Selesai</p>
          <p className="stat-value">
            {trendsData.reduce((s, t) => s + t.order_count, 0)}
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Total Aktual</p>
          <p className="stat-value text-brand-red">
            {formatRupiah(totalActual)}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="segmented-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`segmented-tab ${
              activeTab === tab.id
                ? 'segmented-tab-active'
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
          <h2 className="font-semibold text-gray-800 mb-4">Top 20 Bahan Paling Banyak Tercatat</h2>
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
                  secondaryValue={formatRupiah(item.total_expense || 0)}
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
          <div className="mt-5 table-wrap">
            <table className="data-table table-fixed" style={{ minWidth: '640px' }}>
              <colgroup>
                <col style={{ width: '48%' }} />
                <col style={{ width: '28%' }} />
                <col style={{ width: '24%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Cabang</th>
                  <th className="num-cell">Total Qty Dipesan</th>
                  <th className="num-cell">Frekuensi</th>
                </tr>
              </thead>
              <tbody>
                {outletsData.map((item) => (
                  <tr key={item.outlet.id}>
                    <td className="font-medium text-gray-800 truncate">{item.outlet.name}</td>
                    <td className="num-cell text-gray-700">
                      {item.total_qty.toLocaleString('id-ID')}
                    </td>
                    <td className="num-cell text-gray-600">{item.order_count} x</td>
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
              <div className="table-wrap">
              <table className="data-table table-fixed" style={{ minWidth: '560px' }}>
                <colgroup>
                  <col style={{ width: '48%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '32%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Bulan</th>
                    <th className="num-cell">Jml PO</th>
                    <th className="num-cell">Aktual</th>
                  </tr>
                </thead>
                <tbody>
                  {trendsData.map((item) => (
                    <tr key={item.month}>
                      <td className="font-medium text-gray-800">{formatMonth(item.month)}</td>
                      <td className="num-cell text-gray-600">{item.order_count}</td>
                      <td className="num-cell font-semibold text-brand-red">{formatRupiah(item.total_actual)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-orange-50 border-t-2 border-orange-200">
                    <td className="px-4 py-2.5 font-semibold text-gray-700">Total</td>
                    <td className="num-cell font-bold text-gray-800">
                      {trendsData.reduce((s, t) => s + t.order_count, 0)}
                    </td>
                    <td className="num-cell font-bold text-brand-red">
                      {formatRupiah(trendsData.reduce((s, t) => s + t.total_actual, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
