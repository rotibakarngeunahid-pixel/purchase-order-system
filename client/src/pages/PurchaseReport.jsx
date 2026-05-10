import { useEffect, useState } from 'react';
import api, { formatRupiah, formatDateID, toInputDate } from '../lib/api';

function getFirstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

let _rowCounter = 0;
function newRow() {
  return {
    _id: ++_rowCounter,
    material_id: '',
    material: null,
    variant_id: '',
    supplier_id: '',
    qty: '',
    unit: '',
    price_per_unit: '',
    notes: '',
  };
}

export default function PurchaseReport() {
  // Master data
  const [outlets, setOutlets] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [allVariants, setAllVariants] = useState([]);

  // Form
  const [outletId, setOutletId] = useState('');
  const [date, setDate] = useState(toInputDate());
  const [rows, setRows] = useState([newRow()]);
  const [submitting, setSubmitting] = useState(false);

  // History
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState(getFirstOfMonth());
  const [dateTo, setDateTo] = useState(toInputDate());
  const [filterOutletId, setFilterOutletId] = useState('');

  const [toast, setToast] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    loadMasterData();
    loadRecords();
  }, []);

  async function loadMasterData() {
    try {
      const [outRes, matRes, supRes, varRes] = await Promise.all([
        api.get('/api/outlets'),
        api.get('/api/materials'),
        api.get('/api/suppliers'),
        api.get('/api/purchase-report/variants'),
      ]);
      setOutlets(outRes.data.filter((o) => o.is_active));
      setMaterials(matRes.data.filter((m) => m.is_active));
      setSuppliers(supRes.data.filter((s) => s.is_active));
      setAllVariants(varRes.data);
    } catch {
      showToast('Gagal memuat master data', 'error');
    }
  }

  async function loadRecords() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      if (filterOutletId) params.set('outlet_id', filterOutletId);
      const res = await api.get(`/api/purchase-report?${params}`);
      setRecords(res.data);
    } catch {
      showToast('Gagal memuat histori', 'error');
    } finally {
      setLoading(false);
    }
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  function variantsForMaterial(materialId) {
    return allVariants.filter((v) => v.material_id === materialId);
  }

  function updateRow(idx, patch) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function onSelectMaterial(idx, materialId) {
    const mat = materials.find((m) => m.id === materialId) || null;
    updateRow(idx, {
      material_id: materialId,
      material: mat,
      variant_id: '',
      unit: mat ? mat.purchase_unit : '',
      price_per_unit: mat ? String(mat.price_per_purchase_unit || '') : '',
      supplier_id: mat?.supplier_id || '',
    });
  }

  function onSelectVariant(idx, variantId) {
    if (!variantId) {
      // Revert to material default price
      const mat = rows[idx]?.material;
      updateRow(idx, {
        variant_id: '',
        price_per_unit: mat ? String(mat.price_per_purchase_unit || '') : '',
        supplier_id: rows[idx]?.material?.supplier_id || '',
      });
      return;
    }
    const variant = allVariants.find((v) => v.id === variantId);
    if (!variant) return;
    updateRow(idx, {
      variant_id: variantId,
      price_per_unit: String(variant.price_per_purchase_unit || ''),
      ...(variant.supplier_id ? { supplier_id: variant.supplier_id } : {}),
    });
  }

  function addRow() {
    setRows((prev) => [...prev, newRow()]);
  }

  function removeRow(idx) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));
  }

  const validRows = rows.filter((r) => r.material_id && Number(r.qty) > 0);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!outletId) { showToast('Pilih outlet terlebih dahulu.', 'error'); return; }
    if (!date) { showToast('Isi tanggal terlebih dahulu.', 'error'); return; }
    if (validRows.length === 0) {
      showToast('Minimal satu bahan harus diisi (pilih bahan & isi qty).', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/api/purchase-report', {
        outlet_id: outletId,
        date,
        items: validRows.map((r) => ({
          material_id: r.material_id,
          variant_id: r.variant_id || null,
          supplier_id: r.supplier_id || null,
          qty: Number(r.qty),
          unit: r.unit,
          price_per_unit: Number(r.price_per_unit) || 0,
          notes: r.notes,
        })),
      });
      showToast(`${validRows.length} item berhasil disimpan!`);
      setRows([newRow()]);
      setOutletId('');
      loadRecords();
    } catch (err) {
      showToast('Gagal menyimpan: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Hapus catatan ini?')) return;
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

  // Group history by date + outlet
  const grouped = records.reduce((acc, r) => {
    const key = `${r.date}__${r.outlet_id}`;
    if (!acc[key]) acc[key] = { date: r.date, outlet: r.outlet, items: [] };
    acc[key].items.push(r);
    return acc;
  }, {});
  const groupedList = Object.values(grouped).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm max-w-sm ${
          toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Laporan Barang Masuk</h1>
        <p className="text-gray-500 text-sm mt-0.5">Catat penerimaan bahan baku per outlet</p>
      </div>

      {/* ── Form Input ── */}
      <form onSubmit={handleSubmit}>
        <div className="card p-5 mb-6">
          {/* Header row */}
          <div className="flex items-center gap-4 mb-5 flex-wrap">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Outlet</label>
              <select
                value={outletId}
                onChange={(e) => setOutletId(e.target.value)}
                className="input text-sm min-w-40"
                required
              >
                <option value="">— Pilih Outlet —</option>
                {outlets.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Tanggal</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input text-sm"
                required
              />
            </div>
          </div>

          {/* Item table */}
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2.5 text-left font-medium text-gray-500 w-8 text-center">#</th>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-500" style={{ minWidth: 180 }}>Bahan</th>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-500" style={{ minWidth: 150 }}>Merk / Varian</th>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-500 w-24">Qty</th>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-500 w-20">Satuan</th>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-500" style={{ minWidth: 140 }}>Harga/Satuan</th>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-500" style={{ minWidth: 160 }}>Supplier</th>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-500" style={{ minWidth: 130 }}>Catatan</th>
                  <th className="w-9" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row, idx) => {
                  const rowVariants = row.material_id ? variantsForMaterial(row.material_id) : [];
                  const subtotal = Number(row.qty || 0) * Number(row.price_per_unit || 0);
                  return (
                    <tr key={row._id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-400 text-center text-xs">{idx + 1}</td>

                      {/* Bahan */}
                      <td className="px-3 py-2">
                        <select
                          value={row.material_id}
                          onChange={(e) => onSelectMaterial(idx, e.target.value)}
                          className="input text-sm w-full"
                        >
                          <option value="">— Pilih bahan —</option>
                          {materials.map((m) => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                      </td>

                      {/* Varian */}
                      <td className="px-3 py-2">
                        {rowVariants.length > 0 ? (
                          <select
                            value={row.variant_id}
                            onChange={(e) => onSelectVariant(idx, e.target.value)}
                            className="input text-sm w-full"
                          >
                            <option value="">Tanpa merk</option>
                            {rowVariants.map((v) => (
                              <option key={v.id} value={v.id}>{v.brand}</option>
                            ))}
                          </select>
                        ) : row.material_id ? (
                          <span className="text-xs text-gray-400 px-2">Tidak ada varian</span>
                        ) : (
                          <span className="text-xs text-gray-300 px-2">—</span>
                        )}
                      </td>

                      {/* Qty */}
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0.01"
                          step="any"
                          value={row.qty}
                          onChange={(e) => updateRow(idx, { qty: e.target.value })}
                          placeholder="0"
                          className="input text-sm w-full text-center"
                        />
                      </td>

                      {/* Satuan (read-only, auto-fill) */}
                      <td className="px-3 py-2">
                        <span className={`text-sm font-medium ${row.unit ? 'text-gray-700' : 'text-gray-300'}`}>
                          {row.unit || '—'}
                        </span>
                      </td>

                      {/* Harga */}
                      <td className="px-3 py-2">
                        <div>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={row.price_per_unit}
                            onChange={(e) => updateRow(idx, { price_per_unit: e.target.value })}
                            placeholder="0"
                            className="input text-sm w-full"
                          />
                          {subtotal > 0 && (
                            <p className="text-xs text-gray-400 mt-0.5 text-right">
                              = {formatRupiah(subtotal)}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Supplier */}
                      <td className="px-3 py-2">
                        <select
                          value={row.supplier_id}
                          onChange={(e) => updateRow(idx, { supplier_id: e.target.value })}
                          className="input text-sm w-full"
                        >
                          <option value="">— Pilih —</option>
                          {suppliers.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </td>

                      {/* Catatan */}
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={row.notes}
                          onChange={(e) => updateRow(idx, { notes: e.target.value })}
                          placeholder="opsional"
                          className="input text-sm w-full"
                        />
                      </td>

                      {/* Delete row */}
                      <td className="px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeRow(idx)}
                          disabled={rows.length === 1}
                          className="text-gray-300 hover:text-red-500 transition-colors text-xl leading-none disabled:opacity-30"
                          title="Hapus baris"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Subtotal footer */}
              {validRows.length > 0 && (
                <tfoot>
                  <tr className="bg-orange-50 border-t-2 border-orange-200">
                    <td colSpan={5} className="px-3 py-2.5 text-right text-sm font-semibold text-gray-700">
                      Total ({validRows.length} item):
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-brand-red text-sm">
                      {formatRupiah(
                        validRows.reduce((s, r) => s + Number(r.qty || 0) * Number(r.price_per_unit || 0), 0)
                      )}
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <div className="flex items-center justify-between mt-4">
            <button type="button" onClick={addRow} className="btn-secondary text-sm">
              + Tambah Bahan
            </button>
            <button
              type="submit"
              disabled={submitting || validRows.length === 0}
              className="btn-primary"
            >
              {submitting
                ? 'Menyimpan...'
                : `Simpan ${validRows.length > 0 ? `(${validRows.length} item)` : ''}`}
            </button>
          </div>
        </div>
      </form>

      {/* ── Histori ── */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center gap-3 flex-wrap">
          <h2 className="font-semibold text-gray-800 flex-1">Histori Barang Masuk</h2>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 whitespace-nowrap">Outlet:</label>
            <select
              value={filterOutletId}
              onChange={(e) => setFilterOutletId(e.target.value)}
              className="input text-sm w-auto"
            >
              <option value="">Semua</option>
              {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 whitespace-nowrap">Dari:</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input text-sm w-auto" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 whitespace-nowrap">Sampai:</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input text-sm w-auto" />
          </div>
          <button onClick={loadRecords} disabled={loading} className="btn-primary text-sm">
            {loading ? 'Memuat...' : 'Terapkan'}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
          </div>
        ) : groupedList.length === 0 ? (
          <div className="p-10 text-center text-gray-400">
            <p className="text-4xl mb-3">📦</p>
            <p>Belum ada catatan dalam rentang tanggal ini</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {groupedList.map((group) => {
              const groupTotal = group.items.reduce(
                (s, r) => s + Number(r.qty || 0) * Number(r.price_per_unit || 0),
                0
              );
              return (
                <div key={`${group.date}__${group.outlet?.id}`}>
                  {/* Group header */}
                  <div className="px-4 py-2.5 bg-gray-50 flex items-center gap-3 flex-wrap">
                    <span className="font-semibold text-sm text-brand-red">{group.outlet?.name}</span>
                    <span className="text-gray-400 text-xs">•</span>
                    <span className="text-gray-600 text-sm">{formatDateID(group.date)}</span>
                    <span className="text-gray-400 text-xs ml-auto">{group.items.length} item</span>
                    {groupTotal > 0 && (
                      <span className="text-sm font-semibold text-gray-700">{formatRupiah(groupTotal)}</span>
                    )}
                  </div>

                  {/* Items */}
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-gray-50">
                      {group.items.map((r) => {
                        const subtotal = Number(r.qty || 0) * Number(r.price_per_unit || 0);
                        return (
                          <tr key={r.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2.5 font-medium text-gray-800">
                              {r.material?.name}
                              {r.variant && (
                                <span className="ml-2 text-xs bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">
                                  {r.variant.brand}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <span className="font-semibold text-brand-red">{r.qty}</span>
                              <span className="text-gray-500 ml-1 text-xs">{r.unit}</span>
                            </td>
                            <td className="px-4 py-2.5 text-right text-gray-500 text-xs">
                              {r.price_per_unit > 0 ? formatRupiah(r.price_per_unit) + '/sat' : '—'}
                            </td>
                            <td className="px-4 py-2.5 text-right font-semibold text-gray-700">
                              {subtotal > 0 ? formatRupiah(subtotal) : '—'}
                            </td>
                            <td className="px-4 py-2.5 text-gray-500 text-xs">{r.supplier?.name || '—'}</td>
                            <td className="px-4 py-2.5 text-gray-400 text-xs max-w-xs truncate">
                              {r.notes || ''}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <button
                                onClick={() => handleDelete(r.id)}
                                disabled={deletingId === r.id}
                                className="text-gray-300 hover:text-red-500 transition-colors text-xl leading-none"
                                title="Hapus"
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
