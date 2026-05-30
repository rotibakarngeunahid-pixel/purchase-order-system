import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Info,
  Loader2,
  Search,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import api, { formatDateID } from '../lib/api';

// ─── Helper ───────────────────────────────────────────────────────────────────

function getToday() {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

/** Label ramah untuk setiap key tabel */
const TABLE_LABELS = {
  order_sessions:                   'Sesi Order',
  order_request_items:              'Permintaan Bahan per Cabang',
  order_outlet_holiday_metadata:    'Metadata Hari Libur Sesi',
  purchase_orders:                  'Catat Penerimaan (Purchase Order)',
  purchase_order_items:             'Item Penerimaan PO',
  purchase_item_branch_distribution:'Distribusi Roti ke Cabang',
  purchase_report:                  'Laporan Barang Masuk',
  report_resets:                    'Catatan Reset Laporan',
  branch_holidays_onetime:          'Hari Libur Spesifik (tanggal tertentu)',
  finance_portal_access_logs:       'Log Akses Portal Keuangan',
};

/** Urutan tampil di tabel preview */
const TABLE_ORDER = [
  'order_sessions',
  'order_request_items',
  'order_outlet_holiday_metadata',
  'purchase_orders',
  'purchase_order_items',
  'purchase_item_branch_distribution',
  'purchase_report',
  'report_resets',
  'branch_holidays_onetime',
  'finance_portal_access_logs',
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div
      className={`fixed right-4 top-4 z-50 max-w-sm rounded-lg px-4 py-3 text-sm text-white shadow-lg ${
        toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'
      }`}
    >
      {toast.message}
    </div>
  );
}

function AlertBox({ type = 'warning', icon: Icon, title, children }) {
  const styles = {
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    danger:  'bg-red-50 border-red-200 text-red-800',
    info:    'bg-blue-50 border-blue-200 text-blue-800',
  };
  return (
    <div className={`rounded-lg border p-4 ${styles[type]}`}>
      <div className="flex gap-3">
        <Icon className="h-5 w-5 flex-shrink-0 mt-0.5" strokeWidth={2.2} />
        <div>
          {title && <p className="font-semibold">{title}</p>}
          <div className="mt-1 text-sm leading-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

function StepBadge({ step, label, active, done }) {
  return (
    <div className={`flex items-center gap-2 ${active ? 'text-brand-red' : done ? 'text-green-600' : 'text-gray-400'}`}>
      <span
        className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          active ? 'bg-brand-red text-white' : done ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
        }`}
      >
        {done ? <CheckCircle2 className="h-4 w-4" /> : step}
      </span>
      <span className={`text-sm font-semibold ${active ? 'text-brand-red' : done ? 'text-green-700' : 'text-gray-400'}`}>
        {label}
      </span>
      {step < 4 && <ChevronRight className="h-4 w-4 text-gray-300" />}
    </div>
  );
}

function PreviewTable({ preview }) {
  const rows = TABLE_ORDER.filter((key) => preview[key] !== undefined);
  return (
    <div className="table-wrap">
      <table className="data-table" style={{ minWidth: '420px' }}>
        <thead>
          <tr>
            <th>Jenis Data</th>
            <th className="num-cell">Jumlah Record</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((key) => (
            <tr key={key}>
              <td className="text-gray-700">{TABLE_LABELS[key] || key}</td>
              <td className={`num-cell font-semibold ${preview[key] > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                {(preview[key] || 0).toLocaleString('id-ID')}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-red-50 border-t-2 border-red-200">
            <td className="px-4 py-2.5 font-bold text-gray-900">Total Record</td>
            <td className="num-cell font-bold text-red-700 text-base">
              {Object.values(preview).reduce((s, v) => s + v, 0).toLocaleString('id-ID')}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function ResultTable({ deleted }) {
  const rows = TABLE_ORDER.filter((key) => deleted[key] !== undefined);
  return (
    <div className="table-wrap">
      <table className="data-table" style={{ minWidth: '420px' }}>
        <thead>
          <tr>
            <th>Jenis Data</th>
            <th className="num-cell">Dihapus</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((key) => (
            <tr key={key}>
              <td className="text-gray-700">{TABLE_LABELS[key] || key}</td>
              <td className={`num-cell font-semibold ${deleted[key] > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                {(deleted[key] || 0).toLocaleString('id-ID')}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-green-50 border-t-2 border-green-200">
            <td className="px-4 py-2.5 font-bold text-gray-900">Total Dihapus</td>
            <td className="num-cell font-bold text-green-700 text-base">
              {Object.values(deleted).reduce((s, v) => s + v, 0).toLocaleString('id-ID')}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DataDeletion() {
  const today = getToday();

  // Input
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');

  // State mesin
  // idle → previewing → preview_ready → deleting → done
  const [stage, setStage] = useState('idle');

  // Data
  const [previewData, setPreviewData]   = useState(null);
  const [resultData, setResultData]     = useState(null);

  // Konfirmasi
  const [confirmChecked, setConfirmChecked] = useState(false);

  // Pesan
  const [toast, setToast]   = useState(null);
  const [error, setError]   = useState('');

  function showToast(message, type = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  function resetAll() {
    setStage('idle');
    setPreviewData(null);
    setResultData(null);
    setConfirmChecked(false);
    setError('');
    setDateFrom('');
    setDateTo('');
  }

  // ── Validasi input ─────────────────────────────────────────────────────────
  function validateDates() {
    if (!dateFrom || !dateTo) {
      return 'Tanggal mulai dan tanggal akhir wajib diisi.';
    }
    if (dateFrom > dateTo) {
      return 'Tanggal mulai tidak boleh lebih besar dari tanggal akhir.';
    }
    if (dateTo > today) {
      return 'Tanggal akhir tidak boleh melebihi tanggal hari ini.';
    }
    return '';
  }

  // ── Preview ────────────────────────────────────────────────────────────────
  async function handlePreview() {
    const validationError = validateDates();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setPreviewData(null);
    setConfirmChecked(false);
    setStage('previewing');

    try {
      const res = await api.post('/api/data-deletion/preview', {
        date_from: dateFrom,
        date_to: dateTo,
      });
      setPreviewData(res.data);
      setStage('preview_ready');
    } catch (err) {
      setError(err.response?.data?.error || 'Gagal memuat preview. Coba lagi.');
      setStage('idle');
    }
  }

  // ── Eksekusi hapus ─────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!confirmChecked) {
      setError('Centang kotak konfirmasi terlebih dahulu sebelum menghapus data.');
      return;
    }
    setError('');
    setStage('deleting');

    try {
      const res = await api.post('/api/data-deletion/execute', {
        date_from: dateFrom,
        date_to: dateTo,
        confirm: true,
      });
      setResultData(res.data);
      setStage('done');
    } catch (err) {
      setError(err.response?.data?.error || 'Gagal menghapus data. Coba lagi.');
      setStage('preview_ready');
    }
  }

  // ── Derived state ──────────────────────────────────────────────────────────
  const totalPreview  = previewData ? Object.values(previewData.preview).reduce((s, v) => s + v, 0) : 0;
  const noDataFound   = stage === 'preview_ready' && totalPreview === 0;
  const canDelete     = stage === 'preview_ready' && totalPreview > 0 && confirmChecked;
  const isDeleting    = stage === 'deleting';
  const isPreviewing  = stage === 'previewing';

  // ── Step indicator ─────────────────────────────────────────────────────────
  const stepDone = {
    1: stage !== 'idle',
    2: stage === 'preview_ready' || stage === 'deleting' || stage === 'done',
    3: stage === 'deleting' || stage === 'done',
    4: stage === 'done',
  };

  return (
    <div className="page-shell max-w-3xl">
      <Toast toast={toast} />

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Trash2 className="h-6 w-6 text-red-600" />
            Hapus Data
          </h1>
          <p className="page-subtitle">
            Hapus data transaksi/operasional berdasarkan rentang tanggal tertentu
          </p>
        </div>
      </div>

      {/* Peringatan master data aman */}
      <AlertBox type="info" icon={Info} title="Master data tidak ikut terhapus">
        Fitur ini menghapus data operasional termasuk{' '}
        <strong>Catat Penerimaan</strong> (PO), input order, dan laporan barang masuk.
        PO di luar rentang tanggal yang dipilih tidak ikut terhapus.
        Data master seperti <strong>Produk, Bahan Baku, Outlet/Cabang, Supplier, dan Pengaturan</strong> tidak
        akan terhapus dalam kondisi apa pun.
      </AlertBox>

      {/* Step indicator */}
      {stage !== 'done' && (
        <div className="card p-4 mt-5 flex flex-wrap items-center gap-3">
          <StepBadge step={1} label="Pilih Tanggal"   active={stage === 'idle'}         done={stepDone[1]} />
          <StepBadge step={2} label="Preview Data"    active={stage === 'previewing' || stage === 'preview_ready'} done={stepDone[2]} />
          <StepBadge step={3} label="Konfirmasi"      active={stage === 'deleting'}     done={stepDone[3]} />
          <StepBadge step={4} label="Selesai"         active={false}                    done={stepDone[4]} />
        </div>
      )}

      {/* Pesan error global */}
      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── STEP 1: Pilih tanggal ─────────────────────────────────────────── */}
      {stage !== 'done' && (
        <div className="card p-5 mt-5">
          <h2 className="font-semibold text-gray-900 mb-4">
            Pilih Rentang Tanggal yang Ingin Dihapus
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="filter-field">
              <label className="filter-label">Tanggal Mulai</label>
              <input
                type="date"
                value={dateFrom}
                max={today}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setError('');
                  if (stage !== 'idle') { setStage('idle'); setPreviewData(null); setConfirmChecked(false); }
                }}
                className="input"
                disabled={isDeleting}
              />
            </div>
            <div className="filter-field">
              <label className="filter-label">Tanggal Akhir</label>
              <input
                type="date"
                value={dateTo}
                max={today}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setError('');
                  if (stage !== 'idle') { setStage('idle'); setPreviewData(null); setConfirmChecked(false); }
                }}
                className="input"
                disabled={isDeleting}
              />
            </div>
          </div>

          <div className="mt-4">
            <button
              onClick={handlePreview}
              disabled={isPreviewing || isDeleting}
              className="btn-primary flex items-center gap-2"
            >
              {isPreviewing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Memuat Preview...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  Tampilkan Preview Data
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Preview ────────────────────────────────────────────────── */}
      {(stage === 'preview_ready' || stage === 'deleting') && previewData && (
        <div className="card p-5 mt-5">
          <h2 className="font-semibold text-gray-900 mb-1">
            Preview Data yang Akan Dihapus
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Periode:{' '}
            <span className="font-semibold text-gray-800">
              {formatDateID(previewData.date_from)} – {formatDateID(previewData.date_to)}
            </span>
          </p>

          {noDataFound ? (
            <div className="rounded-lg bg-gray-50 p-8 text-center">
              <p className="text-gray-500 text-sm">
                Tidak ada data operasional dalam rentang tanggal ini.
                Tidak ada yang perlu dihapus.
              </p>
            </div>
          ) : (
            <>
              <PreviewTable preview={previewData.preview} />

              {/* Peringatan destruktif */}
              <div className="mt-5">
                <AlertBox type="danger" icon={ShieldAlert} title="Peringatan — Data tidak bisa dikembalikan!">
                  <ul className="mt-1 list-disc pl-4 space-y-1">
                    <li>
                      Sebanyak <strong>{totalPreview.toLocaleString('id-ID')} record</strong> akan
                      dihapus secara permanen dari database.
                    </li>
                    <li>Tindakan ini <strong>tidak bisa dibatalkan</strong>.</li>
                    <li>Pastikan Anda sudah yakin sebelum melanjutkan.</li>
                  </ul>
                </AlertBox>
              </div>

              {/* Checkbox konfirmasi */}
              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 hover:bg-red-50 hover:border-red-200 transition-colors">
                <input
                  type="checkbox"
                  checked={confirmChecked}
                  onChange={(e) => {
                    setConfirmChecked(e.target.checked);
                    setError('');
                  }}
                  className="mt-0.5 h-4 w-4 flex-shrink-0 accent-red-600"
                  disabled={isDeleting}
                />
                <span className="text-sm leading-6 text-gray-700">
                  Saya mengerti bahwa data yang dihapus{' '}
                  <strong className="text-red-700">tidak bisa dikembalikan</strong>, dan saya
                  bertanggung jawab atas penghapusan data ini.
                </span>
              </label>

              {/* Tombol hapus */}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  onClick={handleDelete}
                  disabled={!canDelete || isDeleting}
                  className="btn-danger flex items-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Menghapus Data...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4" />
                      Hapus {totalPreview.toLocaleString('id-ID')} Record Sekarang
                    </>
                  )}
                </button>
                <button
                  onClick={() => { setStage('idle'); setPreviewData(null); setConfirmChecked(false); setError(''); }}
                  disabled={isDeleting}
                  className="btn-secondary text-sm"
                >
                  Batal
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── STEP 4: Selesai / Hasil ────────────────────────────────────────── */}
      {stage === 'done' && resultData && (
        <div className="mt-5 space-y-5">
          {/* Kartu sukses */}
          <div className="card p-5">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-green-100">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Penghapusan Data Berhasil</h2>
                <p className="mt-1 text-sm text-gray-600">
                  {resultData.message}
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  Dieksekusi pada:{' '}
                  {new Date(resultData.deleted_at).toLocaleString('id-ID', {
                    day: 'numeric', month: 'long', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
          </div>

          {/* Ringkasan data yang dihapus */}
          <div className="card p-5">
            <h2 className="font-semibold text-gray-900 mb-1">Ringkasan Data yang Dihapus</h2>
            <p className="text-sm text-gray-500 mb-4">
              Periode:{' '}
              <span className="font-semibold text-gray-800">
                {formatDateID(resultData.date_from)} – {formatDateID(resultData.date_to)}
              </span>
            </p>
            <ResultTable deleted={resultData.deleted} />
          </div>

          {/* Tombol hapus data lagi */}
          <div className="flex justify-end">
            <button onClick={resetAll} className="btn-secondary text-sm">
              Hapus Data di Rentang Tanggal Lain
            </button>
          </div>
        </div>
      )}

      {/* Info master data yang aman */}
      <div className="card p-5 mt-5">
        <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-green-600" />
          Data yang Tidak Akan Pernah Dihapus
        </h3>
        <div className="grid gap-2 sm:grid-cols-2 text-sm text-gray-600">
          {[
            'Data Outlet / Cabang',
            'Data Supplier',
            'Data Bahan Baku (Materials)',
            'Data Varian Bahan Baku',
            'Data Pengaturan Sistem',
            'Konfigurasi Portal Keuangan',
            'Hari Libur Mingguan (Berulang)',
          ].map((item) => (
            <div key={item} className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-green-500" />
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
