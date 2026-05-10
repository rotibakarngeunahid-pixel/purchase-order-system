import { useEffect, useState } from 'react';
import api, { formatDateID, toInputDate } from '../lib/api';

function getFirstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

const COMMON_UNITS = ['Kg', 'Pcs', 'Ltr', 'Dus', 'Bks', 'Bal', 'Btl'];

export default function PurchaseReport() {
  const [form, setForm] = useState({
    item_name: '',
    qty: '',
    unit: '',
    date: toInputDate(),
    supplier_name: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState(getFirstOfMonth());
  const [dateTo, setDateTo] = useState(toInputDate());
  const [toast, setToast] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    loadRecords();
  }, []);

  async function loadRecords() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      const res = await api.get(`/api/purchase-report?${params}`);
      setRecords(res.data);
    } catch (err) {
      showToast('Gagal memuat data: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setLoading(false);
    }
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  function setField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.item_name.trim() || !form.qty || !form.unit.trim() || !form.date) {
      showToast('Nama bahan, jumlah, satuan, dan tanggal wajib diisi.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/purchase-report', form);
      showToast('Data barang masuk berhasil dicatat!');
      setForm({ item_name: '', qty: '', unit: '', date: toInputDate(), supplier_name: '', notes: '' });
      loadRecords();
    } catch (err) {
      showToast('Gagal menyimpan: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Hapus catatan ini? Tindakan tidak dapat dibatalkan.')) return;
    setDeletingId(id);
    try {
      await api.delete(`/api/purchase-report/${id}`);
      showToast('Catatan dihapus.');
      setRecords((prev) => prev.filter((r) => r.id !== id));
    } catch {
      showToast('Gagal menghapus.', 'error');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm max-w-sm ${
            toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'
          }`}
        >
          {toast.msg}
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Laporan Barang Masuk</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Catat penerimaan bahan baku dari supplier secara manual
        </p>
      </div>

      {/* Form input */}
      <div className="card p-5 mb-6">
        <h2 className="font-semibold text-gray-800 mb-4">Tambah Catatan Barang Masuk</h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="text-sm text-gray-600 block mb-1">
              Nama Bahan <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.item_name}
              onChange={(e) => setField('item_name', e.target.value)}
              placeholder="cth: Tepung Terigu"
              className="input w-full"
              required
            />
          </div>

          <div>
            <label className="text-sm text-gray-600 block mb-1">
              Jumlah <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="0.01"
              step="any"
              value={form.qty}
              onChange={(e) => setField('qty', e.target.value)}
              placeholder="cth: 10"
              className="input w-full"
              required
            />
          </div>

          <div>
            <label className="text-sm text-gray-600 block mb-1">
              Satuan <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.unit}
                onChange={(e) => setField('unit', e.target.value)}
                placeholder="cth: Kg"
                className="input flex-1"
                required
              />
              <select
                className="input w-auto text-sm"
                value=""
                onChange={(e) => { if (e.target.value) setField('unit', e.target.value); }}
              >
                <option value="">Pilih</option>
                {COMMON_UNITS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-600 block mb-1">
              Tanggal <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setField('date', e.target.value)}
              className="input w-full"
              required
            />
          </div>

          <div>
            <label className="text-sm text-gray-600 block mb-1">Supplier (opsional)</label>
            <input
              type="text"
              value={form.supplier_name}
              onChange={(e) => setField('supplier_name', e.target.value)}
              placeholder="cth: CV Sumber Makmur"
              className="input w-full"
            />
          </div>

          <div>
            <label className="text-sm text-gray-600 block mb-1">Catatan (opsional)</label>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setField('notes', e.target.value)}
              placeholder="cth: kondisi barang normal"
              className="input w-full"
            />
          </div>

          <div className="md:col-span-2 lg:col-span-3 flex justify-end">
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? 'Menyimpan...' : '+ Simpan Catatan'}
            </button>
          </div>
        </form>
      </div>

      {/* Histori */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center gap-3 flex-wrap">
          <h2 className="font-semibold text-gray-800 flex-1">Histori Barang Masuk</h2>
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
          <button onClick={loadRecords} disabled={loading} className="btn-primary text-sm">
            {loading ? 'Memuat...' : 'Terapkan'}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
          </div>
        ) : records.length === 0 ? (
          <div className="p-10 text-center text-gray-400">
            <p className="text-4xl mb-3">📦</p>
            <p>Belum ada catatan dalam rentang tanggal ini</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Tanggal</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Nama Bahan</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Jumlah</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Satuan</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Supplier</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Catatan</th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {records.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      {formatDateID(r.date)}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">{r.item_name}</td>
                    <td className="px-4 py-3 text-center font-semibold text-brand-red">{r.qty}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{r.unit}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {r.supplier_name || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">
                      {r.notes || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleDelete(r.id)}
                        disabled={deletingId === r.id}
                        className="text-gray-300 hover:text-red-500 transition-colors text-xl leading-none"
                        title="Hapus catatan"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-orange-50 border-t-2 border-orange-200">
                  <td colSpan={2} className="px-4 py-3 font-semibold text-gray-700 text-right">
                    Total catatan:
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-gray-800">
                    {records.length}
                  </td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
