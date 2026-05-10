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
  const [barangMasukData, setBarangMasukData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('daily');
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [lastReset, setLastReset] = useState(null);

  useEffect(() => {
    api.get('/api/suppliers').then((res) => setSuppliers(res.data.filter((s) => s.is_active)));
    loadReports();
    loadLastReset();
  }, []);

  async function loadLastReset() {
    try {
      const res = await api.get('/api/reports/last-reset');
      setLastReset(res.data);
    } catch {}
  }

  async function handleReset() {
    setResetting(true);
    try {
      const res = await api.post('/api/reports/reset', { reset_type: 'all' });
      setLastReset(res.data);
      setDateFrom(toInputDate());
      setDateTo(toInputDate());
      setShowResetModal(false);
      loadReports();
    } catch (err) {
      alert('Gagal reset: ' + (err.response?.data?.error || err.message));
    } finally {
      setResetting(false);
    }
  }

  async function loadReports() {
    setLoading(true);
    const params = new URLSearchParams();
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    if (supplierId) params.set('supplier_id', supplierId);

    const [dailyRes, supplierRes, barangMasukRes] = await Promise.all([
      api.get(`/api/reports/daily?${params}`),
      api.get(`/api/reports/supplier?${params}`),
      api.get(`/api/purchase-report?${params}`),
    ]);
    setDailyData(dailyRes.data);
    setSupplierSummary(supplierRes.data);
    setBarangMasukData(barangMasukRes.data);
    setLoading(false);
  }

  const totalActual = dailyData
    .filter((po) => po.status === 'received')
    .reduce((sum, po) => sum + Number(po.total_actual || 0), 0);
  const totalEstimated = dailyData.reduce((sum, po) => sum + Number(po.total_estimated || 0), 0);
  const totalBarangMasuk = barangMasukData.reduce(
    (sum, item) => sum + Number(item.qty || 0) * Number(item.price_per_unit || 0),
    0
  );

  const barangMasukByDate = barangMasukData.reduce((acc, item) => {
    const d = item.date;
    if (!acc[d]) acc[d] = [];
    acc[d].push(item);
    return acc;
  }, {});

  const statusLabel = { pending: 'Pending', confirmed: 'Dikonfirmasi', received: 'Diterima' };
  const statusClass = { pending: 'badge-pending', confirmed: 'badge-sent', received: 'badge-received' };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Reset confirmation modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="font-bold text-gray-900 text-lg mb-2">Reset Laporan?</h3>
            <p className="text-gray-600 text-sm mb-5">
              Data transaksi tidak akan dihapus. Tampilan laporan akan dimulai dari hari ini dan event
              reset ini akan dicatat dalam log.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowResetModal(false)}
                disabled={resetting}
                className="btn-secondary text-sm"
              >
                Batal
              </button>
              <button
                onClick={handleReset}
                disabled={resetting}
                className="btn-primary text-sm"
                style={{ background: '#D32F2F' }}
              >
                {resetting ? 'Mereset...' : 'Ya, Reset Laporan'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Laporan</h1>
          <p className="text-gray-500 text-sm mt-0.5">Ringkasan pengeluaran dan histori order</p>
          {lastReset && (
            <p className="text-xs text-gray-400 mt-1">
              Terakhir direset:{' '}
              {new Date(lastReset.reset_at).toLocaleString('id-ID', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          )}
        </div>
        <button
          onClick={() => setShowResetModal(true)}
          className="btn-secondary text-sm whitespace-nowrap"
        >
          🔄 Reset Laporan
        </button>
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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
        <div className="card p-4 border-l-4 border-green-500">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Barang Masuk</p>
          <p className="text-2xl font-bold text-green-600">{formatRupiah(totalBarangMasuk)}</p>
          <p className="text-xs text-gray-400 mt-1">{barangMasukData.length} item tercatat</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit mb-4">
        {[
          { id: 'daily', label: '📅 Pengeluaran Harian' },
          { id: 'supplier', label: '🏭 Per Supplier' },
          { id: 'barang-masuk', label: '📦 Barang Masuk' },
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
      ) : activeTab === 'supplier' ? (
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
      ) : (
        <div className="space-y-3">
          {Object.keys(barangMasukByDate).length === 0 ? (
            <div className="card p-10 text-center text-gray-400">
              <p className="text-4xl mb-3">📦</p>
              <p>Tidak ada barang masuk dalam rentang tanggal ini</p>
            </div>
          ) : (
            Object.entries(barangMasukByDate).map(([date, items]) => {
              const dateTotal = items.reduce(
                (sum, i) => sum + Number(i.qty || 0) * Number(i.price_per_unit || 0),
                0
              );
              return (
                <div key={date} className="card overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-800">{formatDateID(date)}</span>
                      <span className="text-xs text-gray-400">{items[0]?.outlet?.name}</span>
                    </div>
                    <div className="text-sm text-gray-500">
                      {items.length} item &bull;{' '}
                      <span className="font-semibold text-green-600">{formatRupiah(dateTotal)}</span>
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-gray-50">
                      {items.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-800">
                            {item.material?.name}
                            {item.variant?.brand && (
                              <span className="ml-1 text-xs text-gray-400">({item.variant.brand})</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center text-brand-red font-medium">
                            {item.qty} {item.unit}
                          </td>
                          <td className="px-4 py-3 text-center text-gray-500 text-xs">
                            {formatRupiah(item.price_per_unit)}/sat
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-800">
                            {formatRupiah(Number(item.qty) * Number(item.price_per_unit || 0))}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-400 text-xs">
                            {item.supplier?.name || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })
          )}
          {Object.keys(barangMasukByDate).length > 0 && (
            <div className="card p-4 bg-green-50 border border-green-200 flex justify-between items-center">
              <span className="font-semibold text-gray-700">Total Barang Masuk</span>
              <span className="text-xl font-bold text-green-600">{formatRupiah(totalBarangMasuk)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
