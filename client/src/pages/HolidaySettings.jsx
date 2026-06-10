import { useEffect, useState } from 'react';
import { Calendar, Plus, Pencil, Trash2, AlertCircle, Loader2, RefreshCw, Repeat } from 'lucide-react';
import api, { formatDateID } from '../lib/api';
import { getHolidays, createHoliday, updateHoliday, deleteHoliday, DAY_NAMES } from '../services/holidayService';

// ─── Form Modal ───────────────────────────────────────────────────────────────
function HolidayFormModal({ outlets, initial, onClose, onSaved }) {
  const isEdit = !!initial;
  const [form, setForm] = useState({
    outlet_id:       initial?.outlet_id ?? '',
    recurrence_type: initial?.recurrence_type ?? 'none',
    holiday_date:    initial?.holiday_date ?? '',
    day_of_week:     initial?.day_of_week != null ? String(initial.day_of_week) : '',
    holiday_name:    initial?.holiday_name ?? '',
    note:            initial?.note ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.outlet_id) { setError('Pilih cabang terlebih dahulu'); return; }
    if (form.recurrence_type === 'none' && !form.holiday_date) {
      setError('Tanggal libur wajib diisi'); return;
    }
    if (form.recurrence_type === 'weekly' && form.day_of_week === '') {
      setError('Pilih hari dalam seminggu'); return;
    }

    setSaving(true);
    setError(null);
    try {
      let result;
      if (isEdit) {
        result = await updateHoliday(initial.id, {
          holiday_name: form.holiday_name,
          note: form.note,
        });
      } else {
        result = await createHoliday({
          outlet_id:       form.outlet_id,
          recurrence_type: form.recurrence_type,
          holiday_date:    form.recurrence_type === 'none' ? form.holiday_date : undefined,
          day_of_week:     form.recurrence_type === 'weekly' ? Number(form.day_of_week) : undefined,
          holiday_name:    form.holiday_name || undefined,
          note:            form.note || undefined,
        });
      }
      onSaved(result);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
        <div className="bg-brand-red px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div>
            <h3 className="text-white font-semibold text-lg">
              {isEdit ? 'Edit Hari Libur' : 'Tambah Hari Libur'}
            </h3>
            <p className="text-red-200 text-sm">
              {isEdit ? 'Ubah catatan hari libur cabang' : 'Daftarkan hari libur untuk cabang tertentu'}
            </p>
          </div>
          <button onClick={onClose} className="text-white hover:text-red-200 text-2xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Cabang */}
          <div>
            <label className="label">Cabang *</label>
            <select
              className="input"
              value={form.outlet_id}
              onChange={(e) => set('outlet_id', e.target.value)}
              disabled={isEdit}
              required
            >
              <option value="">Pilih cabang...</option>
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>

          {/* Tipe Libur */}
          {!isEdit && (
            <div>
              <label className="label">Tipe Libur *</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'none', label: 'Tanggal Tertentu', desc: 'Libur pada 1 tanggal spesifik' },
                  { value: 'weekly', label: 'Mingguan', desc: 'Libur setiap hari yang sama tiap minggu' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set('recurrence_type', opt.value)}
                    className={`text-left p-3 rounded-lg border-2 transition-colors ${
                      form.recurrence_type === opt.value
                        ? 'border-brand-red bg-red-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className={`text-sm font-medium ${
                      form.recurrence_type === opt.value ? 'text-brand-red' : 'text-gray-700'
                    }`}>{opt.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tanggal (untuk one-time) */}
          {form.recurrence_type === 'none' && (
            <div>
              <label className="label">Tanggal Libur *</label>
              <input
                type="date"
                className="input"
                value={form.holiday_date}
                onChange={(e) => set('holiday_date', e.target.value)}
                disabled={isEdit}
                required
              />
            </div>
          )}

          {/* Hari dalam seminggu (untuk weekly) */}
          {form.recurrence_type === 'weekly' && (
            <div>
              <label className="label">Hari Libur *</label>
              {!isEdit ? (
                <div className="grid grid-cols-4 gap-1.5">
                  {DAY_NAMES.map((name, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => set('day_of_week', String(idx))}
                      className={`py-2 rounded-lg text-xs font-medium border transition-colors ${
                        form.day_of_week === String(idx)
                          ? 'bg-brand-red text-white border-brand-red'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="input bg-gray-50 text-gray-600">
                  Setiap {DAY_NAMES[initial?.day_of_week]}
                </div>
              )}
            </div>
          )}

          {/* Nama / Keterangan */}
          <div>
            <label className="label">Nama / Keterangan Libur</label>
            <input
              type="text"
              className="input"
              value={form.holiday_name}
              onChange={(e) => set('holiday_name', e.target.value)}
              placeholder="Contoh: Renovasi, Libur Lokal, Tutup Mingguan"
            />
          </div>

          <div>
            <label className="label">Catatan Tambahan</label>
            <textarea
              className="input resize-none"
              rows={2}
              value={form.note}
              onChange={(e) => set('note', e.target.value)}
              placeholder="Opsional"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Batal</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Menyimpan...
                </span>
              ) : (
                isEdit ? 'Simpan Perubahan' : 'Tambah Hari Libur'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────
function DeleteConfirmModal({ holiday, onClose, onConfirm, deleting }) {
  const label = holiday.recurrence_type === 'weekly'
    ? `Setiap ${DAY_NAMES[holiday.day_of_week]}`
    : formatDateID(holiday.holiday_date);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="font-semibold text-gray-800 text-lg mb-2">Nonaktifkan Hari Libur?</h3>
        <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
          <p className="font-medium text-gray-800">{holiday.outlet?.name}</p>
          <p className="text-gray-600">{label}</p>
          {holiday.holiday_name && <p className="text-gray-500">{holiday.holiday_name}</p>}
        </div>
        <p className="text-xs text-gray-400 mb-5">
          Data tidak dihapus permanen. Hari ini tidak lagi dianggap libur saat order dibuat.
        </p>
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="btn-secondary" disabled={deleting}>Batal</button>
          <button onClick={onConfirm} disabled={deleting} className="btn-danger">
            {deleting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Menghapus...
              </span>
            ) : 'Nonaktifkan'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Label tanggal/hari untuk satu baris holiday ──────────────────────────────
function HolidayDateLabel({ holiday }) {
  if (holiday.recurrence_type === 'weekly') {
    return (
      <span className="flex items-center gap-1">
        <Repeat className="w-3 h-3 text-blue-500 flex-shrink-0" />
        <span>Setiap {DAY_NAMES[holiday.day_of_week]}</span>
      </span>
    );
  }
  return <span>{formatDateID(holiday.holiday_date)}</span>;
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function HolidaySettings() {
  const [outlets, setOutlets] = useState([]);
  const [selectedOutletId, setSelectedOutletId] = useState('');
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState(null);
  const [deletingHoliday, setDeletingHoliday] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    api.get('/api/outlets').then((res) => {
      setOutlets(res.data.filter((o) => o.is_active));
    });
  }, []);

  useEffect(() => { loadHolidays(); }, [selectedOutletId, showInactive]);

  async function loadHolidays() {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (selectedOutletId) params.outlet_id = selectedOutletId;
      if (!showInactive) params.is_active = true;
      const data = await getHolidays(params);
      setHolidays(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Gagal memuat data hari libur. Coba lagi.');
    } finally {
      setLoading(false);
    }
  }

  const handleSaved = () => { setShowForm(false); setEditingHoliday(null); loadHolidays(); };

  const handleDeleteConfirm = async () => {
    if (!deletingHoliday) return;
    setDeleteLoading(true);
    try {
      await deleteHoliday(deletingHoliday.id);
      setDeletingHoliday(null);
      loadHolidays();
    } catch (err) {
      setDeletingHoliday(null);
      setError(err.response?.data?.error || 'Gagal menghapus. Coba lagi.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleReactivate = async (h) => {
    setError(null);
    try {
      await updateHoliday(h.id, { is_active: true });
      loadHolidays();
    } catch (err) {
      setError(err.response?.data?.error || 'Gagal mengaktifkan. Coba lagi.');
    }
  };

  const outletName = selectedOutletId ? outlets.find((o) => o.id === selectedOutletId)?.name : null;

  // Pisahkan weekly dan one-time untuk ditampilkan
  const weekly  = holidays.filter((h) => h.recurrence_type === 'weekly');
  const onetime = holidays.filter((h) => h.recurrence_type === 'none');

  return (
    <div className="page-shell max-w-3xl">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Calendar className="w-6 h-6 text-brand-red" />
            Hari Libur Cabang
          </h1>
          <p className="page-subtitle">
            Atur hari libur per cabang — tanggal tertentu atau berulang setiap minggu
          </p>
        </div>
        <button
          onClick={() => { setEditingHoliday(null); setShowForm(true); }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Tambah Hari Libur
        </button>
      </div>

      {/* Filter */}
      <div className="card p-4 mb-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-48">
          <label className="label mb-1">Filter Cabang</label>
          <select
            className="input"
            value={selectedOutletId}
            onChange={(e) => setSelectedOutletId(e.target.value)}
          >
            <option value="">Semua Cabang</option>
            {outlets.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <input
            id="show-inactive"
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded border-gray-300"
          />
          <label htmlFor="show-inactive" className="text-sm text-gray-600 cursor-pointer whitespace-nowrap">
            Tampilkan nonaktif
          </label>
        </div>
        <button onClick={loadHolidays} className="btn-outline flex items-center gap-1.5 text-sm" title="Refresh">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Content */}
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
          <p className="text-sm font-semibold text-gray-700">
            {outletName ? `Hari Libur — ${outletName}` : 'Semua Hari Libur'}
          </p>
          <p className="text-xs text-gray-400">{holidays.length} data</p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-brand-red animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <AlertCircle className="w-8 h-8 text-red-400" />
            <p className="text-sm text-red-600">{error}</p>
            <button onClick={loadHolidays} className="btn-secondary text-sm">Coba Lagi</button>
          </div>
        )}

        {!loading && !error && holidays.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Calendar className="w-10 h-10 text-gray-200" />
            <p className="text-sm text-gray-500">
              {outletName ? `Belum ada hari libur untuk cabang ${outletName}.` : 'Belum ada hari libur yang terdaftar.'}
            </p>
            <button
              onClick={() => { setEditingHoliday(null); setShowForm(true); }}
              className="btn-secondary text-sm flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Tambah Sekarang
            </button>
          </div>
        )}

        {!loading && !error && holidays.length > 0 && (
          <div className="overflow-x-auto">
            {/* Weekly section */}
            {weekly.length > 0 && (
              <>
                <div className="px-5 py-2 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
                  <Repeat className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-xs font-semibold text-blue-700 uppercase">Berulang Setiap Minggu</span>
                </div>
                <HolidayTable
                  rows={weekly}
                  onEdit={(h) => { setEditingHoliday(h); setShowForm(true); }}
                  onDelete={setDeletingHoliday}
                  onReactivate={handleReactivate}
                />
              </>
            )}
            {/* One-time section */}
            {onetime.length > 0 && (
              <>
                {weekly.length > 0 && (
                  <div className="px-5 py-2 bg-gray-50 border-b border-gray-100">
                    <span className="text-xs font-semibold text-gray-500 uppercase">Tanggal Tertentu</span>
                  </div>
                )}
                <HolidayTable
                  rows={onetime}
                  onEdit={(h) => { setEditingHoliday(h); setShowForm(true); }}
                  onDelete={setDeletingHoliday}
                  onReactivate={handleReactivate}
                />
              </>
            )}
          </div>
        )}
      </div>

      {showForm && (
        <HolidayFormModal
          outlets={outlets}
          initial={editingHoliday}
          onClose={() => { setShowForm(false); setEditingHoliday(null); }}
          onSaved={handleSaved}
        />
      )}
      {deletingHoliday && (
        <DeleteConfirmModal
          holiday={deletingHoliday}
          onClose={() => setDeletingHoliday(null)}
          onConfirm={handleDeleteConfirm}
          deleting={deleteLoading}
        />
      )}
    </div>
  );
}

// ─── Tabel shared ─────────────────────────────────────────────────────────────
function HolidayTable({ rows, onEdit, onDelete, onReactivate }) {
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-gray-100">
        <tr>
          <th className="text-left px-5 py-3 font-medium text-gray-500">Jadwal</th>
          <th className="text-left px-4 py-3 font-medium text-gray-500">Cabang</th>
          <th className="text-left px-4 py-3 font-medium text-gray-500">Keterangan</th>
          <th className="text-center px-4 py-3 font-medium text-gray-500">Status</th>
          <th className="text-right px-5 py-3 font-medium text-gray-500">Aksi</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {rows.map((h) => (
          <tr key={h.id} className={`hover:bg-gray-50/60 transition-colors ${!h.is_active ? 'opacity-50' : ''}`}>
            <td className="px-5 py-3 font-medium text-gray-800 whitespace-nowrap">
              <HolidayDateLabel holiday={h} />
            </td>
            <td className="px-4 py-3 text-gray-700">{h.outlet?.name || '—'}</td>
            <td className="px-4 py-3 text-gray-500">
              {h.holiday_name || <span className="italic text-gray-300">—</span>}
              {h.note && <p className="text-xs text-gray-400 mt-0.5">{h.note}</p>}
            </td>
            <td className="px-4 py-3 text-center">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                h.is_active ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {h.is_active ? 'Aktif' : 'Nonaktif'}
              </span>
            </td>
            <td className="px-5 py-3 text-right">
              <div className="flex items-center justify-end gap-2">
                {h.is_active ? (
                  <>
                    <button
                      onClick={() => onEdit(h)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-brand-red hover:bg-red-50 transition-colors"
                      title="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onDelete(h)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Nonaktifkan"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => onReactivate(h)}
                    className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-500 hover:border-brand-red hover:text-brand-red transition-colors"
                  >
                    Aktifkan
                  </button>
                )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
