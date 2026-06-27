import { useEffect, useState } from 'react';
import api, { formatRupiah } from '../lib/api';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import useModalDismiss from '../components/ui/useModalDismiss';

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

// ─── Materials Tab ────────────────────────────────────────────────────────────
function MaterialsTab() {
  const [materials, setMaterials] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [variantsFor, setVariantsFor] = useState(null);

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
                    <td className="px-3 py-3 font-medium text-gray-800">{m.name}</td>
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

function CabangSelect({ value, onChange, options }) {
  if (options.length === 0) {
    return (
      <input
        className="input text-sm"
        placeholder="Nama cabang di sistem inventori (opsional)"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <select
      className="input text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">— Pilih cabang inventori —</option>
      {options.map((c) => (
        <option key={c.cabang_id} value={c.nama_cabang}>{c.nama_cabang}</option>
      ))}
    </select>
  );
}

// ─── Outlets Tab ──────────────────────────────────────────────────────────────
function OutletsTab() {
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: '', inventori_cabang_name: '', min_stock_roti: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [inventoriCabangList, setInventoriCabangList] = useState([]);

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

  const startAdd = () => { setEditingId('new'); setForm({ name: '', inventori_cabang_name: '', min_stock_roti: 0 }); setError(''); };
  const startEdit = (o) => { setEditingId(o.id); setForm({ name: o.name, inventori_cabang_name: o.inventori_cabang_name || '', min_stock_roti: o.min_stock_roti ?? 0 }); setError(''); };
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

  if (loading) return <div className="py-10 text-center text-gray-400">Memuat...</div>;

  return (
    <div>
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
                  <CabangSelect value={form.inventori_cabang_name} onChange={(v) => setForm((f) => ({ ...f, inventori_cabang_name: v }))} options={inventoriCabangList} />
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
                    <CabangSelect value={form.inventori_cabang_name} onChange={(v) => setForm((f) => ({ ...f, inventori_cabang_name: v }))} options={inventoriCabangList} />
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
                    {o.inventori_cabang_name || <span className="text-gray-300 italic">—</span>}
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
                    <button onClick={() => startEdit(o)} className="text-brand-orange text-xs font-medium hover:underline">Edit</button>
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

// ─── Main Page ────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'suppliers', label: 'Supplier' },
  { id: 'materials', label: 'Bahan Baku' },
  { id: 'outlets', label: 'Outlet' },
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
    </div>
  );
}
