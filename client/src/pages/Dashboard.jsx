import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { formatRupiah, formatDateID } from '../lib/api';

const statusLabel = { draft: 'Draft', sent: 'Terkirim', completed: 'Selesai' };
const statusClass = { draft: 'badge-draft', sent: 'badge-sent', completed: 'badge-completed' };

function StatCard({ icon, label, value, sub, color }) {
  return (
    <div className="card p-4 min-h-[104px] flex items-center gap-4">
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center text-sm font-bold ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-gray-500 text-xs font-medium uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    Promise.all([
      api.get('/api/reports/stats'),
      api.get('/api/orders/sessions?limit=10'),
    ]).then(([statsRes, sessionsRes]) => {
      setStats(statsRes.data);
      setSessions(sessionsRes.data?.data || []);
    }).catch(console.error).finally(() => setLoading(false));
  }

  async function handleDeleteDraft(session) {
    setDeletingId(session.id);
    try {
      await api.delete(`/api/orders/session/${session.id}`);
      setSessions((prev) => prev.filter((s) => s.id !== session.id));
      setConfirmDelete(null);
    } catch (err) {
      alert(err.response?.data?.error || 'Gagal menghapus draft');
    } finally {
      setDeletingId(null);
    }
  }

  const handleNewOrder = async () => {
    const today = new Date().toISOString().split('T')[0];
    try {
      const res = await api.post('/api/orders/session', { order_date: today });
      navigate(`/order?sessionId=${res.data.id}`);
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Memuat dashboard...</p>
        </div>
      </div>
    );
  }

  // Konfirmasi hapus draft modal
  if (confirmDelete) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Hapus Draft?</h3>
          <p className="text-sm text-gray-500 mb-6">
            Anda yakin ingin menghapus draft order tanggal{' '}
            <strong>{formatDateID(confirmDelete.order_date)}</strong>? Tindakan ini tidak dapat dibatalkan.
          </p>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setConfirmDelete(null)} className="btn-outline text-sm">
              Batal
            </button>
            <button
              onClick={() => handleDeleteDraft(confirmDelete)}
              disabled={deletingId === confirmDelete.id}
              className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {deletingId === confirmDelete.id ? 'Menghapus...' : 'Ya, Hapus'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const grandTotal = sessions.reduce((sum, s) => {
    return sum + (s.purchase_orders || []).reduce((a, po) => a + Number(po.total_estimated || 0), 0);
  }, 0);

  return (
    <div className="page-shell">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="page-actions">
          <button onClick={() => navigate('/reports')} className="btn-outline text-sm">
            Lihat Laporan
          </button>
          <button onClick={handleNewOrder} className="btn-primary text-sm">
            + Order Baru
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stat-grid mb-8">
        <StatCard
          icon="OH"
          label="Order Hari Ini"
          value={stats?.today_sessions ?? 0}
          color="bg-red-50"
        />
        <StatCard
          icon="SA"
          label="Supplier Aktif"
          value={stats?.active_suppliers ?? 0}
          color="bg-orange-50"
        />
        <StatCard
          icon="PP"
          label="PO Pending"
          value={stats?.pending_pos ?? 0}
          sub="Belum diterima"
          color="bg-yellow-50"
        />
        <StatCard
          icon="PB"
          label="Pengeluaran Bulan Ini"
          value={formatRupiah(stats?.monthly_spending ?? 0)}
          sub="Sudah dikonfirmasi"
          color="bg-green-50"
        />
      </div>

      {/* Recent Sessions */}
      <div className="card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Sesi Order Terbaru</h2>
          <button onClick={handleNewOrder} className="text-brand-red text-sm font-medium hover:underline">
            + Order Baru
          </button>
        </div>
        <div className="overflow-x-auto">
          {sessions.length === 0 ? (
            <div className="p-10 text-center text-gray-400">
              <p className="font-medium">Belum ada sesi order</p>
              <p className="text-sm mt-1">Klik "Order Baru" untuk memulai</p>
            </div>
          ) : (
            <table className="data-table table-fixed" style={{ minWidth: '720px' }}>
              <colgroup>
                <col style={{ width: '30%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '25%' }} />
                <col style={{ width: '25%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Status</th>
                  <th className="num-cell">Total Est.</th>
                  <th className="center-cell">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => {
                  const total = (session.purchase_orders || []).reduce(
                    (sum, po) => sum + Number(po.total_estimated || 0), 0
                  );
                  return (
                    <tr key={session.id}>
                      <td className="font-medium text-gray-800">
                        {formatDateID(session.order_date)}
                      </td>
                      <td>
                        <span className={statusClass[session.status] || 'badge-draft'}>
                          {statusLabel[session.status] || session.status}
                        </span>
                      </td>
                      <td className="num-cell font-medium text-gray-800">
                        {total > 0 ? formatRupiah(total) : <span className="text-gray-400">-</span>}
                      </td>
                      <td className="center-cell">
                        {session.status === 'draft' ? (
                          <div className="flex items-center justify-center gap-3">
                            <button
                              onClick={() => navigate(`/order?sessionId=${session.id}`)}
                              className="text-brand-orange text-xs font-medium hover:underline"
                            >
                              Lanjutkan
                            </button>
                            <button
                              onClick={() => setConfirmDelete(session)}
                              className="text-red-500 text-xs font-medium hover:underline"
                            >
                              Hapus
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => navigate(`/order/${session.id}/review`)}
                            className="text-brand-red text-xs font-medium hover:underline"
                          >
                            Detail
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
