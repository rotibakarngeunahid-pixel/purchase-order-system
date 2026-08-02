import { useEffect, useMemo, useState } from 'react';
import { Download, Pencil, Plus, XCircle } from 'lucide-react';
import api, { formatRupiah, formatDateID, toInputDate } from '../lib/api';
import Toast from '../components/ui/Toast';
import useToast from '../components/ui/useToast';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import useModalDismiss from '../components/ui/useModalDismiss';

function getFirstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function EditModal({ purchase, materials, onClose, onSaved, showToast }) {
  const [invoiceNumber, setInvoiceNumber] = useState(purchase.invoice_number || '');
  const [supplierName, setSupplierName] = useState(purchase.supplier_name || '');
  const [notes, setNotes] = useState(purchase.notes || '');
  const [items, setItems] = useState(
    (purchase.items || []).map((i) => ({
      id: i.id, material_id: i.material_id, brand: i.brand || '', unit: i.unit,
      qty: String(i.qty), unit_price: String(i.unit_price), notes: i.notes || '',
    }))
  );
  const [saving, setSaving] = useState(false);
  useModalDismiss(saving ? undefined : onClose);

  function updateItem(idx, patch) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setItems((prev) => [...prev, { material_id: '', brand: '', unit: '', qty: '', unit_price: '', notes: '' }]);
  }

  const grandTotal = useMemo(
    () => items.reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.unit_price) || 0), 0),
    [items]
  );

  async function handleSave() {
    for (const it of items) {
      if (!it.material_id) { showToast('Setiap item wajib memilih bahan baku', 'error'); return; }
      if (!(Number(it.qty) > 0)) { showToast('Kuantitas setiap item harus lebih dari 0', 'error'); return; }
      if (Number(it.unit_price) < 0) { showToast('Harga satuan tidak boleh negatif', 'error'); return; }
    }
    setSaving(true);
    try {
      const res = await api.put(`/api/mitra-purchases/${purchase.id}`, {
        invoice_number: invoiceNumber || null,
        supplier_name: supplierName || null,
        notes: notes || null,
        items: items.map((it) => ({
          id: it.id || null,
          material_id: it.material_id,
          brand: it.brand || null,
          unit: it.unit,
          qty: Number(it.qty),
          unit_price: Number(it.unit_price) || 0,
          notes: it.notes || null,
        })),
      });
      if (res.data.sync_warning) showToast(res.data.sync_warning, 'error');
      else showToast('Perubahan tersimpan & stok POS tersinkron.');
      onSaved();
    } catch (err) {
      showToast('Gagal menyimpan: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="font-semibold text-gray-800">Edit Pembelian Mitra</h3>
          <button onClick={() => !saving && onClose()} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">No. Invoice</label><input className="input text-sm" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} /></div>
            <div><label className="label">Supplier/Toko</label><input className="input text-sm" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} /></div>
          </div>
          <div><label className="label">Catatan</label><textarea className="input text-sm" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Item</label>
              <button type="button" onClick={addItem} className="btn-outline text-xs px-3 py-1.5 flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Tambah Item
              </button>
            </div>
            <p className="text-[11px] text-gray-400 mb-2">Item lama tidak bisa dihapus di sini — jika perlu, batalkan seluruh transaksi.</p>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={it.id || `new-${idx}`} className="border border-gray-200 rounded-lg p-2 space-y-1.5">
                  <div className="grid grid-cols-12 gap-2">
                    <select className="input text-xs col-span-6" value={it.material_id} onChange={(e) => updateItem(idx, { material_id: e.target.value })}>
                      <option value="">— Bahan —</option>
                      {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                    <input className="input text-xs col-span-4" placeholder="Merk" value={it.brand} onChange={(e) => updateItem(idx, { brand: e.target.value })} />
                    <input className="input text-xs col-span-2" placeholder="Satuan" value={it.unit} onChange={(e) => updateItem(idx, { unit: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-12 gap-2">
                    <input type="number" className="input text-xs col-span-3" placeholder="Qty" value={it.qty} onChange={(e) => updateItem(idx, { qty: e.target.value })} />
                    <input type="number" className="input text-xs col-span-3" placeholder="Harga" value={it.unit_price} onChange={(e) => updateItem(idx, { unit_price: e.target.value })} />
                    <input className="input text-xs col-span-6" placeholder="Catatan" value={it.notes} onChange={(e) => updateItem(idx, { notes: e.target.value })} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-gray-100 pt-3">
            <span className="font-semibold text-gray-700">Grand Total</span>
            <span className="font-bold text-brand-red text-lg">{formatRupiah(grandTotal)}</span>
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => !saving && onClose()} disabled={saving} className="btn-outline text-sm">Batal</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">{saving ? 'Menyimpan...' : 'Simpan'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MitraPurchaseReport() {
  const [outlets, setOutlets] = useState([]);
  const [mitraAccounts, setMitraAccounts] = useState([]);
  const [materials, setMaterials] = useState([]);

  const [outletId, setOutletId] = useState('');
  const [mitraAccountId, setMitraAccountId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [dateFrom, setDateFrom] = useState(getFirstOfMonth());
  const [dateTo, setDateTo] = useState(toInputDate());

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const { toast, showToast, hideToast } = useToast();

  useEffect(() => {
    api.get('/api/outlets').then((res) => setOutlets(res.data || [])).catch(() => {});
    api.get('/api/mitra-accounts').then((res) => setMitraAccounts(res.data || [])).catch(() => {});
    api.get('/api/mitra-purchases/materials').then((res) => setMaterials(res.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { loadRecords(); }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outletId, mitraAccountId, supplierName, dateFrom, dateTo]);

  async function loadRecords() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ with_items: 'true' });
      if (outletId) params.set('outlet_id', outletId);
      if (mitraAccountId) params.set('mitra_account_id', mitraAccountId);
      if (supplierName) params.set('supplier_name', supplierName);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      const res = await api.get(`/api/mitra-purchases?${params}`);
      setRecords(res.data || []);
    } catch {
      showToast('Gagal memuat data', 'error');
    } finally {
      setLoading(false);
    }
  }

  const activeRecords = useMemo(() => records.filter((r) => r.status !== 'cancelled'), [records]);
  const totalNominal = useMemo(() => activeRecords.reduce((sum, r) => sum + Number(r.grand_total || 0), 0), [activeRecords]);
  const qtyPerMaterial = useMemo(() => {
    const map = {};
    activeRecords.forEach((r) => {
      (r.items || []).forEach((it) => {
        const name = it.materials?.name || it.material_id;
        const key = `${name}__${it.unit}`;
        if (!map[key]) map[key] = { name, unit: it.unit, qty: 0 };
        map[key].qty += Number(it.qty) || 0;
      });
    });
    return Object.values(map).sort((a, b) => b.qty - a.qty);
  }, [activeRecords]);

  async function handleCancel() {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await api.post(`/api/mitra-purchases/${cancelTarget.id}/cancel`, { reason: cancelReason || null });
      showToast('Transaksi dibatalkan & stok POS di-rollback.');
      setCancelTarget(null);
      setCancelReason('');
      loadRecords();
    } catch (err) {
      showToast('Gagal membatalkan: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setCancelling(false);
    }
  }

  async function exportExcel() {
    try {
      const mod = await import('exceljs');
      const ExcelJS = mod.default || mod;
      const wb = new ExcelJS.Workbook();
      wb.creator = 'RotiBakarNgeunah';
      const sheet = wb.addWorksheet('Pembelian Mitra');
      sheet.columns = [
        { header: 'Tanggal', key: 'date', width: 14 },
        { header: 'Outlet', key: 'outlet', width: 22 },
        { header: 'Mitra', key: 'mitra', width: 20 },
        { header: 'No. Invoice', key: 'invoice', width: 16 },
        { header: 'Supplier/Toko', key: 'supplier', width: 22 },
        { header: 'Bahan', key: 'material', width: 24 },
        { header: 'Merk', key: 'brand', width: 16 },
        { header: 'Qty', key: 'qty', width: 10 },
        { header: 'Satuan', key: 'unit', width: 10 },
        { header: 'Harga Satuan', key: 'price', width: 14 },
        { header: 'Total', key: 'total', width: 14 },
        { header: 'Status', key: 'status', width: 12 },
      ];
      records.forEach((r) => {
        (r.items || []).forEach((it) => {
          sheet.addRow({
            date: r.purchase_date,
            outlet: r.outlets?.name || '',
            mitra: r.mitra_accounts?.full_name || '',
            invoice: r.invoice_number || '',
            supplier: r.supplier_name || '',
            material: it.materials?.name || it.material_id,
            brand: it.brand || '',
            qty: Number(it.qty),
            unit: it.unit,
            price: Number(it.unit_price),
            total: Number(it.total_price),
            status: r.status === 'cancelled' ? 'Dibatalkan' : 'Tercatat',
          });
        });
      });
      sheet.getRow(1).font = { bold: true };
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pembelian_mitra_${dateFrom}_${dateTo}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast('Gagal export Excel: ' + err.message, 'error');
    }
  }

  return (
    <div className="page-shell">
      <Toast toast={toast} onClose={hideToast} />
      {editingPurchase && (
        <EditModal
          purchase={editingPurchase}
          materials={materials}
          showToast={showToast}
          onClose={() => setEditingPurchase(null)}
          onSaved={() => { setEditingPurchase(null); loadRecords(); }}
        />
      )}
      {cancelTarget && (
        <ConfirmDialog
          title="Batalkan Pembelian?"
          danger
          loading={cancelling}
          loadingLabel="Membatalkan..."
          confirmLabel="Ya, Batalkan"
          onConfirm={handleCancel}
          onCancel={() => { setCancelTarget(null); setCancelReason(''); }}
        >
          <p className="mb-3">Stok yang sudah ditambahkan ke POS akan di-rollback. Tindakan ini tidak bisa dibatalkan.</p>
          <input className="input text-sm" placeholder="Alasan pembatalan (opsional)" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
        </ConfirmDialog>
      )}

      <div className="page-header">
        <div>
          <h1 className="page-title">Pembelian Mitra</h1>
          <p className="page-subtitle">Rekap pembelian bahan baku yang dicatat mitra/franchise</p>
        </div>
        <button onClick={exportExcel} className="btn-outline text-sm flex items-center gap-1.5">
          <Download className="w-4 h-4" /> Export Excel
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="card p-4">
          <p className="text-xs text-gray-500">Total Transaksi</p>
          <p className="text-2xl font-bold text-gray-800">{activeRecords.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500">Total Nominal Pembelian</p>
          <p className="text-2xl font-bold text-brand-red">{formatRupiah(totalNominal)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 mb-1">Total Qty per Bahan (Top 5)</p>
          <div className="space-y-0.5">
            {qtyPerMaterial.slice(0, 5).map((m) => (
              <div key={m.name + m.unit} className="flex justify-between text-xs">
                <span className="text-gray-600 truncate">{m.name}</span>
                <span className="font-medium tabular-nums">{m.qty.toLocaleString('id-ID')} {m.unit}</span>
              </div>
            ))}
            {qtyPerMaterial.length === 0 && <p className="text-xs text-gray-300">—</p>}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div>
          <label className="label">Cabang</label>
          <select className="input text-sm" value={outletId} onChange={(e) => setOutletId(e.target.value)}>
            <option value="">Semua</option>
            {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Mitra</label>
          <select className="input text-sm" value={mitraAccountId} onChange={(e) => setMitraAccountId(e.target.value)}>
            <option value="">Semua</option>
            {mitraAccounts.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Supplier/Toko</label>
          <input className="input text-sm" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="cari..." />
        </div>
        <div>
          <label className="label">Dari Tanggal</label>
          <input type="date" className="input text-sm" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">Sampai Tanggal</label>
          <input type="date" className="input text-sm" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="py-10 text-center text-gray-400">Memuat...</div>
        ) : records.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-sm">Belum ada data untuk filter ini.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-left font-medium text-gray-600">Tanggal</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Cabang</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Mitra</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Supplier</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Grand Total</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Sinkron POS</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {records.map((r) => (
                <tr key={r.id} className={`hover:bg-gray-50 ${r.status === 'cancelled' ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">{formatDateID(r.purchase_date)}</td>
                  <td className="px-4 py-3">{r.outlets?.name || '—'}</td>
                  <td className="px-4 py-3">{r.mitra_accounts?.full_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{r.supplier_name || '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatRupiah(r.grand_total)}</td>
                  <td className="px-4 py-3 text-center">
                    {r.sync_status === 'failed' ? (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">Gagal</span>
                    ) : (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">Tersinkron</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {r.status === 'cancelled' ? (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">Dibatalkan</span>
                    ) : (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">Tercatat</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {r.status !== 'cancelled' && (
                      <div className="flex gap-2 justify-center">
                        <button onClick={() => setEditingPurchase(r)} className="text-brand-orange hover:text-brand-red" title="Edit">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => setCancelTarget(r)} className="text-gray-400 hover:text-red-600" title="Batalkan">
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
