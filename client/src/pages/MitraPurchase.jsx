import { useEffect, useMemo, useState } from 'react';
import { LogOut, Plus, Trash2 } from 'lucide-react';
import api, { formatRupiah, formatDateID, toInputDate } from '../lib/api';
import Toast from '../components/ui/Toast';
import useToast from '../components/ui/useToast';
import useModalDismiss from '../components/ui/useModalDismiss';

let _rowCounter = 0;
function newRow() {
  return { _id: ++_rowCounter, material_id: '', brand: '', unit: '', qty: '', unit_price: '', notes: '' };
}

function DetailModal({ purchase, onClose }) {
  useModalDismiss(onClose);
  if (!purchase) return null;
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Detail Pembelian</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-gray-400 text-xs">Tanggal</p><p className="font-medium">{formatDateID(purchase.purchase_date)}</p></div>
            <div><p className="text-gray-400 text-xs">No. Invoice</p><p className="font-medium">{purchase.invoice_number || '—'}</p></div>
            <div><p className="text-gray-400 text-xs">Supplier/Toko</p><p className="font-medium">{purchase.supplier_name || '—'}</p></div>
            <div><p className="text-gray-400 text-xs">Status</p><p className="font-medium capitalize">{purchase.status === 'cancelled' ? 'Dibatalkan' : 'Tercatat'}</p></div>
          </div>
          {purchase.notes && <div><p className="text-gray-400 text-xs">Catatan</p><p>{purchase.notes}</p></div>}
          <div>
            <p className="text-gray-400 text-xs mb-1">Item</p>
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead><tr className="bg-gray-50">
                  <th className="px-2 py-2 text-left">Bahan</th>
                  <th className="px-2 py-2 text-left">Merk</th>
                  <th className="px-2 py-2 text-right">Qty</th>
                  <th className="px-2 py-2 text-right">Harga</th>
                  <th className="px-2 py-2 text-right">Total</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {(purchase.items || []).map((it) => (
                    <tr key={it.id}>
                      <td className="px-2 py-2">{it.materials?.name || it.material_id}</td>
                      <td className="px-2 py-2">{it.brand || '—'}</td>
                      <td className="px-2 py-2 text-right">{it.qty} {it.unit}</td>
                      <td className="px-2 py-2 text-right">{formatRupiah(it.unit_price)}</td>
                      <td className="px-2 py-2 text-right">{formatRupiah(it.total_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-gray-100">
            <span className="font-semibold text-gray-700">Grand Total</span>
            <span className="font-bold text-brand-red text-base">{formatRupiah(purchase.grand_total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MitraPurchase({ onLogout }) {
  const mitra = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('rbn_mitra') || '{}'); } catch { return {}; }
  }, []);

  const [materials, setMaterials] = useState([]);
  const [purchaseDate, setPurchaseDate] = useState(toInputDate());
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState([newRow()]);
  const [submitting, setSubmitting] = useState(false);

  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [stockStatus, setStockStatus] = useState([]);
  const [detailItem, setDetailItem] = useState(null);

  const { toast, showToast, hideToast } = useToast();

  useEffect(() => {
    api.get('/api/mitra-purchases/materials').then((res) => setMaterials(res.data || [])).catch(() => {});
    loadHistory();
    api.get('/api/mitra-purchases/stock-status').then((res) => setStockStatus(res.data || [])).catch(() => {});
  }, []);

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const res = await api.get('/api/mitra-purchases');
      setHistory(res.data || []);
    } catch {
      showToast('Gagal memuat riwayat pembelian', 'error');
    } finally {
      setLoadingHistory(false);
    }
  }

  function updateRow(idx, patch) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function onSelectMaterial(idx, materialId) {
    const mat = materials.find((m) => m.id === materialId) || null;
    updateRow(idx, { material_id: materialId, unit: mat?.purchase_unit || '' });
  }

  function addRow() {
    setRows((prev) => [...prev, newRow()]);
  }

  function removeRow(idx) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));
  }

  const rowTotal = (r) => (Number(r.qty) || 0) * (Number(r.unit_price) || 0);
  const grandTotal = useMemo(() => rows.reduce((sum, r) => sum + rowTotal(r), 0), [rows]);

  function validate() {
    if (!purchaseDate) return 'Tanggal pembelian wajib diisi';
    if (rows.length === 0) return 'Minimal satu item wajib diisi';
    for (const r of rows) {
      if (!r.material_id) return 'Setiap item wajib memilih bahan baku';
      if (!r.unit) return 'Setiap item wajib mengisi satuan';
      if (!(Number(r.qty) > 0)) return 'Kuantitas setiap item harus lebih dari 0';
      if (Number(r.unit_price) < 0 || Number.isNaN(Number(r.unit_price))) return 'Harga satuan tidak boleh negatif';
    }
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const err = validate();
    if (err) { showToast(err, 'error'); return; }

    setSubmitting(true);
    try {
      await api.post('/api/mitra-purchases', {
        purchase_date: purchaseDate,
        invoice_number: invoiceNumber || null,
        supplier_name: supplierName || null,
        notes: notes || null,
        items: rows.map((r) => ({
          material_id: r.material_id,
          brand: r.brand || null,
          unit: r.unit,
          qty: Number(r.qty),
          unit_price: Number(r.unit_price) || 0,
          notes: r.notes || null,
        })),
      });
      showToast('Pembelian berhasil disimpan & stok cabang sudah diperbarui.');
      setInvoiceNumber('');
      setSupplierName('');
      setNotes('');
      setRows([newRow()]);
      loadHistory();
      api.get('/api/mitra-purchases/stock-status').then((res) => setStockStatus(res.data || [])).catch(() => {});
    } catch (err) {
      showToast('Gagal menyimpan: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function openDetail(id) {
    try {
      const res = await api.get(`/api/mitra-purchases/${id}`);
      setDetailItem(res.data);
    } catch {
      showToast('Gagal memuat detail', 'error');
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Toast toast={toast} onClose={hideToast} />
      {detailItem && <DetailModal purchase={detailItem} onClose={() => setDetailItem(null)} />}

      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="font-bold text-gray-900">Pembelian Bahan Baku</h1>
            <p className="text-xs text-gray-500">{mitra.full_name} — {mitra.outlet_name}</p>
          </div>
          <button onClick={onLogout} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand-red">
            <LogOut className="w-4 h-4" /> Keluar
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Form input */}
        <form onSubmit={handleSubmit} className="card p-5 space-y-5">
          <h2 className="font-semibold text-gray-800">Catat Pembelian Baru</h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label">Tanggal Pembelian *</label>
              <input type="date" className="input" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} required />
            </div>
            <div>
              <label className="label">No. Invoice (opsional)</label>
              <input type="text" className="input" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="INV-001" />
            </div>
            <div>
              <label className="label">Supplier / Toko</label>
              <input type="text" className="input" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="Toko Sumber Rejeki" />
            </div>
          </div>
          <div>
            <label className="label">Catatan</label>
            <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Catatan tambahan (opsional)" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Detail Item</label>
              <button type="button" onClick={addRow} className="btn-outline text-xs px-3 py-1.5 flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Tambah Item
              </button>
            </div>
            <div className="space-y-3">
              {rows.map((r, idx) => (
                <div key={r._id} className="border border-gray-200 rounded-lg p-3 space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
                    <div className="sm:col-span-3">
                      <select className="input text-sm" value={r.material_id} onChange={(e) => onSelectMaterial(idx, e.target.value)} required>
                        <option value="">— Bahan baku —</option>
                        {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <input type="text" className="input text-sm" placeholder="Merk" value={r.brand} onChange={(e) => updateRow(idx, { brand: e.target.value })} />
                    </div>
                    <div className="sm:col-span-1">
                      <input type="text" className="input text-sm" placeholder="Satuan" value={r.unit} onChange={(e) => updateRow(idx, { unit: e.target.value })} required />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-6 gap-2 items-center">
                    <div className="sm:col-span-1">
                      <input type="number" min="0" step="any" className="input text-sm" placeholder="Qty" value={r.qty} onChange={(e) => updateRow(idx, { qty: e.target.value })} required />
                    </div>
                    <div className="sm:col-span-1">
                      <input type="number" min="0" step="any" className="input text-sm" placeholder="Harga satuan" value={r.unit_price} onChange={(e) => updateRow(idx, { unit_price: e.target.value })} required />
                    </div>
                    <div className="sm:col-span-2">
                      <input type="text" className="input text-sm" placeholder="Catatan item" value={r.notes} onChange={(e) => updateRow(idx, { notes: e.target.value })} />
                    </div>
                    <div className="sm:col-span-2 flex items-center justify-between gap-2">
                      <span className="text-xs text-gray-500">Total: <span className="font-medium text-gray-700 tabular-nums">{formatRupiah(rowTotal(r))}</span></span>
                      <button type="button" onClick={() => removeRow(idx)} disabled={rows.length === 1} className="text-gray-300 hover:text-red-500 disabled:opacity-30">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-gray-100 pt-4">
            <span className="font-semibold text-gray-700">Grand Total</span>
            <span className="font-bold text-brand-red text-xl">{formatRupiah(grandTotal)}</span>
          </div>

          <button type="submit" disabled={submitting} className="w-full bg-brand-red text-white py-2.5 rounded-lg font-semibold hover:bg-red-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
            {submitting ? 'Menyimpan & menyinkronkan stok...' : 'Simpan Pembelian'}
          </button>
        </form>

        {/* Status stok cabang */}
        {stockStatus.length > 0 && (
          <div className="card p-5">
            <h2 className="font-semibold text-gray-800 mb-3">Status Stok Cabang</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-60 overflow-y-auto">
              {stockStatus.map((s) => (
                <div key={s.ingredient_id} className="bg-gray-50 rounded-lg px-3 py-2">
                  <p className="text-xs text-gray-500 truncate">{s.ingredient_name}</p>
                  <p className="font-semibold text-gray-800 tabular-nums">{Number(s.stock).toLocaleString('id-ID')} {s.unit}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Riwayat */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">Riwayat Pembelian Saya</h2>
          </div>
          {loadingHistory ? (
            <div className="py-10 text-center text-gray-400">Memuat...</div>
          ) : history.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm">Belum ada pembelian tercatat.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Tanggal</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Supplier</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Grand Total</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Status</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {history.map((h) => (
                  <tr key={h.id} className={`hover:bg-gray-50 ${h.status === 'cancelled' ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">{formatDateID(h.purchase_date)}</td>
                    <td className="px-4 py-3 text-gray-600">{h.supplier_name || '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatRupiah(h.grand_total)}</td>
                    <td className="px-4 py-3 text-center">
                      {h.status === 'cancelled' ? (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">Dibatalkan</span>
                      ) : (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">Tercatat</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => openDetail(h.id)} className="text-brand-orange text-xs font-medium hover:underline">Lihat</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
