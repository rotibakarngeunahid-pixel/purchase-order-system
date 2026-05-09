import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { formatRupiah, formatDateID } from '../lib/api';

const statusLabel = { draft: 'Draft', sent: 'Terkirim', completed: 'Selesai' };
const statusClass = { draft: 'badge-draft', sent: 'badge-sent', completed: 'badge-completed' };

function StatCard({ icon, label, value, sub, color }) {
  return (
    <div className="card p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${color}`}>
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

  useEffect(() => {
    Promise.all([
      api.get('/api/reports/stats'),
      api.get('/api/orders/sessions?limit=10'),
    ]).then(([statsRes, sessionsRes]) => {
      setStats(statsRes.data);
      setSessions(sessionsRes.data?.data || []);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

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

  const grandTotal = sessions.reduce((sum, s) => {
    return sum + (s.purchase_orders || []).reduce((a, po) => a + Number(po.total_estimated || 0), 0);
  }, 0);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate('/reports')} className="btn-outline text-sm">
            📊 Lihat Laporan
          </button>
          <button onClick={handleNewOrder} className="btn-primary text-sm">
            ➕ Order Baru
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon="📋"
          label="Order Hari Ini"
          value={stats?.today_sessions ?? 0}
          color="bg-red-50"
        />
        <StatCard
          icon="🏭"
          label="Supplier Aktif"
          value={stats?.active_suppliers ?? 0}
          color="bg-orange-50"
        />
        <StatCard
          icon="⏳"
          label="PO Pending"
          value={stats?.pending_pos ?? 0}
          sub="Belum diterima"
          color="bg-yellow-50"
        />
        <StatCard
          icon="💰"
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
              <p className="text-4xl mb-3">📋</p>
              <p className="font-medium">Belum ada sesi order</p>
              <p className="text-sm mt-1">Klik "Order Baru" untuk memulai</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-5 py-3 text-left font-medium text-gray-600">Tanggal</th>
                  <th className="px-5 py-3 text-left font-medium text-gray-600">Status</th>
                  <th className="px-5 py-3 text-right font-medium text-gray-600">Total Est.</th>
                  <th className="px-5 py-3 text-center font-medium text-gray-600">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sessions.map((session) => {
                  const total = (session.purchase_orders || []).reduce(
                    (sum, po) => sum + Number(po.total_estimated || 0), 0
                  );
                  return (
                    <tr key={session.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-gray-800">
                        {formatDateID(session.order_date)}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={statusClass[session.status] || 'badge-draft'}>
                          {statusLabel[session.status] || session.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-medium text-gray-800">
                        {total > 0 ? formatRupiah(total) : <span className="text-gray-400">-</span>}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        {session.status === 'draft' ? (
                          <button
                            onClick={() => navigate(`/order?sessionId=${session.id}`)}
                            className="text-brand-orange text-xs font-medium hover:underline"
                          >
                            Lanjutkan
                          </button>
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
