import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { formatRupiah, formatDateID } from '../lib/api';

function POCard({ po }) {
  return (
    <div className="card overflow-hidden mb-4">
      <div className="bg-brand-red px-5 py-3 flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold text-base">{po.supplier.name}</h3>
          <p className="text-red-200 text-xs mt-0.5">WA: {po.supplier.wa_number}</p>
        </div>
        <div className="text-right">
          <p className="text-red-200 text-xs">Est. Total</p>
          <p className="text-white font-bold text-lg">{formatRupiah(po.total_estimated)}</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-4 py-2.5 text-left font-medium text-gray-600">Bahan</th>
              <th className="px-4 py-2.5 text-center font-medium text-gray-600">Qty</th>
              <th className="px-4 py-2.5 text-center font-medium text-gray-600">Satuan</th>
              <th className="px-4 py-2.5 text-center font-medium text-gray-600">Kemasan</th>
              <th className="px-4 py-2.5 text-right font-medium text-gray-600">Harga/Sat</th>
              <th className="px-4 py-2.5 text-right font-medium text-gray-600">Subtotal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {po.items.map((item, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <div className="font-medium text-gray-800">{item.material_name}</div>
                  {item.roti_tawar_bonus && (
                    <div className="mt-1 text-xs bg-orange-50 border border-orange-200 rounded px-2 py-1 inline-flex items-center gap-2 text-orange-700">
                      <span>Dibutuhkan: <strong>{item.roti_tawar_bonus.total_needed}</strong></span>
                      <span className="text-orange-300">|</span>
                      <span>Order ke supplier: <strong>{item.qty_ordered}</strong></span>
                      <span className="text-orange-300">|</span>
                      <span>Bonus: <strong>+{item.roti_tawar_bonus.bonus}</strong></span>
                      <span className="text-orange-300">|</span>
                      <span>Total diterima: <strong>{item.roti_tawar_bonus.fulfilled}</strong></span>
                    </div>
                  )}
                </td>
                <td className="px-4 py-2.5 text-center font-semibold text-brand-red">{item.qty_ordered}</td>
                <td className="px-4 py-2.5 text-center text-gray-600">{item.purchase_unit}</td>
                <td className="px-4 py-2.5 text-center text-gray-500 text-xs">
                  {item.package_qty > 1 ? `${item.package_qty} ${item.package_unit}` : '—'}
                </td>
                <td className="px-4 py-2.5 text-right text-gray-600">{formatRupiah(item.price_per_purchase_unit)}</td>
                <td className="px-4 py-2.5 text-right font-medium text-gray-800">{formatRupiah(item.subtotal_estimated)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-orange-50 border-t border-orange-100">
              <td colSpan={5} className="px-4 py-2.5 text-right font-semibold text-gray-700">
                Total Estimasi:
              </td>
              <td className="px-4 py-2.5 text-right font-bold text-brand-red text-base">
                {formatRupiah(po.total_estimated)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export default function OrderReview() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [pos, setPos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    loadData();
  }, [sessionId]);

  async function loadData() {
    setLoading(true);
    try {
      const [sessionRes, calcRes] = await Promise.all([
        api.get(`/api/orders/session/${sessionId}`),
        api.post(`/api/orders/session/${sessionId}/calculate`),
      ]);
      setSession(sessionRes.data);
      setPos(calcRes.data.pos || []);
    } catch (err) {
      console.error(err);
      showToast('Gagal memuat data: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setLoading(false);
    }
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 5000);
  }

  const handleSendWA = async () => {
    if (session?.status !== 'draft') {
      showToast('Sesi ini sudah dikirim sebelumnya.', 'error');
      return;
    }
    setSending(true);
    try {
      const res = await api.post(`/api/orders/session/${sessionId}/send-wa`);
      if (res.status === 207) {
        showToast('PO dibuat, tapi email gagal: ' + res.data.warning, 'error');
      } else {
        showToast(res.data.message || 'Email berhasil dikirim! Cek inbox untuk WA links.');
        setSession((prev) => ({ ...prev, status: 'sent' }));
      }
    } catch (err) {
      showToast('Gagal mengirim: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setSending(false);
    }
  };

  const grandTotal = pos.reduce((sum, po) => sum + (po.total_estimated || 0), 0);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Menghitung order...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm max-w-sm ${
          toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(`/order?sessionId=${sessionId}`)} className="text-gray-400 hover:text-gray-600">
          ← Kembali
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Review Order</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {session && formatDateID(session.order_date)}
            {session?.status && session.status !== 'draft' && (
              <span className="ml-2 badge-sent">Sudah Dikirim</span>
            )}
          </p>
        </div>
      </div>

      {pos.length === 0 ? (
        <div className="card p-10 text-center text-gray-400">
          <p className="text-4xl mb-3">📭</p>
          <p className="font-medium">Tidak ada item untuk dipesan</p>
          <p className="text-sm mt-1">Kembali ke input order dan isi qty untuk bahan yang dibutuhkan</p>
          <button onClick={() => navigate(`/order?sessionId=${sessionId}`)} className="btn-primary text-sm mt-4">
            ← Kembali ke Input
          </button>
        </div>
      ) : (
        <>
          {/* Summary bar */}
          <div className="card p-4 mb-5 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-xs text-gray-500">Jumlah Supplier</p>
                <p className="font-bold text-xl text-gray-800">{pos.length}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Grand Total Estimasi</p>
                <p className="font-bold text-xl text-brand-red">{formatRupiah(grandTotal)}</p>
              </div>
            </div>
            {session?.status === 'draft' ? (
              <button
                onClick={handleSendWA}
                disabled={sending}
                className="btn-primary"
              >
                {sending ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Mengirim Email...
                  </span>
                ) : (
                  '📧 Kirim ke Email Saya'
                )}
              </button>
            ) : (
              <div className="flex items-center gap-2 text-green-600 font-medium text-sm">
                ✅ Email sudah dikirim
                <button onClick={() => navigate('/purchase')} className="btn-outline text-xs ml-2">
                  Catat Penerimaan →
                </button>
              </div>
            )}
          </div>

          {/* PO Cards per supplier */}
          {pos.map((po, i) => (
            <POCard key={i} po={po} />
          ))}

          {/* Grand total footer */}
          <div className="card p-4 mt-2 flex items-center justify-between bg-red-50">
            <span className="font-semibold text-gray-700">Grand Total Semua Supplier</span>
            <span className="font-bold text-xl text-brand-red">{formatRupiah(grandTotal)}</span>
          </div>
        </>
      )}
    </div>
  );
}
