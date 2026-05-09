import { useEffect, useState } from 'react';
import api, { formatRupiah, formatDateID } from '../lib/api';

function buildInitialItems(poItems) {
  return (poItems || []).map((item) => ({
    ...item,
    qty_received: item.qty_received ?? item.qty_ordered,
    price_actual: item.price_actual ?? item.variant?.price_per_purchase_unit ?? item.material?.price_per_purchase_unit ?? 0,
    variant_id: item.variant_id ?? null,
  }));
}

function ReceiveModal({ po, onClose, onSaved }) {
  const [items, setItems] = useState(() => buildInitialItems(po.items));
  const [notes, setNotes] = useState(po.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [variantsMap, setVariantsMap] = useState({}); // material_id -> variant[]

  // Ambil varian untuk setiap bahan dalam PO ini
  useEffect(() => {
    const materialIds = [...new Set((po.items || []).map((i) => i.material_id).filter(Boolean))];
    if (materialIds.length === 0) return;
    Promise.all(
      materialIds.map((mid) =>
        api.get(`/api/materials/${mid}/variants`).then((r) => ({ mid, variants: r.data || [] }))
      )
    ).then((results) => {
      const map = {};
      results.forEach(({ mid, variants }) => {
        map[mid] = variants.filter((v) => v.is_active);
      });
      setVariantsMap(map);
    }).catch(console.error);
  }, [po.id]);

  const updateItem = (idx, field, value) => {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const handleSelectVariant = (idx, variantId) => {
    const item = items[idx];
    const variants = variantsMap[item.material_id] || [];
    const chosen = variants.find((v) => v.id === variantId);
    setItems((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        variant_id: variantId || null,
        price_actual: chosen
          ? chosen.price_per_purchase_unit
          : item.material?.price_per_purchase_unit ?? 0,
      };
      return next;
    });
  };

  const handleResetForm = () => {
    setItems(buildInitialItems(po.items));
    setNotes('');
    setError('');
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
          variant_id: item.variant_id || null,
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
                <th className="px-3 py-2 text-left text-gray-600 font-medium">Merk</th>
                <th className="px-3 py-2 text-center text-gray-600 font-medium">Dipesan</th>
                <th className="px-3 py-2 text-center text-gray-600 font-medium">Diterima</th>
                <th className="px-3 py-2 text-center text-gray-600 font-medium">Harga/Sat (Rp)</th>
                <th className="px-3 py-2 text-right text-gray-600 font-medium">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((item, idx) => {
                const hasGap = Number(item.qty_received ?? item.qty_ordered) < Number(item.qty_ordered);
                const variants = variantsMap[item.material_id] || [];
                return (
                  <tr key={item.id} className={hasGap ? 'bg-orange-50' : 'hover:bg-gray-50'}>
                    <td className="px-3 py-2.5 font-medium text-gray-800">
                      {item.material?.name}
                      <span className="text-xs text-gray-400 ml-1">{item.material?.purchase_unit}</span>
                      {hasGap && <span className="ml-2 text-xs text-orange-600 font-semibold">Selisih</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      {variants.length > 0 ? (
                        <select
                          value={item.variant_id || ''}
                          onChange={(e) => handleSelectVariant(idx, e.target.value)}
                          className="border border-gray-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-red w-36"
                        >
                          <option value="">— Default —</option>
                          {variants.map((v) => (
                            <option key={v.id} value={v.id}>{v.brand}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-gray-400">{item.material?.brand || '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center text-gray-500">{item.qty_ordered}</td>
                    <td className="px-3 py-2.5">
                      <input
                        type="number"
                        min="0"
                        value={item.qty_received}
                        onChange={(e) => updateItem(idx, 'qty_received', e.target.value)}
                        className={`w-20 text-center border rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-red ${
                          hasGap ? 'border-orange-400 bg-orange-50' : 'border-gray-300'
                        }`}
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
                );
              })}
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
          <div className="flex gap-2">
            <button
              onClick={handleResetForm}
              title="Reset form ke nilai awal (qty = dipesan, harga = database)"
              className="px-3 py-2 rounded-lg text-sm font-medium text-gray-600 border border-gray-300 hover:bg-gray-50"
            >
              Reset Form
            </button>
            <button onClick={onClose} className="btn-outline text-sm">Batal</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
              {saving ? 'Menyimpan...' : 'Simpan Penerimaan'}
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
  const [confirmReset, setConfirmReset] = useState(null);
  const [resetting, setResetting] = useState(false);

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

  const handleResetPO = async (po) => {
    setResetting(true);
    try {
      if (po.status === 'pending' || po.status === 'confirmed') {
        // Pending PO: hapus saja dari sistem
        await api.delete(`/api/purchase/${po.id}`);
      } else {
        // Received PO: reset kembali ke pending
        await api.put(`/api/purchase/${po.id}/reset`);
      }
      setConfirmReset(null);
      loadPOs();
    } catch (err) {
      alert(err.response?.data?.error || 'Gagal mereset PO');
    } finally {
      setResetting(false);
    }
  };

  const statusLabel = {
    pending: 'Pending',
    confirmed: 'Dikonfirmasi',
    received: 'Diterima',
    received_partial: 'Diterima Sebagian',
  };
  const statusClass = {
    pending: 'badge-pending',
    confirmed: 'badge-sent',
    received: 'badge-received',
    received_partial: 'badge-pending',
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {selectedPO && (
        <ReceiveModal
          po={selectedPO}
          onClose={() => setSelectedPO(null)}
          onSaved={loadPOs}
        />
      )}

      {/* Modal konfirmasi reset PO */}
      {confirmReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            {confirmReset.status === 'pending' || confirmReset.status === 'confirmed' ? (
              <>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Hapus PO ini?</h3>
                <p className="text-sm text-gray-500 mb-1">
                  PO <strong>{confirmReset.supplier?.name}</strong> (
                  {formatDateID(confirmReset.session?.order_date)}) akan dihapus dari daftar.
                </p>
                <p className="text-sm text-red-600 mb-6">
                  Tindakan ini tidak dapat dibatalkan.
                </p>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Reset Data Penerimaan?</h3>
                <p className="text-sm text-gray-500 mb-1">
                  PO <strong>{confirmReset.supplier?.name}</strong> akan dikembalikan ke status{' '}
                  <strong>Pending</strong>.
                </p>
                <p className="text-sm text-orange-600 mb-6">
                  Semua data qty diterima dan harga aktual akan dihapus dan harus diisi ulang.
                </p>
              </>
            )}
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmReset(null)} className="btn-outline text-sm">
                Batal
              </button>
              <button
                onClick={() => handleResetPO(confirmReset)}
                disabled={resetting}
                className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50"
              >
                {resetting ? 'Memproses...' : 'Ya, Lanjutkan'}
              </button>
            </div>
          </div>
        </div>
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
          <option value="received_partial">Diterima Sebagian</option>
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
              <div className="flex items-center gap-4 flex-wrap">
                <div className="text-center">
                  <p className="text-xs text-gray-500">Est. Total</p>
                  <p className="font-semibold text-gray-800">{formatRupiah(po.total_estimated)}</p>
                </div>
                {po.total_actual ? (
                  <div className="text-center">
                    <p className="text-xs text-gray-500">Aktual</p>
                    <p className="font-semibold text-brand-red">{formatRupiah(po.total_actual)}</p>
                  </div>
                ) : null}
                <span className={statusClass[po.status] || 'badge-pending'}>
                  {statusLabel[po.status] || po.status}
                </span>
                {po.status === 'pending' || po.status === 'confirmed' ? (
                  <div className="flex gap-2">
                    <button onClick={() => openModal(po)} className="btn-primary text-sm">
                      Catat Penerimaan
                    </button>
                    <button
                      onClick={() => setConfirmReset(po)}
                      title="Hapus PO ini dari daftar"
                      className="px-3 py-2 rounded-lg text-sm font-medium text-red-500 border border-red-300 hover:bg-red-50"
                    >
                      Reset
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => openModal(po)} className="btn-outline text-sm">
                      Edit
                    </button>
                    <button
                      onClick={() => setConfirmReset(po)}
                      title="Reset data penerimaan ke Pending"
                      className="px-3 py-2 rounded-lg text-sm font-medium text-orange-600 border border-orange-300 hover:bg-orange-50"
                    >
                      Reset
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
