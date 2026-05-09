import { useEffect, useState } from 'react';
import api, { formatRupiah } from '../lib/api';

// ─── Suppliers Tab ───────────────────────────────────────────────────────────
function SuppliersTab() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: '', wa_number: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { loadSuppliers(); }, []);

  async function loadSuppliers() {
    setLoading(true);
    const res = await api.get('/api/suppliers');
    setSuppliers(res.data);
    setLoading(false);
  }

  const startAdd = () => {
    setEditingId('new');
    setForm({ name: '', wa_number: '' });
    setError('');
  };

  const startEdit = (s) => {
    setEditingId(s.id);
    setForm({ name: s.name, wa_number: s.wa_number });
    setError('');
  };

  const cancelEdit = () => { setEditingId(null); setError(''); };

  const handleSave = async () => {
    if (!form.name.trim() || !form.wa_number.trim()) {
      setError('Nama dan nomor WA wajib diisi');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editingId === 'new') {
        await api.post('/api/suppliers', form);
      } else {
        await api.put(`/api/suppliers/${editingId}`, form);
      }
      setEditingId(null);
      await loadSuppliers();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (supplier) => {
    await api.put(`/api/suppliers/${supplier.id}`, { is_active: !supplier.is_active });
    await loadSuppliers();
  };

  if (loading) return <div className="py-10 text-center text-gray-400">Memuat...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{suppliers.length} supplier terdaftar</p>
        <button onClick={startAdd} disabled={editingId !== null} className="btn-primary text-sm">
          + Tambah Supplier
        </button>
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
            {/* Add row */}
            {editingId === 'new' && (
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
            )}
            {suppliers.map((s) => (
              <tr key={s.id} className={`hover:bg-gray-50 ${!s.is_active ? 'opacity-50' : ''}`}>
                {editingId === s.id ? (
                  <>
                    <td className="px-4 py-2">
                      <input
                        autoFocus
                        className="input text-sm"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        className="input text-sm"
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
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 font-medium text-gray-800">{s.name}</td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">{s.wa_number}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleActive(s)}
                        className={`w-10 h-5 rounded-full transition-colors ${s.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
                      >
                        <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${s.is_active ? 'translate-x-5' : ''}`} />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => startEdit(s)} className="text-brand-orange text-xs font-medium hover:underline">
                        Edit
                      </button>
                    </td>
                  </>
                )}
              </tr>
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

  const emptyForm = {
    code: '', name: '', brand: '', supplier_id: '',
    package_qty: 1, package_unit: 'Pcs', purchase_unit: 'Pcs', price_per_purchase_unit: 0,
  };
  const [form, setForm] = useState(emptyForm);

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
    setForm({
      code: m.code, name: m.name, brand: m.brand || '', supplier_id: m.supplier_id || '',
      package_qty: m.package_qty, package_unit: m.package_unit, purchase_unit: m.purchase_unit,
      price_per_purchase_unit: m.price_per_purchase_unit,
    });
    setError('');
  };
  const cancelEdit = () => { setEditingId(null); setError(''); };

  const handleSave = async () => {
    if (!form.code || !form.name || !form.purchase_unit) {
      setError('Kode, nama, dan satuan beli wajib diisi');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, supplier_id: form.supplier_id || null };
      if (editingId === 'new') {
        await api.post('/api/materials', payload);
      } else {
        await api.put(`/api/materials/${editingId}`, payload);
      }
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

  const setF = (field, val) => setForm((f) => ({ ...f, [field]: val }));

  if (loading) return <div className="py-10 text-center text-gray-400">Memuat...</div>;

  const EditRow = ({ mat }) => (
    <tr className="bg-yellow-50">
      <td className="px-2 py-2"><input className="input text-xs" value={form.code} onChange={(e) => setF('code', e.target.value)} placeholder="BHN01" /></td>
      <td className="px-2 py-2"><input className="input text-xs" value={form.name} onChange={(e) => setF('name', e.target.value)} placeholder="Nama bahan" /></td>
      <td className="px-2 py-2"><input className="input text-xs" value={form.brand} onChange={(e) => setF('brand', e.target.value)} placeholder="Merk" /></td>
      <td className="px-2 py-2">
        <select className="input text-xs" value={form.supplier_id} onChange={(e) => setF('supplier_id', e.target.value)}>
          <option value="">-- Pilih Supplier --</option>
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
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{materials.length} bahan terdaftar</p>
        <button onClick={startAdd} disabled={editingId !== null} className="btn-primary text-sm">
          + Tambah Bahan
        </button>
      </div>

      {error && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: '900px' }}>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-3 py-3 text-left font-medium text-gray-600">Kode</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">Nama</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">Merk</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">Supplier</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600">Isi Kemasan</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600">Sat. Kemasan</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600">Sat. Beli</th>
                <th className="px-3 py-3 text-right font-medium text-gray-600">Harga/Sat</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600">Status</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {editingId === 'new' && <EditRow />}
              {materials.map((m) => (
                editingId === m.id ? <EditRow key={m.id} mat={m} /> : (
                  <tr key={m.id} className={`hover:bg-gray-50 ${!m.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-3 py-3 font-mono text-xs text-gray-600">{m.code}</td>
                    <td className="px-3 py-3 font-medium text-gray-800">{m.name}</td>
                    <td className="px-3 py-3 text-gray-500 text-xs">{m.brand || '—'}</td>
                    <td className="px-3 py-3 text-gray-600">{m.supplier?.name || '—'}</td>
                    <td className="px-3 py-3 text-center text-gray-600">{m.package_qty}</td>
                    <td className="px-3 py-3 text-center text-gray-600">{m.package_unit}</td>
                    <td className="px-3 py-3 text-center font-medium text-brand-orange">{m.purchase_unit}</td>
                    <td className="px-3 py-3 text-right text-gray-800">{formatRupiah(m.price_per_purchase_unit)}</td>
                    <td className="px-3 py-3 text-center">
                      <button
                        onClick={() => toggleActive(m)}
                        className={`w-10 h-5 rounded-full transition-colors ${m.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
                      >
                        <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${m.is_active ? 'translate-x-5' : ''}`} />
                      </button>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <button onClick={() => startEdit(m)} className="text-brand-orange text-xs font-medium hover:underline">
                        Edit
                      </button>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Outlets Tab ──────────────────────────────────────────────────────────────
function OutletsTab() {
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { loadOutlets(); }, []);

  async function loadOutlets() {
    setLoading(true);
    const res = await api.get('/api/outlets');
    setOutlets(res.data);
    setLoading(false);
  }

  const startAdd = () => { setEditingId('new'); setForm({ name: '' }); setError(''); };
  const startEdit = (o) => { setEditingId(o.id); setForm({ name: o.name }); setError(''); };
  const cancelEdit = () => { setEditingId(null); setError(''); };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Nama outlet wajib diisi'); return; }
    setSaving(true);
    setError('');
    try {
      if (editingId === 'new') {
        await api.post('/api/outlets', form);
      } else {
        await api.put(`/api/outlets/${editingId}`, form);
      }
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
        <button onClick={startAdd} disabled={editingId !== null} className="btn-primary text-sm">
          + Tambah Outlet
        </button>
      </div>

      {error && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      <div className="card overflow-hidden max-w-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-4 py-3 text-left font-medium text-gray-600">Nama Outlet</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600">Status</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {editingId === 'new' && (
              <tr className="bg-yellow-50">
                <td className="px-4 py-2">
                  <input
                    autoFocus
                    className="input text-sm"
                    placeholder="Nama outlet"
                    value={form.name}
                    onChange={(e) => setForm({ name: e.target.value })}
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
            )}
            {outlets.map((o) => (
              <tr key={o.id} className={`hover:bg-gray-50 ${!o.is_active ? 'opacity-50' : ''}`}>
                {editingId === o.id ? (
                  <>
                    <td className="px-4 py-2">
                      <input
                        autoFocus
                        className="input text-sm"
                        value={form.name}
                        onChange={(e) => setForm({ name: e.target.value })}
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
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 font-medium text-gray-800">{o.name}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleActive(o)}
                        className={`w-10 h-5 rounded-full transition-colors ${o.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
                      >
                        <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${o.is_active ? 'translate-x-5' : ''}`} />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => startEdit(o)} className="text-brand-orange text-xs font-medium hover:underline">
                        Edit
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main MasterData Page ─────────────────────────────────────────────────────
const TABS = [
  { id: 'suppliers', label: '🏭 Supplier' },
  { id: 'materials', label: '🧂 Bahan Baku' },
  { id: 'outlets', label: '🏪 Outlet' },
];

export default function MasterData() {
  const [activeTab, setActiveTab] = useState('suppliers');

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Master Data</h1>
        <p className="text-gray-500 text-sm mt-0.5">Kelola supplier, bahan baku, dan outlet</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white text-brand-red shadow-sm'
                : 'text-gray-600 hover:text-gray-800'
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
