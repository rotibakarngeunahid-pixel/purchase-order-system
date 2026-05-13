import { useEffect, useState } from 'react';
import { getMapping, saveMapping, getInventoryBranches } from '../services/rotiTawarService';

export default function RotiTawarConfig() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [invBranches, currentMappings] = await Promise.all([
        getInventoryBranches().catch(() => null),
        getMapping(),
      ]);

      if (currentMappings.length > 0) {
        setRows(currentMappings);
      } else if (invBranches && Array.isArray(invBranches.data)) {
        // Pre-populate dari GAS cabang jika belum ada mapping
        setRows(
          invBranches.data.map((b) => ({
            inv_cabang_id: b.cabang_id || b.id || '',
            display_name: b.nama_cabang || b.name || '',
            is_active: true,
            min_stock: 0,
          }))
        );
      }
    } catch (err) {
      showToast('Gagal memuat data mapping.', 'error');
    } finally {
      setLoading(false);
    }
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  function updateRow(idx, field, value) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      { inv_cabang_id: '', display_name: '', is_active: true, min_stock: 0 },
    ]);
  }

  function removeRow(idx) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    const valid = rows.filter((r) => r.inv_cabang_id.trim() && r.display_name.trim());
    if (valid.length === 0) {
      showToast('Isi minimal satu baris mapping.', 'error');
      return;
    }
    setSaving(true);
    try {
      await saveMapping(valid);
      showToast('Konfigurasi berhasil disimpan!');
      loadData();
    } catch (err) {
      showToast('Gagal menyimpan konfigurasi.', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <span className="w-4 h-4 border-2 border-brand-red border-t-transparent rounded-full animate-spin" />
        Memuat konfigurasi...
      </div>
    );
  }

  return (
    <div>
      {toast && (
        <div
          className={`mb-4 px-4 py-3 rounded-lg text-white text-sm ${
            toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'
          }`}
        >
          {toast.msg}
        </div>
      )}

      <p className="text-sm text-gray-500 mb-4">
        Petakan ID cabang dari sistem inventaris GAS ke nama outlet di PO. Kolom{' '}
        <strong>Nama di PO</strong> harus cocok persis dengan nama outlet di Master Data.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 pr-3 font-medium text-gray-600 w-40">GAS Cabang ID</th>
              <th className="text-left py-2 pr-3 font-medium text-gray-600">Nama di PO</th>
              <th className="text-left py-2 pr-3 font-medium text-gray-600 w-28">Min Stok</th>
              <th className="text-center py-2 pr-3 font-medium text-gray-600 w-16">Aktif</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, idx) => (
              <tr key={idx}>
                <td className="py-2 pr-3">
                  <input
                    type="text"
                    className="input text-sm"
                    value={row.inv_cabang_id}
                    onChange={(e) => updateRow(idx, 'inv_cabang_id', e.target.value)}
                    placeholder="cth: Dalung1"
                  />
                </td>
                <td className="py-2 pr-3">
                  <input
                    type="text"
                    className="input text-sm"
                    value={row.display_name}
                    onChange={(e) => updateRow(idx, 'display_name', e.target.value)}
                    placeholder="cth: Bunderan Dalung"
                  />
                </td>
                <td className="py-2 pr-3">
                  <input
                    type="number"
                    min="0"
                    className="input text-sm"
                    value={row.min_stock}
                    onChange={(e) => updateRow(idx, 'min_stock', Number(e.target.value))}
                  />
                </td>
                <td className="py-2 pr-3 text-center">
                  <input
                    type="checkbox"
                    checked={row.is_active}
                    onChange={(e) => updateRow(idx, 'is_active', e.target.checked)}
                    className="w-4 h-4 accent-brand-red"
                  />
                </td>
                <td className="py-2">
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    className="text-gray-300 hover:text-red-500 transition-colors text-lg leading-none"
                    title="Hapus baris"
                  >
                    x
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && (
        <p className="text-sm text-gray-400 py-4 text-center">Belum ada mapping. Tambah baris di bawah.</p>
      )}

      <div className="flex items-center justify-between mt-4">
        <button type="button" onClick={addRow} className="btn-secondary text-sm">
          + Tambah Baris
        </button>
        <button type="button" onClick={handleSave} disabled={saving} className="btn-primary text-sm">
          {saving ? 'Menyimpan...' : 'Simpan Mapping'}
        </button>
      </div>
    </div>
  );
}
