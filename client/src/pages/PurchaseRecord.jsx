import { useEffect, useState } from 'react';
import api, { formatRupiah, formatDateID } from '../lib/api';

function ReceiveModal({ po, onClose, onSaved }) {
  const [items, setItems] = useState(
    (po.items || []).map((item) => ({
      ...item,
      qty_received: item.qty_received ?? item.qty_ordered,
      price_actual: item.price_actual ?? item.material?.price_per_purchase_unit ?? 0,
    }))
  );
  const [notes, setNotes] = useState(po.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const updateItem = (idx, field, value) => {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const totalActual = items.reduce(
    (sum, item) => sum + (Number(item.qty_received || 0) * Number(item.price_actual || 0)), 0
  );

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await api.put(`/api/purchase/${po.id}/receive`, {
        items: items.map((item) => ({
          id: item.id,
          qty_received: Number(item.qty_received || 0),
          price_actual: Number(item.price_actual || 0),
        })),
        notes,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-brand-red px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-white font-semibold text-lg">Catat Penerimaan</h3>
            <p className="text-red-200 text-sm">{po.supplier?.name}</p>
          </div>
          <button onClick={onClose} className="text-white hover:text-red-200 text-2xl leading-none">×</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
          )}
          <table className="w-full text-sm mb-4">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-3 py-2 text-left text-gray-600 font-medium">Bahan</th>
                <th className="px-3 py-2 text-center text-gray-600 font-medium">Dipesan</th>
                <th className="px-3 py-2 text-center text-gray-600 font-medium">Diterima</th>
                <th className="px-3 py-2 text-center text-gray-600 font-medium">Harga/Sat (Rp)</th>
                <th className="px-3 py-2 text-right text-gray-600 font-medium">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((item, idx) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2.5 font-medium text-gray-800">
                    {item.material?.name}
                    <span className="text-xs text-gray-400 ml-1">{item.material?.purchase_unit}</span>
                  </td>
                  <td className="px-3 py-2.5 text-center text-gray-500">{item.qty_ordered}</td>
                  <td className="px-3 py-2.5">
                    <input
                      type="number"
                      min="0"
                      value={item.qty_received}
                      onChange={(e) => updateItem(idx, 'qty_received', e.target.value)}
                      className="w-20 text-center border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-red"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <input
                      type="number"
                      min="0"
                      value={item.price_actual}
                      onChange={(e) => updateItem(idx, 'price_actual', e.target.value)}
                      className="w-28 text-right border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-red"
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium text-gray-800">
                    {formatRupiah(Number(item.qty_received || 0) * Number(item.price_actual || 0))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-orange-50 border-t border-orange-100">
                <td colSpan={4} className="px-3 py-2.5 text-right font-semibold text-gray-700">
                  Total Aktual:
                </td>
                <td className="px-3 py-2.5 text-right font-bold text-brand-red text-base">
                  {formatRupiah(totalActual)}
                </td>
              </tr>
            </tfoot>
          </table>

          <div>
            <label className="label">Catatan (opsional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="input resize-none"
              placeholder="Catatan penerimaan barang..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-between flex-shrink-0">
          <p className="text-sm text-gray-500">
            Est: <span className="font-medium">{formatRupiah(po.total_estimated)}</span>
            {' → '}Aktual: <span className="font-bold text-brand-red">{formatRupiah(totalActual)}</span>
          </p>
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-outline text-sm">Batal</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
              {saving ? 'Menyimpan...' : '✅ Simpan Penerimaan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PurchaseRecord() {
  const [pos, setPos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPO, setSelectedPO] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    loadPOs();
  }, [statusFilter]);

  async function loadPOs() {
    setLoading(true);
    try {
      const params = statusFilter ? `?status=${statusFilter}` : '';
      const res = await api.get(`/api/purchase${params}`);
      setPos(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const openModal = async (po) => {
    try {
      const res = await api.get(`/api/purchase/${po.id}`);
      setSelectedPO(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const statusLabel = { pending: 'Pending', confirmed: 'Dikonfirmasi', received: 'Diterima' };
  const statusClass = { pending: 'badge-pending', confirmed: 'badge-sent', received: 'badge-received' };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {selectedPO && (
        <ReceiveModal
          po={selectedPO}
          onClose={() => setSelectedPO(null)}
          onSaved={loadPOs}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Catat Penerimaan</h1>
          <p className="text-gray-500 text-sm mt-0.5">Catat barang yang sudah diterima dari supplier</p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input w-auto text-sm"
        >
          <option value="">Semua Status</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Dikonfirmasi</option>
          <option value="received">Diterima</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
        </div>
      ) : pos.length === 0 ? (
        <div className="card p-10 text-center text-gray-400">
          <p className="text-4xl mb-3">📦</p>
          <p className="font-medium">Tidak ada Purchase Order</p>
          <p className="text-sm mt-1">PO akan muncul setelah order dikirim via email</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pos.map((po) => (
            <div key={po.id} className="card p-4 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center text-xl">
                  🏭
                </div>
                <div>
                  <p className="font-semibold text-gray-800">{po.supplier?.name}</p>
                  <p className="text-sm text-gray-500">
                    Order: {formatDateID(po.session?.order_date)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-6 flex-wrap">
                <div className="text-center">
                  <p className="text-xs text-gray-500">Est. Total</p>
                  <p className="font-semibold text-gray-800">{formatRupiah(po.total_estimated)}</p>
                </div>
                {po.total_actual && (
                  <div className="text-center">
                    <p className="text-xs text-gray-500">Aktual</p>
                    <p className="font-semibold text-brand-red">{formatRupiah(po.total_actual)}</p>
                  </div>
                )}
                <span className={statusClass[po.status] || 'badge-pending'}>
                  {statusLabel[po.status] || po.status}
                </span>
                {po.status !== 'received' ? (
                  <button
                    onClick={() => openModal(po)}
                    className="btn-primary text-sm"
                  >
                    📥 Catat Penerimaan
                  </button>
                ) : (
                  <button
                    onClick={() => openModal(po)}
                    className="btn-outline text-sm"
                  >
                    ✏️ Edit
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
