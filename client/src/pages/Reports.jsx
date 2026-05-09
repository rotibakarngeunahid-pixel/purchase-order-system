import { useEffect, useState } from 'react';
import api, { formatRupiah, formatDateID, toInputDate } from '../lib/api';

function getFirstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function Reports() {
  const [dateFrom, setDateFrom] = useState(getFirstOfMonth());
  const [dateTo, setDateTo] = useState(toInputDate());
  const [supplierId, setSupplierId] = useState('');
  const [suppliers, setSuppliers] = useState([]);
  const [dailyData, setDailyData] = useState([]);
  const [supplierSummary, setSupplierSummary] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('daily');

  useEffect(() => {
    api.get('/api/suppliers').then((res) => setSuppliers(res.data.filter((s) => s.is_active)));
    loadReports();
  }, []);

  async function loadReports() {
    setLoading(true);
    const params = new URLSearchParams();
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    if (supplierId) params.set('supplier_id', supplierId);

    const [dailyRes, supplierRes] = await Promise.all([
      api.get(`/api/reports/daily?${params}`),
      api.get(`/api/reports/supplier?${params}`),
    ]);
    setDailyData(dailyRes.data);
    setSupplierSummary(supplierRes.data);
    setLoading(false);
  }

  const totalActual = dailyData
    .filter((po) => po.status === 'received')
    .reduce((sum, po) => sum + Number(po.total_actual || 0), 0);
  const totalEstimated = dailyData.reduce((sum, po) => sum + Number(po.total_estimated || 0), 0);

  const statusLabel = { pending: 'Pending', confirmed: 'Dikonfirmasi', received: 'Diterima' };
  const statusClass = { pending: 'badge-pending', confirmed: 'badge-sent', received: 'badge-received' };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Laporan</h1>
        <p className="text-gray-500 text-sm mt-0.5">Ringkasan pengeluaran dan histori order</p>
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
          <label className="text-sm text-gray-600 whitespace-nowrap">Supplier:</label>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="input text-sm w-auto"
          >
            <option value="">Semua Supplier</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <button onClick={loadReports} disabled={loading} className="btn-primary text-sm">
          {loading ? 'Memuat...' : '🔍 Terapkan Filter'}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total PO</p>
          <p className="text-2xl font-bold text-gray-900">{dailyData.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Estimasi</p>
          <p className="text-2xl font-bold text-gray-900">{formatRupiah(totalEstimated)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Aktual (Diterima)</p>
          <p className="text-2xl font-bold text-brand-red">{formatRupiah(totalActual)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit mb-4">
        {[
          { id: 'daily', label: '📅 Pengeluaran Harian' },
          { id: 'supplier', label: '🏭 Per Supplier' },
        ].map((tab) => (
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
      ) : activeTab === 'daily' ? (
        <div className="card overflow-hidden">
          {dailyData.length === 0 ? (
            <div className="p-10 text-center text-gray-400">
              <p className="text-4xl mb-3">📊</p>
              <p>Tidak ada data dalam rentang tanggal ini</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Tanggal Order</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Supplier</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">Jml Item</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">Status</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Est. Total</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Aktual</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {dailyData.map((po) => (
                    <tr key={po.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-800">
                        {formatDateID(po.session?.order_date)}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800">{po.supplier?.name}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{po.items?.length || 0}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={statusClass[po.status] || 'badge-pending'}>
                          {statusLabel[po.status] || po.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatRupiah(po.total_estimated)}</td>
                      <td className="px-4 py-3 text-right font-medium text-brand-red">
                        {po.total_actual ? formatRupiah(po.total_actual) : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-orange-50 border-t-2 border-orange-200">
                    <td colSpan={4} className="px-4 py-3 text-right font-semibold text-gray-700">
                      Total:
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-gray-800">
                      {formatRupiah(totalEstimated)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-brand-red">
                      {formatRupiah(totalActual)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="card overflow-hidden">
          {supplierSummary.length === 0 ? (
            <div className="p-10 text-center text-gray-400">
              <p className="text-4xl mb-3">🏭</p>
              <p>Tidak ada data supplier</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Supplier</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Jml Order</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Total Estimasi</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Total Aktual</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Rata-rata/Order</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {supplierSummary
                  .filter((s) => s.total_orders > 0)
                  .map((s) => (
                    <tr key={s.supplier.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{s.supplier.name}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{s.total_orders}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatRupiah(s.total_estimated)}</td>
                      <td className="px-4 py-3 text-right font-medium text-brand-red">
                        {s.total_actual > 0 ? formatRupiah(s.total_actual) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">{formatRupiah(s.avg_order_value)}</td>
                    </tr>
                  ))}
              </tbody>
              <tfoot>
                <tr className="bg-orange-50 border-t-2 border-orange-200">
                  <td className="px-4 py-3 font-semibold text-gray-700">Total</td>
                  <td className="px-4 py-3 text-center font-bold text-gray-800">
                    {supplierSummary.reduce((s, r) => s + r.total_orders, 0)}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-800">
                    {formatRupiah(supplierSummary.reduce((s, r) => s + r.total_estimated, 0))}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-brand-red">
                    {formatRupiah(supplierSummary.reduce((s, r) => s + r.total_actual, 0))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
