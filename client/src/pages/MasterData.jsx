import { useEffect, useMemo, useState } from 'react';
import api, { formatRupiah } from '../lib/api';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import useModalDismiss from '../components/ui/useModalDismiss';
import {
  REQUEST_BASIS,
  calculatePurchaseSuggestion,
  getRequestUnit,
  resolvePurchaseConfig,
} from '../lib/purchaseConfig';

// ─── Variants Modal ───────────────────────────────────────────────────────────
function VariantsModal({ material, suppliers, onClose }) {
  const [variants, setVariants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addingNew, setAddingNew] = useState(false);
  const [newForm, setNewForm] = useState({ brand: '', supplier_id: '', price_per_purchase_unit: 0 });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  useModalDismiss(onClose);

  useEffect(() => { loadVariants(); }, []);

  async function loadVariants() {
    setLoading(true);
    try {
      const res = await api.get(`/api/materials/${material.id}/variants`);
      setVariants(res.data || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    if (!newForm.brand.trim()) return;
    setSaving(true);
    setError('');
    try {
      await api.post(`/api/materials/${material.id}/variants`, {
        brand: newForm.brand,
        supplier_id: newForm.supplier_id || null,
        price_per_purchase_unit: Number(newForm.price_per_purchase_unit) || 0,
      });
      setNewForm({ brand: '', supplier_id: '', price_per_purchase_unit: 0 });
      setAddingNew(false);
      loadVariants();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(vid) {
    setSaving(true);
    setError('');
    try {
      await api.put(`/api/materials/${material.id}/variants/${vid}`, {
        brand: editForm.brand,
        supplier_id: editForm.supplier_id || null,
        price_per_purchase_unit: Number(editForm.price_per_purchase_unit) || 0,
      });
      setEditingId(null);
      loadVariants();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(vid) {
    setDeleting(true);
    setError('');
    try {
      await api.delete(`/api/materials/${material.id}/variants/${vid}`);
      setConfirmDeleteId(null);
      loadVariants();
    } catch (err) {
      setConfirmDeleteId(null);
      setError(err.response?.data?.error || err.message);
    } finally {
      setDeleting(false);
    }
  }

  async function toggleActive(v) {
    setError('');
    try {
      await api.put(`/api/materials/${material.id}/variants/${v.id}`, { is_active: !v.is_active });
      loadVariants();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      {confirmDeleteId && (
        <ConfirmDialog
          title="Hapus Varian?"
          confirmLabel="Ya, Hapus"
          danger
          loading={deleting}
          loadingLabel="Menghapus..."
          onConfirm={() => handleDelete(confirmDeleteId)}
          onCancel={() => setConfirmDeleteId(null)}
        >
          Varian merk ini akan dihapus permanen dari bahan{' '}
          <strong>{material.name}</strong>.
        </ConfirmDialog>
      )}
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-brand-red px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-white font-semibold text-lg">Varian Merk — {material.name}</h3>
            <p className="text-red-200 text-sm">Kelola merk berbeda dengan harga masing-masing</p>
          </div>
          <button onClick={onClose} className="text-white hover:text-red-200 text-2xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
          {/* Form tambah baru */}
          {addingNew ? (
            <div className="mb-5 p-4 bg-yellow-50 rounded-xl border border-yellow-200">
              <p className="text-sm font-semibold text-gray-700 mb-3">Tambah Varian Baru</p>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Nama Merk *</label>
                  <input
                    autoFocus
                    className="input text-sm"
                    placeholder="cth: Frisian Flag"
                    value={newForm.brand}
                    onChange={(e) => setNewForm((f) => ({ ...f, brand: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Supplier (opsional)</label>
                  <select
                    className="input text-sm"
                    value={newForm.supplier_id}
                    onChange={(e) => setNewForm((f) => ({ ...f, supplier_id: e.target.value }))}
                  >
                    <option value="">— Sama dgn bahan —</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Harga/Satuan (Rp)</label>
                  <input
                    type="number"
                    className="input text-sm"
                    value={newForm.price_per_purchase_unit}
                    onChange={(e) => setNewForm((f) => ({ ...f, price_per_purchase_unit: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleAdd} disabled={saving || !newForm.brand.trim()} className="btn-primary text-sm">
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
                <button onClick={() => setAddingNew(false)} className="btn-outline text-sm">Batal</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAddingNew(true)} className="btn-primary text-sm mb-5">
              + Tambah Varian
            </button>
          )}

          {loading ? (
            <div className="text-center py-8 text-gray-400">Memuat...</div>
          ) : variants.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <p className="text-3xl mb-2">🏷️</p>
              <p className="font-medium">Belum ada varian merk</p>
              <p className="text-sm mt-1">Klik tombol di atas untuk menambahkan</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-3 py-2.5 text-left font-medium text-gray-600">Merk</th>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-600">Supplier</th>
                  <th className="px-3 py-2.5 text-right font-medium text-gray-600">Harga/Sat</th>
                  <th className="px-3 py-2.5 text-center font-medium text-gray-600">Aktif</th>
                  <th className="px-3 py-2.5 text-center font-medium text-gray-600">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {variants.map((v) =>
                  editingId === v.id ? (
                    <tr key={v.id} className="bg-yellow-50">
                      <td className="px-3 py-2">
                        <input
                          autoFocus
                          className="input text-xs"
                          value={editForm.brand}
                          onChange={(e) => setEditForm((f) => ({ ...f, brand: e.target.value }))}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          className="input text-xs"
                          value={editForm.supplier_id || ''}
                          onChange={(e) => setEditForm((f) => ({ ...f, supplier_id: e.target.value }))}
                        >
                          <option value="">— Sama dgn bahan —</option>
                          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          className="input text-xs text-right"
                          value={editForm.price_per_purchase_unit}
                          onChange={(e) => setEditForm((f) => ({ ...f, price_per_purchase_unit: e.target.value }))}
                        />
                      </td>
                      <td />
                      <td className="px-3 py-2 text-center">
                        <div className="flex gap-1 justify-center">
                          <button onClick={() => handleUpdate(v.id)} disabled={saving} className="btn-primary text-xs px-2 py-1">
                            {saving ? '...' : 'Simpan'}
                          </button>
                          <button onClick={() => setEditingId(null)} className="btn-outline text-xs px-2 py-1">Batal</button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={v.id} className={`hover:bg-gray-50 ${!v.is_active ? 'opacity-50' : ''}`}>
                      <td className="px-3 py-2.5 font-medium text-gray-800">{v.brand}</td>
                      <td className="px-3 py-2.5 text-gray-600 text-sm">{v.supplier?.name || <span className="text-gray-400">—</span>}</td>
                      <td className="px-3 py-2.5 text-right font-medium text-gray-800">{formatRupiah(v.price_per_purchase_unit)}</td>
                      <td className="px-3 py-2.5 text-center">
                        <button
                          onClick={() => toggleActive(v)}
                          className={`w-10 h-5 rounded-full transition-colors ${v.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
                        >
                          <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${v.is_active ? 'translate-x-5' : ''}`} />
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex gap-2 justify-center">
                          <button
                            onClick={() => {
                              setEditingId(v.id);
                              setEditForm({ brand: v.brand, supplier_id: v.supplier_id || '', price_per_purchase_unit: v.price_per_purchase_unit });
                            }}
                            className="text-brand-orange text-xs font-medium hover:underline"
                          >
                            Edit
                          </button>
                          <button onClick={() => setConfirmDeleteId(v.id)} className="text-red-500 text-xs font-medium hover:underline">
                            Hapus
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-6 py-4 border-t flex-shrink-0">
          <button onClick={onClose} className="btn-outline text-sm">Tutup</button>
        </div>
      </div>
    </div>
  );
}

// ─── Suppliers Tab ────────────────────────────────────────────────────────────
function SuppliersTab() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: '', wa_number: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { loadSuppliers(); }, []);

  async function loadSuppliers() {
    setLoading(true);
    const res = await api.get('/api/suppliers');
    setSuppliers(res.data);
    setLoading(false);
  }

  const startAdd = () => { setEditingId('new'); setForm({ name: '', wa_number: '' }); setError(''); };
  const startEdit = (s) => { setEditingId(s.id); setForm({ name: s.name, wa_number: s.wa_number }); setError(''); };
  const cancelEdit = () => { setEditingId(null); setError(''); };

  const handleSave = async () => {
    if (!form.name.trim() || !form.wa_number.trim()) { setError('Nama dan nomor WA wajib diisi'); return; }
    setSaving(true);
    setError('');
    try {
      if (editingId === 'new') await api.post('/api/suppliers', form);
      else await api.put(`/api/suppliers/${editingId}`, form);
      setEditingId(null);
      await loadSuppliers();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (s) => {
    await api.put(`/api/suppliers/${s.id}`, { is_active: !s.is_active });
    await loadSuppliers();
  };

  const toggleBonus = async (s) => {
    await api.put(`/api/suppliers/${s.id}`, { gives_roti_tawar_bonus: !s.gives_roti_tawar_bonus });
    await loadSuppliers();
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError('');
    try {
      await api.delete(`/api/suppliers/${confirmDelete.id}`);
      setConfirmDelete(null);
      await loadSuppliers();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setConfirmDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <div className="py-10 text-center text-gray-400">Memuat...</div>;

  // Baris form inline (tidak sebagai nested component — mencegah input lag)
  const formRow = (
    <tr className="bg-yellow-50">
      <td className="px-4 py-2">
        <input
          autoFocus
          className="input text-sm"
          placeholder="Nama supplier"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
      </td>
      <td className="px-4 py-2">
        <input
          className="input text-sm"
          placeholder="628xxxxxxxxxx"
          value={form.wa_number}
          onChange={(e) => setForm((f) => ({ ...f, wa_number: e.target.value }))}
        />
      </td>
      <td />
      <td />
      <td className="px-4 py-2 text-center">
        <div className="flex gap-2 justify-center">
          <button onClick={handleSave} disabled={saving} className="btn-primary text-xs px-3 py-1">
            {saving ? '...' : 'Simpan'}
          </button>
          <button onClick={cancelEdit} className="btn-outline text-xs px-3 py-1">Batal</button>
        </div>
      </td>
    </tr>
  );

  return (
    <div>
      {confirmDelete && (
        <ConfirmDialog
          title="Hapus Supplier?"
          confirmLabel="Ya, Hapus"
          danger
          loading={deleting}
          loadingLabel="Menghapus..."
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        >
          <p>
            Supplier <strong>{confirmDelete.name}</strong> akan dihapus permanen.
          </p>
          <p className="text-red-600 mt-1">
            Jika supplier masih terhubung dengan bahan baku, penghapusan akan gagal.
          </p>
        </ConfirmDialog>
      )}

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{suppliers.length} supplier terdaftar</p>
        <button onClick={startAdd} disabled={editingId !== null} className="btn-primary text-sm">+ Tambah Supplier</button>
      </div>
      {error && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-4 py-3 text-left font-medium text-gray-600">Nama Supplier</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Nomor WhatsApp</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600">
                Bonus Roti Tawar
                <span className="block text-[10px] font-normal text-gray-400">Kelipatan 20 dapat 1</span>
              </th>
              <th className="px-4 py-3 text-center font-medium text-gray-600">Status</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {editingId === 'new' && formRow}
            {suppliers.map((s) => (
              editingId === s.id ? (
                <tr key={s.id} className="bg-yellow-50">
                  <td className="px-4 py-2">
                    <input autoFocus className="input text-sm" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                  </td>
                  <td className="px-4 py-2">
                    <input className="input text-sm" value={form.wa_number} onChange={(e) => setForm((f) => ({ ...f, wa_number: e.target.value }))} />
                  </td>
                  <td />
                  <td />
                  <td className="px-4 py-2 text-center">
                    <div className="flex gap-2 justify-center">
                      <button onClick={handleSave} disabled={saving} className="btn-primary text-xs px-3 py-1">{saving ? '...' : 'Simpan'}</button>
                      <button onClick={cancelEdit} className="btn-outline text-xs px-3 py-1">Batal</button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={s.id} className={`hover:bg-gray-50 ${!s.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-medium text-gray-800">{s.name}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">{s.wa_number}</td>
                  <td className="px-4 py-3 text-center" title="Dapat bonus kelipatan 20 pcs roti tawar (+1 gratis)">
                    <button onClick={() => toggleBonus(s)} className={`w-10 h-5 rounded-full transition-colors ${s.gives_roti_tawar_bonus !== false ? 'bg-green-500' : 'bg-gray-300'}`}>
                      <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${s.gives_roti_tawar_bonus !== false ? 'translate-x-5' : ''}`} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => toggleActive(s)} className={`w-10 h-5 rounded-full transition-colors ${s.is_active ? 'bg-green-500' : 'bg-gray-300'}`}>
                      <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${s.is_active ? 'translate-x-5' : ''}`} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex gap-2 justify-center">
                      <button onClick={() => startEdit(s)} className="text-brand-orange text-xs font-medium hover:underline">Edit</button>
                      <button onClick={() => setConfirmDelete(s)} className="text-red-500 text-xs font-medium hover:underline">Hapus</button>
                    </div>
                  </td>
                </tr>
              )
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Bahan Mapping Modal ──────────────────────────────────────────────────────
function BahanMappingModal({ material, onClose, onSaved }) {
  const [invBahanList, setInvBahanList] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedId, setSelectedId] = useState(material.inventory_material_id || '');
  const [selectedName, setSelectedName] = useState(material.inventory_material_name || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useModalDismiss(onClose);

  useEffect(() => {
    api.get('/api/inventori/bahan')
      .then((res) => setInvBahanList(res.data?.data || []))
      .catch(() => {})
      .finally(() => setLoadingList(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await api.put(`/api/materials/${material.id}`, {
        inventory_material_id: selectedId || null,
        inventory_material_name: selectedName || null,
      });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setSaving(false);
    }
  }

  async function handleClearLink() {
    setSaving(true);
    setError('');
    try {
      await api.put(`/api/materials/${material.id}`, {
        inventory_material_id: null,
        inventory_material_name: null,
      });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setSaving(false);
    }
  }

  const isMapped = !!material.inventory_material_id;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-brand-red px-6 py-4 flex items-center justify-between flex-shrink-0 rounded-t-2xl">
          <div>
            <h3 className="text-white font-semibold text-base">Link Inventori</h3>
            <p className="text-red-200 text-xs mt-0.5 truncate max-w-[260px]">{material.name}</p>
          </div>
          <button onClick={onClose} className="text-white hover:text-red-200 text-2xl leading-none">×</button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Info */}
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3.5 text-xs text-orange-800 leading-relaxed">
            Hubungkan <strong>{material.name}</strong> ke bahan di sistem Inventori agar rekomendasi
            staf otomatis terpetakan ke bahan ini.
          </div>

          {/* Status saat ini */}
          {isMapped && (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl">
              <span className="text-green-600 text-sm">✓</span>
              <div>
                <p className="text-xs font-semibold text-green-800">Sudah terhubung</p>
                <p className="text-[11px] text-green-700 mt-0.5">
                  {material.inventory_material_name || '(tanpa nama)'}{' '}
                  <span className="text-green-500 font-mono">ID: {material.inventory_material_id}</span>
                </p>
              </div>
            </div>
          )}

          {/* Pilih bahan inventori */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Bahan di Sistem Inventori
            </label>
            {loadingList ? (
              <div className="input text-sm text-gray-400 cursor-wait">Memuat daftar bahan inventori...</div>
            ) : invBahanList.length > 0 ? (
              <select
                className="input text-sm"
                value={selectedId}
                onChange={(e) => {
                  const id = e.target.value;
                  const opt = invBahanList.find((b) => b.bahan_id === id);
                  setSelectedId(id);
                  setSelectedName(opt ? opt.nama_bahan : '');
                }}
              >
                <option value="">— Pilih bahan dari inventori —</option>
                {invBahanList.map((b) => (
                  <option key={b.bahan_id} value={b.bahan_id}>
                    {b.nama_bahan}{b.kategori ? ` — ${b.kategori}` : ''}{b.satuan ? ` (${b.satuan})` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <div className="space-y-3">
                <div>
                  <input
                    className="input text-sm"
                    placeholder="ID bahan inventori, cth: 5"
                    value={selectedId}
                    onChange={(e) => setSelectedId(e.target.value)}
                  />
                  <p className="text-[10px] text-gray-400 mt-1">
                    Lihat ID di panel Rekomendasi Order — hover badge{' '}
                    <span className="text-amber-600 font-medium">Perlu mapping bahan</span>.
                  </p>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Nama bahan (label, opsional)</label>
                  <input
                    className="input text-sm"
                    placeholder="Nama bahan di sistem inventori"
                    value={selectedName}
                    onChange={(e) => setSelectedName(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex items-center justify-between gap-3">
          <div>
            {isMapped && (
              <button
                onClick={handleClearLink}
                disabled={saving}
                className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50"
              >
                Hapus Link
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-outline text-sm">Batal</button>
            <button
              onClick={handleSave}
              disabled={saving || !selectedId}
              className="btn-primary text-sm"
            >
              {saving ? 'Menyimpan...' : 'Simpan Link'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Materials Tab ────────────────────────────────────────────────────────────
function MaterialsTab() {
  const [materials, setMaterials] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [variantsFor, setVariantsFor] = useState(null);
  const [mappingFor, setMappingFor] = useState(null);

  const emptyForm = { code: '', name: '', brand: '', supplier_id: '', package_qty: 1, package_unit: 'Pcs', purchase_unit: 'Pcs', price_per_purchase_unit: 0 };
  const [form, setForm] = useState(emptyForm);
  const setF = (field, val) => setForm((f) => ({ ...f, [field]: val }));

  useEffect(() => {
    Promise.all([api.get('/api/materials'), api.get('/api/suppliers')]).then(([mRes, sRes]) => {
      setMaterials(mRes.data);
      setSuppliers(sRes.data.filter((s) => s.is_active));
      setLoading(false);
    });
  }, []);

  async function reload() {
    const res = await api.get('/api/materials');
    setMaterials(res.data);
  }

  const startAdd = () => { setEditingId('new'); setForm(emptyForm); setError(''); };
  const startEdit = (m) => {
    setEditingId(m.id);
    setForm({ code: m.code, name: m.name, brand: m.brand || '', supplier_id: m.supplier_id || '', package_qty: m.package_qty, package_unit: m.package_unit, purchase_unit: m.purchase_unit, price_per_purchase_unit: m.price_per_purchase_unit });
    setError('');
  };
  const cancelEdit = () => { setEditingId(null); setError(''); };

  const handleSave = async () => {
    if (!form.code || !form.name || !form.purchase_unit) { setError('Kode, nama, dan satuan beli wajib diisi'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, supplier_id: form.supplier_id || null };
      if (editingId === 'new') await api.post('/api/materials', payload);
      else await api.put(`/api/materials/${editingId}`, payload);
      setEditingId(null);
      await reload();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (m) => {
    await api.put(`/api/materials/${m.id}`, { is_active: !m.is_active });
    await reload();
  };

  if (loading) return <div className="py-10 text-center text-gray-400">Memuat...</div>;

  // Form row inline — TIDAK sebagai nested component untuk mencegah input lag
  const formRowJSX = (
    <tr className="bg-yellow-50">
      <td className="px-2 py-2"><input className="input text-xs" value={form.code} onChange={(e) => setF('code', e.target.value)} placeholder="BHN01" /></td>
      <td className="px-2 py-2"><input className="input text-xs" value={form.name} onChange={(e) => setF('name', e.target.value)} placeholder="Nama bahan" /></td>
      <td className="px-2 py-2"><input className="input text-xs" value={form.brand} onChange={(e) => setF('brand', e.target.value)} placeholder="Merk default" /></td>
      <td className="px-2 py-2">
        <select className="input text-xs" value={form.supplier_id} onChange={(e) => setF('supplier_id', e.target.value)}>
          <option value="">-- Supplier --</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </td>
      <td className="px-2 py-2"><input type="number" className="input text-xs" value={form.package_qty} onChange={(e) => setF('package_qty', e.target.value)} /></td>
      <td className="px-2 py-2"><input className="input text-xs" value={form.package_unit} onChange={(e) => setF('package_unit', e.target.value)} placeholder="Gr" /></td>
      <td className="px-2 py-2"><input className="input text-xs" value={form.purchase_unit} onChange={(e) => setF('purchase_unit', e.target.value)} placeholder="Kg" /></td>
      <td className="px-2 py-2"><input type="number" className="input text-xs" value={form.price_per_purchase_unit} onChange={(e) => setF('price_per_purchase_unit', e.target.value)} /></td>
      <td />
      <td className="px-2 py-2">
        <div className="flex gap-1">
          <button onClick={handleSave} disabled={saving} className="btn-primary text-xs px-2 py-1">{saving ? '...' : 'Simpan'}</button>
          <button onClick={cancelEdit} className="btn-outline text-xs px-2 py-1">Batal</button>
        </div>
      </td>
    </tr>
  );

  return (
    <div>
      {variantsFor && (
        <VariantsModal
          material={variantsFor}
          suppliers={suppliers}
          onClose={() => setVariantsFor(null)}
        />
      )}
      {mappingFor && (
        <BahanMappingModal
          material={mappingFor}
          onClose={() => setMappingFor(null)}
          onSaved={reload}
        />
      )}

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{materials.length} bahan terdaftar</p>
        <button onClick={startAdd} disabled={editingId !== null} className="btn-primary text-sm">+ Tambah Bahan</button>
      </div>
      {error && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: '1000px' }}>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-3 py-3 text-left font-medium text-gray-600">Kode</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">Nama</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">Merk Default</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">Supplier</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600">Isi</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600">Sat. Kemasan</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600">Sat. Beli</th>
                <th className="px-3 py-3 text-right font-medium text-gray-600">Harga Default</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600">Status</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {editingId === 'new' && formRowJSX}
              {materials.map((m) =>
                editingId === m.id ? (
                  <tr key={m.id} className="bg-yellow-50">
                    <td className="px-2 py-2"><input autoFocus className="input text-xs" value={form.code} onChange={(e) => setF('code', e.target.value)} /></td>
                    <td className="px-2 py-2"><input className="input text-xs" value={form.name} onChange={(e) => setF('name', e.target.value)} /></td>
                    <td className="px-2 py-2"><input className="input text-xs" value={form.brand} onChange={(e) => setF('brand', e.target.value)} placeholder="Merk default" /></td>
                    <td className="px-2 py-2">
                      <select className="input text-xs" value={form.supplier_id} onChange={(e) => setF('supplier_id', e.target.value)}>
                        <option value="">-- Supplier --</option>
                        {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-2"><input type="number" className="input text-xs" value={form.package_qty} onChange={(e) => setF('package_qty', e.target.value)} /></td>
                    <td className="px-2 py-2"><input className="input text-xs" value={form.package_unit} onChange={(e) => setF('package_unit', e.target.value)} /></td>
                    <td className="px-2 py-2"><input className="input text-xs" value={form.purchase_unit} onChange={(e) => setF('purchase_unit', e.target.value)} /></td>
                    <td className="px-2 py-2"><input type="number" className="input text-xs" value={form.price_per_purchase_unit} onChange={(e) => setF('price_per_purchase_unit', e.target.value)} /></td>
                    <td />
                    <td className="px-2 py-2">
                      <div className="flex gap-1">
                        <button onClick={handleSave} disabled={saving} className="btn-primary text-xs px-2 py-1">{saving ? '...' : 'Simpan'}</button>
                        <button onClick={cancelEdit} className="btn-outline text-xs px-2 py-1">Batal</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={m.id} className={`hover:bg-gray-50 ${!m.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-3 py-3 font-mono text-xs text-gray-600">{m.code}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-gray-800">{m.name}</span>
                        {m.inventory_material_id ? (
                          <button
                            onClick={() => setMappingFor(m)}
                            className="text-[9px] text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded whitespace-nowrap hover:bg-green-100 transition-colors cursor-pointer"
                            title={`Terhubung ke: ${m.inventory_material_name || m.inventory_material_id} (ID: ${m.inventory_material_id}) — klik untuk ubah`}
                          >
                            🔗 {m.inventory_material_name || `ID ${m.inventory_material_id}`}
                          </button>
                        ) : (
                          <button
                            onClick={() => setMappingFor(m)}
                            className="text-[9px] text-amber-700 bg-amber-50 border border-amber-300 border-dashed px-1.5 py-0.5 rounded whitespace-nowrap hover:bg-amber-100 transition-colors cursor-pointer"
                            title="Belum terhubung ke bahan inventori — klik untuk memetakan"
                          >
                            + Link Inventori
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-gray-500 text-xs">{m.brand || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-3 text-gray-600">{m.supplier?.name || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-3 text-center text-gray-600">{m.package_qty}</td>
                    <td className="px-3 py-3 text-center text-gray-600">{m.package_unit}</td>
                    <td className="px-3 py-3 text-center font-medium text-brand-orange">{m.purchase_unit}</td>
                    <td className="px-3 py-3 text-right text-gray-800">{formatRupiah(m.price_per_purchase_unit)}</td>
                    <td className="px-3 py-3 text-center">
                      <button onClick={() => toggleActive(m)} className={`w-10 h-5 rounded-full transition-colors ${m.is_active ? 'bg-green-500' : 'bg-gray-300'}`}>
                        <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${m.is_active ? 'translate-x-5' : ''}`} />
                      </button>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex gap-2 justify-center">
                        <button onClick={() => startEdit(m)} className="text-brand-orange text-xs font-medium hover:underline">Edit</button>
                        <button onClick={() => setVariantsFor(m)} className="text-blue-600 text-xs font-medium hover:underline">Varian</button>
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Memetakan outlet ke cabang Inventori berdasarkan ID (sumber kebenaran utama),
// nama hanya disimpan sebagai label/fallback. Bila daftar cabang tidak bisa
// dimuat, jatuh ke input nama bebas (tanpa ID).
function CabangSelect({ valueId, valueName, onChange, options }) {
  if (options.length === 0) {
    return (
      <input
        className="input text-sm"
        placeholder="Nama cabang di sistem inventori (opsional)"
        value={valueName}
        onChange={(e) => onChange('', e.target.value)}
      />
    );
  }
  // Pilih berdasarkan ID; bila ID kosong (data lama), cocokkan via nama.
  const selectedId =
    valueId || (options.find((c) => c.nama_cabang === valueName)?.cabang_id ?? '');
  return (
    <select
      className="input text-sm"
      value={selectedId}
      onChange={(e) => {
        const id = e.target.value;
        const opt = options.find((c) => String(c.cabang_id) === String(id));
        onChange(id, opt ? opt.nama_cabang : '');
      }}
    >
      <option value="">— Pilih cabang inventori —</option>
      {options.map((c) => (
        <option key={c.cabang_id} value={c.cabang_id}>{c.nama_cabang}</option>
      ))}
    </select>
  );
}

// ─── Outlets Tab ──────────────────────────────────────────────────────────────
function OutletsTab() {
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: '', inventori_branch_id: '', inventori_cabang_name: '', min_stock_roti: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [inventoriCabangList, setInventoriCabangList] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  // Eskalasi hapus paksa (cascade) — muncul kalau hapus biasa ditolak karena
  // outlet masih terhubung data lain.
  const [forceTarget, setForceTarget] = useState(null);
  const [forcePreview, setForcePreview] = useState(null);
  const [forceLoadingPreview, setForceLoadingPreview] = useState(false);
  const [forceConfirmText, setForceConfirmText] = useState('');
  const [forceDeleting, setForceDeleting] = useState(false);
  const [forceError, setForceError] = useState('');

  useEffect(() => {
    loadOutlets();
    api.get('/api/inventori/cabang')
      .then((res) => setInventoriCabangList(res.data?.data || []))
      .catch(() => {});
  }, []);

  async function loadOutlets() {
    setLoading(true);
    const res = await api.get('/api/outlets');
    setOutlets(res.data);
    setLoading(false);
  }

  const startAdd = () => { setEditingId('new'); setForm({ name: '', inventori_branch_id: '', inventori_cabang_name: '', min_stock_roti: 0 }); setError(''); };
  const startEdit = (o) => { setEditingId(o.id); setForm({ name: o.name, inventori_branch_id: o.inventori_branch_id || '', inventori_cabang_name: o.inventori_cabang_name || '', min_stock_roti: o.min_stock_roti ?? 0 }); setError(''); };
  const cancelEdit = () => { setEditingId(null); setError(''); };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Nama outlet wajib diisi'); return; }
    setSaving(true);
    setError('');
    try {
      if (editingId === 'new') await api.post('/api/outlets', form);
      else await api.put(`/api/outlets/${editingId}`, form);
      setEditingId(null);
      await loadOutlets();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (o) => {
    await api.put(`/api/outlets/${o.id}`, { is_active: !o.is_active });
    await loadOutlets();
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError('');
    try {
      await api.delete(`/api/outlets/${confirmDelete.id}`);
      setConfirmDelete(null);
      await loadOutlets();
    } catch (err) {
      // Ditolak (biasanya karena masih terhubung data lain) — tawarkan opsi
      // hapus paksa (cascade) dengan preview + konfirmasi ketik ulang nama,
      // bukan cuma berhenti di pesan error.
      const outlet = confirmDelete;
      setConfirmDelete(null);
      if (err.response?.status === 400) {
        openForceDelete(outlet);
      } else {
        setError(err.response?.data?.error || err.message);
      }
    } finally {
      setDeleting(false);
    }
  };

  const openForceDelete = async (outlet) => {
    setForceTarget(outlet);
    setForcePreview(null);
    setForceConfirmText('');
    setForceError('');
    setForceLoadingPreview(true);
    try {
      const res = await api.get(`/api/outlets/${outlet.id}/delete-preview`);
      setForcePreview(res.data);
    } catch (err) {
      setForceError(err.response?.data?.error || err.message);
    } finally {
      setForceLoadingPreview(false);
    }
  };

  const closeForceDelete = () => {
    setForceTarget(null);
    setForcePreview(null);
    setForceConfirmText('');
    setForceError('');
  };

  const handleForceDelete = async () => {
    setForceDeleting(true);
    setForceError('');
    try {
      await api.delete(`/api/outlets/${forceTarget.id}/cascade`);
      closeForceDelete();
      await loadOutlets();
    } catch (err) {
      setForceError(err.response?.data?.error || err.message);
    } finally {
      setForceDeleting(false);
    }
  };

  if (loading) return <div className="py-10 text-center text-gray-400">Memuat...</div>;

  return (
    <div>
      {confirmDelete && (
        <ConfirmDialog
          title="Hapus Outlet?"
          confirmLabel="Ya, Hapus"
          danger
          loading={deleting}
          loadingLabel="Menghapus..."
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        >
          <p>
            Outlet <strong>{confirmDelete.name}</strong> akan dihapus permanen.
          </p>
          <p className="text-gray-500 mt-1">
            Jika outlet masih terhubung dengan data order/mapping/laporan, Anda akan ditawarkan
            opsi hapus paksa beserta seluruh data terkait.
          </p>
        </ConfirmDialog>
      )}

      {forceTarget && (
        <ConfirmDialog
          title="Outlet Masih Terhubung Data Lain"
          confirmLabel="Ya, Hapus Paksa Semuanya"
          danger
          loading={forceDeleting}
          loadingLabel="Menghapus..."
          disableConfirm={
            forceLoadingPreview || !forcePreview || forceConfirmText.trim() !== forceTarget.name
          }
          onConfirm={handleForceDelete}
          onCancel={forceDeleting ? undefined : closeForceDelete}
        >
          <p>
            Outlet <strong>{forceTarget.name}</strong> tidak bisa dihapus biasa karena masih
            terhubung dengan data lain. Hapus paksa akan menghapus outlet ini{' '}
            <strong>beserta seluruh data di bawah, permanen, tidak bisa dibatalkan</strong>:
          </p>
          {forceLoadingPreview && (
            <p className="mt-2 text-gray-400">Menghitung data terkait...</p>
          )}
          {forceError && <p className="mt-2 text-red-600">{forceError}</p>}
          {forcePreview && (
            <>
              {forcePreview.total === 0 ? (
                <p className="mt-2 text-gray-500">
                  Tidak ada data lain yang terdeteksi terhubung — aman dihapus.
                </p>
              ) : (
                <ul className="mt-2 list-disc list-inside space-y-0.5 text-red-600">
                  {forcePreview.counts.map((c) => (
                    <li key={c.key}>{c.label}: {c.count}</li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-gray-600">
                Ketik <strong>{forceTarget.name}</strong> untuk konfirmasi:
              </p>
              <input
                autoFocus
                className="input text-sm mt-1 w-full"
                value={forceConfirmText}
                onChange={(e) => setForceConfirmText(e.target.value)}
                placeholder={forceTarget.name}
              />
            </>
          )}
        </ConfirmDialog>
      )}

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{outlets.length} outlet terdaftar</p>
        <button onClick={startAdd} disabled={editingId !== null} className="btn-primary text-sm">+ Tambah Outlet</button>
      </div>
      {error && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-4 py-3 text-left font-medium text-gray-600">Nama Outlet</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">
                Nama di Inventori
                <span className="block text-[10px] font-normal text-gray-400">Cocokkan rekomendasi staff & stok roti</span>
              </th>
              <th className="px-4 py-3 text-center font-medium text-gray-600">
                Min Stok Roti
                <span className="block text-[10px] font-normal text-gray-400">Auto-calc roti tawar</span>
              </th>
              <th className="px-4 py-3 text-center font-medium text-gray-600">Status</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {editingId === 'new' && (
              <tr className="bg-yellow-50">
                <td className="px-4 py-2">
                  <input autoFocus className="input text-sm" placeholder="Nama outlet" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                </td>
                <td className="px-4 py-2">
                  <CabangSelect valueId={form.inventori_branch_id} valueName={form.inventori_cabang_name} onChange={(id, name) => setForm((f) => ({ ...f, inventori_branch_id: id, inventori_cabang_name: name }))} options={inventoriCabangList} />
                </td>
                <td className="px-4 py-2">
                  <input type="number" min="0" className="input text-sm w-24 mx-auto text-center" value={form.min_stock_roti} onChange={(e) => setForm((f) => ({ ...f, min_stock_roti: Number(e.target.value) }))} />
                </td>
                <td />
                <td className="px-4 py-2 text-center">
                  <div className="flex gap-2 justify-center">
                    <button onClick={handleSave} disabled={saving} className="btn-primary text-xs px-3 py-1">{saving ? '...' : 'Simpan'}</button>
                    <button onClick={cancelEdit} className="btn-outline text-xs px-3 py-1">Batal</button>
                  </div>
                </td>
              </tr>
            )}
            {outlets.map((o) =>
              editingId === o.id ? (
                <tr key={o.id} className="bg-yellow-50">
                  <td className="px-4 py-2">
                    <input autoFocus className="input text-sm" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                  </td>
                  <td className="px-4 py-2">
                    <CabangSelect valueId={form.inventori_branch_id} valueName={form.inventori_cabang_name} onChange={(id, name) => setForm((f) => ({ ...f, inventori_branch_id: id, inventori_cabang_name: name }))} options={inventoriCabangList} />
                  </td>
                  <td className="px-4 py-2">
                    <input type="number" min="0" className="input text-sm w-24 mx-auto text-center" value={form.min_stock_roti} onChange={(e) => setForm((f) => ({ ...f, min_stock_roti: Number(e.target.value) }))} />
                  </td>
                  <td />
                  <td className="px-4 py-2 text-center">
                    <div className="flex gap-2 justify-center">
                      <button onClick={handleSave} disabled={saving} className="btn-primary text-xs px-3 py-1">{saving ? '...' : 'Simpan'}</button>
                      <button onClick={cancelEdit} className="btn-outline text-xs px-3 py-1">Batal</button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={o.id} className={`hover:bg-gray-50 ${!o.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-medium text-gray-800">{o.name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {o.inventori_cabang_name || o.inventori_branch_id ? (
                      <span className="inline-flex items-center gap-1">
                        {o.inventori_cabang_name || <span className="text-gray-400 italic">(tanpa nama)</span>}
                        {o.inventori_branch_id ? (
                          <span className="text-[9px] text-green-700 bg-green-50 border border-green-200 px-1 py-px rounded" title="Termapping via ID cabang Inventori">ID ✓</span>
                        ) : (
                          <span className="text-[9px] text-amber-600 bg-amber-50 border border-amber-200 px-1 py-px rounded" title="Hanya cocok via nama — pilih ulang cabang untuk menyimpan ID">nama</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-gray-300 italic">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600 tabular-nums">
                    {o.min_stock_roti ? o.min_stock_roti : <span className="text-gray-300 italic">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => toggleActive(o)} className={`w-10 h-5 rounded-full transition-colors ${o.is_active ? 'bg-green-500' : 'bg-gray-300'}`}>
                      <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${o.is_active ? 'translate-x-5' : ''}`} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex gap-3 justify-center">
                      <button onClick={() => startEdit(o)} className="text-brand-orange text-xs font-medium hover:underline">Edit</button>
                      <button onClick={() => setConfirmDelete(o)} className="text-red-500 text-xs font-medium hover:underline">Hapus</button>
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Konfigurasi Pembelian Modal ────────────────────────────────────────────
// Form lengkap: Outlet → Bahan → Supplier → Satuan Beli / Min Order → Harga.
// Kolom satuan/harga/minimum kosong berarti "ikut master bahan" — hanya
// supplier yang wajib diisi kalau admin cuma mau mengalihkan supplier tanpa
// mengubah aturan pembelian (perilaku lama tetap didukung penuh).
function PurchaseConfigModal({ mapping, outlets, materials, suppliers, allMappings, onClose, onSaved }) {
  const isNew = !mapping;
  const [form, setForm] = useState(() => ({
    outlet_id: mapping?.outlet_id || '',
    material_id: mapping?.material_id || '',
    supplier_id: mapping?.supplier_id || '',
    purchase_unit: mapping?.purchase_unit || '',
    package_qty: mapping?.package_qty ?? '',
    package_unit: mapping?.package_unit || '',
    price_per_purchase_unit: mapping?.price_per_purchase_unit ?? '',
    brand: mapping?.brand || '',
    min_order_qty: mapping?.min_order_qty ?? 1,
    order_multiple: mapping?.order_multiple ?? 1,
    request_basis: mapping?.request_basis || REQUEST_BASIS.PURCHASE_UNIT,
    notes: mapping?.notes || '',
  }));
  const [previewQty, setPreviewQty] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [variantBrands, setVariantBrands] = useState([]);
  // 'select' = pilih dari daftar merk yang sudah ada, 'custom' = ketik manual
  // (dipakai kalau bahan belum punya merk terdaftar sama sekali).
  const [brandMode, setBrandMode] = useState('select');
  useModalDismiss(onClose);

  const selectedMaterial = materials.find((m) => m.id === form.material_id) || null;

  // Ambil merk yang sudah pernah didaftarkan untuk bahan ini lewat tab Bahan
  // Baku (material_variants) — supaya admin tinggal pilih, tidak ketik ulang.
  useEffect(() => {
    if (!form.material_id) { setVariantBrands([]); return; }
    let cancelled = false;
    api.get(`/api/materials/${form.material_id}/variants`)
      .then((res) => {
        if (cancelled) return;
        setVariantBrands((res.data || []).map((v) => v.brand).filter(Boolean));
      })
      .catch(() => { if (!cancelled) setVariantBrands([]); });
    return () => { cancelled = true; };
  }, [form.material_id]);

  // Gabungkan semua sumber merk yang sudah ada untuk bahan ini: merk default
  // bahan (tab Bahan Baku), varian merk bahan tsb, dan merk yang sudah dipakai
  // di mapping outlet lain untuk bahan yang sama — supaya konsisten, bukan
  // hasil ketik ulang yang berbeda-beda (mis. "Wisman" vs "wisman").
  const brandOptions = useMemo(() => {
    if (!form.material_id) return [];
    const set = new Set();
    if (selectedMaterial?.brand) set.add(selectedMaterial.brand);
    variantBrands.forEach((b) => b && set.add(b));
    (allMappings || []).forEach((m) => {
      if (m.material_id === form.material_id && m.brand) set.add(m.brand);
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [form.material_id, selectedMaterial, variantBrands, allMappings]);

  // Sertakan nilai form.brand saat ini (mis. saat edit konfigurasi lama) agar
  // tidak hilang dari daftar walau belum termasuk brandOptions di atas.
  const brandSelectOptions = useMemo(() => {
    const set = new Set(brandOptions);
    if (form.brand) set.add(form.brand);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [brandOptions, form.brand]);

  const effectiveConfig = selectedMaterial
    ? resolvePurchaseConfig(selectedMaterial, {
        is_active: true,
        purchase_unit: form.purchase_unit,
        package_qty: form.package_qty,
        package_unit: form.package_unit,
        price_per_purchase_unit: form.price_per_purchase_unit,
        brand: form.brand,
        min_order_qty: form.min_order_qty,
        order_multiple: form.order_multiple,
        request_basis: form.request_basis,
      })
    : null;

  const preview = effectiveConfig && Number(previewQty) > 0
    ? calculatePurchaseSuggestion(previewQty, effectiveConfig)
    : null;

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    if (!form.outlet_id || !form.material_id || !form.supplier_id) {
      setError('Outlet, bahan, dan supplier wajib dipilih');
      return;
    }
    if (form.package_qty !== '' && !(Number(form.package_qty) > 0)) {
      setError('Isi kemasan harus lebih dari 0');
      return;
    }
    if (!(Number(form.min_order_qty) > 0) || !(Number(form.order_multiple) > 0)) {
      setError('Minimum dan kelipatan pembelian harus lebih dari 0');
      return;
    }

    setSaving(true);
    setError('');
    const payload = {
      outlet_id: form.outlet_id,
      material_id: form.material_id,
      supplier_id: form.supplier_id,
      purchase_unit: form.purchase_unit || null,
      package_qty: form.package_qty === '' ? null : Number(form.package_qty),
      package_unit: form.package_unit || null,
      price_per_purchase_unit: form.price_per_purchase_unit === '' ? null : Number(form.price_per_purchase_unit),
      brand: form.brand || null,
      min_order_qty: Number(form.min_order_qty) || 1,
      order_multiple: Number(form.order_multiple) || 1,
      request_basis: form.request_basis,
      notes: form.notes || null,
    };
    try {
      if (isNew) {
        await api.post('/api/outlet-material-suppliers', payload);
      } else {
        await api.put(`/api/outlet-material-suppliers/${mapping.id}`, payload);
      }
      await onSaved();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-brand-red px-6 py-4 flex items-center justify-between flex-shrink-0 rounded-t-2xl">
          <div>
            <h3 className="text-white font-semibold text-base">
              {isNew ? 'Tambah Konfigurasi Pembelian' : 'Edit Konfigurasi Pembelian'}
            </h3>
            <p className="text-red-200 text-xs mt-0.5">Outlet → Bahan → Supplier → Satuan / Harga</p>
          </div>
          <button onClick={onClose} className="text-white hover:text-red-200 text-2xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

          {/* Outlet / Bahan / Supplier */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Outlet *</label>
              <select className="input text-sm" value={form.outlet_id} onChange={(e) => set('outlet_id', e.target.value)} disabled={!isNew}>
                <option value="">-- Pilih --</option>
                {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Bahan *</label>
              <select className="input text-sm" value={form.material_id} onChange={(e) => set('material_id', e.target.value)} disabled={!isNew}>
                <option value="">-- Pilih --</option>
                {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Supplier *</label>
              <select className="input text-sm" value={form.supplier_id} onChange={(e) => set('supplier_id', e.target.value)}>
                <option value="">-- Pilih --</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          {selectedMaterial && (
            <p className="text-xs text-gray-400 -mt-2">
              Master bahan: {selectedMaterial.purchase_unit}, isi {selectedMaterial.package_qty} {selectedMaterial.package_unit},
              harga {formatRupiah(selectedMaterial.price_per_purchase_unit)}
              {selectedMaterial.brand ? `, merk default ${selectedMaterial.brand}` : ''}.
              Kosongkan field di bawah untuk ikut nilai ini.
            </p>
          )}

          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">Satuan &amp; Konversi (opsional)</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Satuan Beli</label>
                <input className="input text-sm" placeholder={selectedMaterial?.purchase_unit || 'Pack'} value={form.purchase_unit} onChange={(e) => set('purchase_unit', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Isi per Satuan Beli</label>
                <input type="number" min="0" step="any" className="input text-sm" placeholder={String(selectedMaterial?.package_qty ?? 1)} value={form.package_qty} onChange={(e) => set('package_qty', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Satuan Isi (Inventory)</label>
                <input className="input text-sm" placeholder={selectedMaterial?.package_unit || 'Gram'} value={form.package_unit} onChange={(e) => set('package_unit', e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              Contoh: Supplier A jual per Pack, isi 500 Gram — berarti 1 Pack = 500 Gram inventory.
            </p>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">Merk (opsional)</p>
            {brandMode === 'select' ? (
              <div className="flex gap-2">
                <select
                  className="input text-sm flex-1"
                  value={brandSelectOptions.includes(form.brand) ? form.brand : ''}
                  onChange={(e) => {
                    if (e.target.value === '__new__') { setBrandMode('custom'); set('brand', ''); }
                    else set('brand', e.target.value);
                  }}
                >
                  <option value="">-- Ikut merk default bahan --</option>
                  {brandSelectOptions.map((b) => <option key={b} value={b}>{b}</option>)}
                  <option value="__new__">+ Merk baru...</option>
                </select>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  autoFocus
                  className="input text-sm flex-1"
                  placeholder={selectedMaterial?.brand || 'Mis. Wisman, Blue Band, dll'}
                  value={form.brand}
                  onChange={(e) => set('brand', e.target.value)}
                />
                {brandSelectOptions.length > 0 && (
                  <button type="button" onClick={() => setBrandMode('select')} className="btn-outline text-xs px-3 flex-shrink-0">
                    Pilih dari daftar
                  </button>
                )}
              </div>
            )}
            <p className="text-xs text-gray-400 mt-1.5">
              Pilih merk yang sudah pernah dipakai untuk bahan ini (dari tab Bahan Baku atau mapping
              outlet lain), atau ketik merk baru. Supplier berbeda bisa punya merk berbeda walau bahan
              masternya sama.
            </p>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">Harga &amp; Aturan Pembelian</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Harga per Satuan Beli</label>
                <input type="number" min="0" className="input text-sm" placeholder={String(selectedMaterial?.price_per_purchase_unit ?? 0)} value={form.price_per_purchase_unit} onChange={(e) => set('price_per_purchase_unit', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Minimum Pembelian</label>
                <input type="number" min="0" step="any" className="input text-sm" value={form.min_order_qty} onChange={(e) => set('min_order_qty', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Kelipatan Pembelian</label>
                <input type="number" min="0" step="any" className="input text-sm" value={form.order_multiple} onChange={(e) => set('order_multiple', e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              Dalam satuan beli. Mis. minimum 1, kelipatan 1 = boleh beli 1, 2, 3, ... Pack.
            </p>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">Basis Input Order Entry</label>
            <select className="input text-sm" value={form.request_basis} onChange={(e) => set('request_basis', e.target.value)}>
              <option value={REQUEST_BASIS.PURCHASE_UNIT}>Satuan Beli langsung (default) — staff input jumlah {form.purchase_unit || selectedMaterial?.purchase_unit || 'satuan beli'}</option>
              <option value={REQUEST_BASIS.BASE_UNIT}>Kebutuhan Bahan Baku — staff input jumlah {form.package_unit || selectedMaterial?.package_unit || 'satuan inventory'}, sistem konversi otomatis</option>
            </select>
          </div>

          {/* Live preview */}
          {effectiveConfig && (
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Pratinjau Perhitungan</p>
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="number"
                  min="0"
                  className="input text-sm w-40"
                  placeholder={`Kebutuhan (${getRequestUnit(effectiveConfig)})`}
                  value={previewQty}
                  onChange={(e) => setPreviewQty(e.target.value)}
                />
                <span className="text-xs text-gray-400">{getRequestUnit(effectiveConfig)}</span>
              </div>
              {preview && (
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-xs text-purple-800 space-y-1">
                  <p>Beli: <strong>{preview.purchase_qty} {effectiveConfig.purchase_unit}</strong> {preview.rounded_up && <span className="text-purple-500">(dibulatkan dari {preview.raw_purchase_qty})</span>}</p>
                  <p>Masuk inventory: <strong>{preview.base_qty_ordered} {effectiveConfig.package_unit}</strong> {preview.surplus_base_qty > 0 && <span className="text-purple-500">(surplus +{preview.surplus_base_qty})</span>}</p>
                  <p>Estimasi biaya: <strong>{formatRupiah(preview.subtotal)}</strong></p>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Catatan (opsional)</label>
            <textarea className="input text-sm" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 flex-shrink-0">
          <button onClick={onClose} className="btn-outline text-sm">Batal</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">{saving ? 'Menyimpan...' : 'Simpan'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Copy Konfigurasi Antar Outlet Modal ────────────────────────────────────
// Salin semua konfigurasi aktif dari satu outlet sumber ke satu/banyak outlet
// tujuan — dipakai kalau beberapa cabang punya aturan pembelian yang identik
// (mis. outlet baru disetup persis seperti outlet yang sudah ada), supaya
// admin tidak perlu mengetik ulang satu-satu per bahan.
function CopyConfigModal({ outlets, onClose, onCopied }) {
  const [sourceOutletId, setSourceOutletId] = useState('');
  const [targetOutletIds, setTargetOutletIds] = useState([]);
  const [overwrite, setOverwrite] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  useModalDismiss(onClose);

  const toggleTarget = (id) => {
    setTargetOutletIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleCopy = async () => {
    if (!sourceOutletId) { setError('Pilih outlet sumber'); return; }
    if (targetOutletIds.length === 0) { setError('Pilih minimal satu outlet tujuan'); return; }
    setSaving(true);
    setError('');
    setResult(null);
    try {
      const res = await api.post('/api/outlet-material-suppliers/copy', {
        source_outlet_id: sourceOutletId,
        target_outlet_ids: targetOutletIds,
        overwrite,
      });
      setResult(res.data.results || []);
      await onCopied();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-brand-red px-6 py-4 flex items-center justify-between flex-shrink-0 rounded-t-2xl">
          <div>
            <h3 className="text-white font-semibold text-base">Copy Konfigurasi Antar Outlet</h3>
            <p className="text-red-200 text-xs mt-0.5">Salin semua konfigurasi aktif dari satu outlet ke outlet lain</p>
          </div>
          <button onClick={onClose} className="text-white hover:text-red-200 text-2xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Outlet Sumber</label>
            <select
              className="input text-sm"
              value={sourceOutletId}
              onChange={(e) => { setSourceOutletId(e.target.value); setTargetOutletIds([]); setResult(null); }}
            >
              <option value="">-- Pilih outlet sumber --</option>
              {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Outlet Tujuan (bisa pilih lebih dari satu)</label>
            <div className="space-y-1 max-h-48 overflow-y-auto border border-gray-100 rounded-lg p-2">
              {outlets.filter((o) => o.id !== sourceOutletId).length === 0 ? (
                <p className="text-xs text-gray-400 px-2 py-1.5">Pilih outlet sumber dulu</p>
              ) : (
                outlets.filter((o) => o.id !== sourceOutletId).map((o) => (
                  <label key={o.id} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={targetOutletIds.includes(o.id)} onChange={() => toggleTarget(o.id)} />
                    {o.name}
                  </label>
                ))
              )}
            </div>
          </div>

          <label className="flex items-start gap-2 text-xs text-gray-600">
            <input type="checkbox" className="mt-0.5" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
            <span>
              Timpa konfigurasi yang sudah ada di outlet tujuan. Kalau tidak dicentang, bahan yang
              outlet tujuannya sudah punya konfigurasi sendiri akan dilewati (tidak diubah).
            </span>
          </label>

          {result && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-xs text-purple-800 space-y-1">
              {result.map((r) => (
                <p key={r.outlet_id}>
                  <strong>{outlets.find((o) => o.id === r.outlet_id)?.name || r.outlet_id}</strong>:{' '}
                  {r.error ? (
                    <span className="text-red-600">{r.error}</span>
                  ) : (
                    `${r.created} baru dibuat, ${r.updated} ditimpa, ${r.skipped} dilewati`
                  )}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 flex-shrink-0">
          <button onClick={onClose} className="btn-outline text-sm">Tutup</button>
          <button onClick={handleCopy} disabled={saving} className="btn-primary text-sm">
            {saving ? 'Menyalin...' : 'Copy Konfigurasi'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Mapping Supplier per Outlet Tab ────────────────────────────────────────────
// Konfigurasi pembelian per outlet + bahan: supplier, satuan beli, faktor
// konversi ke satuan inventory, harga, minimum, dan kelipatan pembelian —
// dipakai saat hitung PO (Review Order) agar bahan yang sama bisa dipesan
// dengan aturan berbeda tergantung cabang (mis. supplier lain lebih
// dekat/murah, atau menjual kemasan berbeda).
function SupplierMappingTab() {
  const [mappings, setMappings] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalState, setModalState] = useState(null); // null | 'new' | mapping object
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [mapRes, outletRes, matRes, supRes] = await Promise.all([
        api.get('/api/outlet-material-suppliers'),
        api.get('/api/outlets'),
        api.get('/api/materials'),
        api.get('/api/suppliers'),
      ]);
      setMappings(mapRes.data || []);
      setOutlets((outletRes.data || []).filter((o) => o.is_active));
      setMaterials((matRes.data || []).filter((m) => m.is_active));
      setSuppliers((supRes.data || []).filter((s) => s.is_active));
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }

  async function reloadMappings() {
    const res = await api.get('/api/outlet-material-suppliers');
    setMappings(res.data || []);
  }

  const toggleActive = async (m) => {
    await api.put(`/api/outlet-material-suppliers/${m.id}`, { is_active: !m.is_active });
    await reloadMappings();
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError('');
    try {
      await api.delete(`/api/outlet-material-suppliers/${confirmDelete.id}`);
      setConfirmDelete(null);
      await reloadMappings();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setConfirmDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <div className="py-10 text-center text-gray-400">Memuat...</div>;

  return (
    <div>
      {modalState && (
        <PurchaseConfigModal
          mapping={modalState === 'new' ? null : modalState}
          outlets={outlets}
          materials={materials}
          suppliers={suppliers}
          allMappings={mappings}
          onClose={() => setModalState(null)}
          onSaved={reloadMappings}
        />
      )}

      {copyModalOpen && (
        <CopyConfigModal
          outlets={outlets}
          onClose={() => setCopyModalOpen(false)}
          onCopied={reloadMappings}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Hapus Konfigurasi?"
          confirmLabel="Ya, Hapus"
          danger
          loading={deleting}
          loadingLabel="Menghapus..."
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        >
          <p>
            Konfigurasi <strong>{confirmDelete.material?.name}</strong> untuk outlet{' '}
            <strong>{confirmDelete.outlet?.name}</strong> akan dihapus. Bahan ini akan kembali
            memakai supplier dan aturan pembelian default bahan.
          </p>
        </ConfirmDialog>
      )}

      <div className="mb-4 p-3.5 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-800 leading-relaxed">
        Atur supplier, satuan beli, faktor konversi, harga, dan minimum pembelian khusus untuk
        kombinasi outlet + bahan tertentu — misalnya karena supplier lain lebih dekat/murah untuk
        cabang itu, atau menjual kemasan berbeda. Kombinasi yang tidak dikonfigurasi di sini tetap
        memakai aturan default bahan (di tab Bahan Baku).
      </div>

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{mappings.length} konfigurasi terdaftar</p>
        <div className="flex gap-2">
          <button onClick={() => setCopyModalOpen(true)} disabled={outlets.length < 2} className="btn-outline text-sm">
            📋 Copy Antar Outlet
          </button>
          <button onClick={() => setModalState('new')} disabled={materials.length === 0 || outlets.length === 0} className="btn-primary text-sm">
            + Tambah Konfigurasi
          </button>
        </div>
      </div>
      {error && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      <div className="card overflow-hidden">
        <div className="table-wrap">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-3 py-3 text-left font-medium text-gray-600">Outlet</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">Bahan</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">Supplier</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">Merk</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">Satuan Beli</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">Konversi</th>
                <th className="px-3 py-3 text-right font-medium text-gray-600">Harga</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600">Min/Kelipatan</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600">Aktif</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {mappings.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-10 text-gray-400">
                    <p className="text-3xl mb-2">🔀</p>
                    <p className="font-medium">Belum ada konfigurasi pembelian khusus</p>
                    <p className="text-sm mt-1">Klik "+ Tambah Konfigurasi" untuk mengatur per outlet</p>
                  </td>
                </tr>
              ) : (
                mappings.map((m) => {
                  const config = resolvePurchaseConfig(m.material || {}, m);
                  const isCustom = (field) => m[field] !== null && m[field] !== undefined;
                  return (
                    <tr key={m.id} className={`hover:bg-gray-50 ${!m.is_active ? 'opacity-50' : ''}`}>
                      <td className="px-3 py-3 font-medium text-gray-800">{m.outlet?.name || <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-3 text-gray-700">{m.material?.name || <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-3 text-gray-600">{m.supplier?.name || <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-3 text-gray-600">
                        {config.brand || <span className="text-gray-300">—</span>}
                        {config.brand && !isCustom('brand') && <span className="text-gray-300 text-xs ml-1">(default)</span>}
                      </td>
                      <td className="px-3 py-3 text-gray-600">
                        {config.purchase_unit}
                        {!isCustom('purchase_unit') && <span className="text-gray-300 text-xs ml-1">(default)</span>}
                      </td>
                      <td className="px-3 py-3 text-gray-500 text-xs">
                        1 {config.purchase_unit} = {config.package_qty} {config.package_unit}
                      </td>
                      <td className="px-3 py-3 text-right text-gray-600">
                        {formatRupiah(config.price_per_purchase_unit)}
                        {!isCustom('price_per_purchase_unit') && <span className="text-gray-300 text-xs block">(default)</span>}
                      </td>
                      <td className="px-3 py-3 text-center text-gray-500 text-xs">
                        min {config.min_order_qty} / x{config.order_multiple}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <button onClick={() => toggleActive(m)} className={`w-10 h-5 rounded-full transition-colors ${m.is_active ? 'bg-green-500' : 'bg-gray-300'}`}>
                          <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${m.is_active ? 'translate-x-5' : ''}`} />
                        </button>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="flex gap-2 justify-center">
                          <button onClick={() => setModalState(m)} className="text-brand-orange text-xs font-medium hover:underline">Edit</button>
                          <button onClick={() => setConfirmDelete(m)} className="text-red-500 text-xs font-medium hover:underline">Hapus</button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'suppliers', label: 'Supplier' },
  { id: 'materials', label: 'Bahan Baku' },
  { id: 'outlets', label: 'Outlet' },
  { id: 'supplier-mapping', label: 'Mapping Supplier' },
];

export default function MasterData() {
  const [activeTab, setActiveTab] = useState('suppliers');

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1 className="page-title">Master Data</h1>
          <p className="page-subtitle">Kelola supplier, bahan baku, dan outlet</p>
        </div>
      </div>
      <div className="segmented-tabs mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`segmented-tab ${
              activeTab === tab.id ? 'segmented-tab-active' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab === 'suppliers' && <SuppliersTab />}
      {activeTab === 'materials' && <MaterialsTab />}
      {activeTab === 'outlets' && <OutletsTab />}
      {activeTab === 'supplier-mapping' && <SupplierMappingTab />}
    </div>
  );
}
