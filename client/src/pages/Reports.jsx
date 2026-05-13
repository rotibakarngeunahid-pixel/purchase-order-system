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
    <div className="page-shell">
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

      <div className="page-header">
        <div>
          <h1 className="page-title">Laporan</h1>
          <p className="page-subtitle">Ringkasan pengeluaran dan histori order</p>
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
          Reset Laporan
        </button>
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
          <label className="filter-label">Supplier</label>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="input"
          >
            <option value="">Semua Supplier</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <button onClick={loadReports} disabled={loading} className="btn-primary text-sm h-10">
          {loading ? 'Memuat...' : 'Terapkan Filter'}
        </button>
      </div>

      {/* Summary cards */}
      <div className="stat-grid">
        <div className="stat-card">
          <p className="stat-label">Total PO</p>
          <p className="stat-value">{dailyData.length}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Total Estimasi</p>
          <p className="stat-value">{formatRupiah(totalEstimated)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Total Aktual Diterima</p>
          <p className="stat-value text-brand-red">{formatRupiah(totalActual)}</p>
        </div>
        <div className="stat-card border-l-4 border-green-500">
          <p className="stat-label">Total Barang Masuk</p>
          <p className="stat-value text-green-600">{formatRupiah(totalBarangMasuk)}</p>
          <p className="text-xs text-gray-400 mt-1">{barangMasukData.length} item tercatat</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="segmented-tabs">
        {[
          { id: 'daily', label: 'Pengeluaran Harian' },
          { id: 'supplier', label: 'Per Supplier' },
          { id: 'barang-masuk', label: 'Barang Masuk' },
        ].map((tab) => (
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
      ) : activeTab === 'daily' ? (
        <div className="card overflow-hidden">
          {dailyData.length === 0 ? (
            <div className="p-10 text-center text-gray-400">
              <p>Tidak ada data dalam rentang tanggal ini</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table table-fixed" style={{ minWidth: '760px' }}>
                <colgroup>
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '24%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '16%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Tanggal Order</th>
                    <th>Supplier</th>
                    <th className="center-cell">Jml Item</th>
                    <th className="center-cell">Status</th>
                    <th className="num-cell">Est. Total</th>
                    <th className="num-cell">Aktual</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyData.map((po) => (
                    <tr key={po.id}>
                      <td className="font-medium text-gray-800">
                        {formatDateID(po.session?.order_date)}
                      </td>
                      <td className="text-gray-700 truncate">{po.supplier?.name}</td>
                      <td className="center-cell text-gray-600">{po.items?.length || 0}</td>
                      <td className="center-cell">
                        <span className={statusClass[po.status] || 'badge-pending'}>
                          {statusLabel[po.status] || po.status}
                        </span>
                      </td>
                      <td className="num-cell text-gray-700">{formatRupiah(po.total_estimated)}</td>
                      <td className="num-cell font-medium text-brand-red">
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
                    <td className="num-cell font-bold text-gray-800">
                      {formatRupiah(totalEstimated)}
                    </td>
                    <td className="num-cell font-bold text-brand-red">
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
              <p>Tidak ada data supplier</p>
            </div>
          ) : (
            <div className="table-wrap">
            <table className="data-table table-fixed" style={{ minWidth: '760px' }}>
              <colgroup>
                <col style={{ width: '28%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '18%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th className="center-cell">Jml Order</th>
                  <th className="num-cell">Total Estimasi</th>
                  <th className="num-cell">Total Aktual</th>
                  <th className="num-cell">Rata-rata/Order</th>
                </tr>
              </thead>
              <tbody>
                {supplierSummary
                  .filter((s) => s.total_orders > 0)
                  .map((s) => (
                    <tr key={s.supplier.id}>
                      <td className="font-medium text-gray-800 truncate">{s.supplier.name}</td>
                      <td className="center-cell text-gray-600">{s.total_orders}</td>
                      <td className="num-cell text-gray-700">{formatRupiah(s.total_estimated)}</td>
                      <td className="num-cell font-medium text-brand-red">
                        {s.total_actual > 0 ? formatRupiah(s.total_actual) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="num-cell text-gray-600">{formatRupiah(s.avg_order_value)}</td>
                    </tr>
                  ))}
              </tbody>
              <tfoot>
                <tr className="bg-orange-50 border-t-2 border-orange-200">
                  <td className="px-4 py-3 font-semibold text-gray-700">Total</td>
                  <td className="center-cell font-bold text-gray-800">
                    {supplierSummary.reduce((s, r) => s + r.total_orders, 0)}
                  </td>
                  <td className="num-cell font-bold text-gray-800">
                    {formatRupiah(supplierSummary.reduce((s, r) => s + r.total_estimated, 0))}
                  </td>
                  <td className="num-cell font-bold text-brand-red">
                    {formatRupiah(supplierSummary.reduce((s, r) => s + r.total_actual, 0))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {Object.keys(barangMasukByDate).length === 0 ? (
            <div className="card p-10 text-center text-gray-400">
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
                  <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <span className="font-semibold text-gray-900">{formatDateID(date)}</span>
                      <span className="ml-2 text-xs text-gray-400">{items[0]?.outlet?.name}</span>
                    </div>
                    <div className="text-sm text-gray-500 tabular-nums">
                      {items.length} item &bull;{' '}
                      <span className="font-semibold text-green-600">{formatRupiah(dateTotal)}</span>
                    </div>
                  </div>
                  <div className="table-wrap">
                  <table className="data-table table-fixed" style={{ minWidth: '760px' }}>
                    <colgroup>
                      <col style={{ width: '36%' }} />
                      <col style={{ width: '14%' }} />
                      <col style={{ width: '18%' }} />
                      <col style={{ width: '18%' }} />
                      <col style={{ width: '14%' }} />
                    </colgroup>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id}>
                          <td className="font-medium text-gray-800">
                            {item.material?.name}
                            {item.variant?.brand && (
                              <span className="ml-1 text-xs text-gray-400">({item.variant.brand})</span>
                            )}
                          </td>
                          <td className="center-cell text-brand-red font-medium tabular-nums">
                            {item.qty} {item.unit}
                          </td>
                          <td className="num-cell text-gray-500 text-xs">
                            {formatRupiah(item.price_per_unit)}/sat
                          </td>
                          <td className="num-cell font-semibold text-gray-800">
                            {formatRupiah(Number(item.qty) * Number(item.price_per_unit || 0))}
                          </td>
                          <td className="text-right text-gray-400 text-xs truncate">
                            {item.supplier?.name || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              );
            })
          )}
          {Object.keys(barangMasukByDate).length > 0 && (
            <div className="card p-4 bg-green-50 border border-green-200 flex justify-between items-center gap-3 flex-wrap">
              <span className="font-semibold text-gray-700">Total Barang Masuk</span>
              <span className="text-xl font-bold text-green-600">{formatRupiah(totalBarangMasuk)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
