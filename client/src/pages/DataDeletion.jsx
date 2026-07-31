import { useEffect, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  Info,
  ListChecks,
  Loader2,
  Search,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import api, { formatDateID, toInputDate } from '../lib/api';
import Toast from '../components/ui/Toast';
import useToast from '../components/ui/useToast';
import ConfirmDialog from '../components/ui/ConfirmDialog';

// ─── Helper ───────────────────────────────────────────────────────────────────

function getToday() {
  // Tanggal WITA, konsisten dengan zona waktu operasional
  return toInputDate();
}

/** Label ramah untuk setiap key tabel hasil preview/eksekusi */
const TABLE_LABELS = {
  order_sessions: 'Sesi Order',
  order_request_items: 'Permintaan Bahan per Cabang',
  order_outlet_holiday_metadata: 'Metadata Hari Libur Sesi',
  purchase_orders: 'Catat Penerimaan (Purchase Order)',
  purchase_order_items: 'Item Penerimaan PO',
  purchase_item_branch_distribution: 'Distribusi Roti ke Cabang',
  purchase_report: 'Laporan Barang Masuk',
  report_resets: 'Catatan Reset Laporan',
  material_price_logs: 'Log Harga Bahan',
  distribution_photos: 'Foto Distribusi',
  branch_holidays_onetime: 'Hari Libur Spesifik (tanggal tertentu)',
  finance_portal_access_logs: 'Log Akses Portal Keuangan',
};

/** Urutan tampil di tabel preview/hasil */
const TABLE_ORDER = [
  'order_sessions',
  'order_request_items',
  'order_outlet_holiday_metadata',
  'purchase_orders',
  'purchase_order_items',
  'purchase_item_branch_distribution',
  'purchase_report',
  'report_resets',
  'material_price_logs',
  'distribution_photos',
  'branch_holidays_onetime',
  'finance_portal_access_logs',
];

// ─── Sub-components ───────────────────────────────────────────────────────────

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

function CountTable({ counts, highlight }) {
  const rows = TABLE_ORDER.filter((key) => counts[key] !== undefined);
  return (
    <div className="table-wrap">
      <table className="data-table" style={{ minWidth: '420px' }}>
        <thead>
          <tr>
            <th>Jenis Data</th>
            <th className="num-cell">{highlight === 'delete' ? 'Jumlah Record' : 'Dihapus'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((key) => (
            <tr key={key}>
              <td className="text-gray-700">{TABLE_LABELS[key] || key}</td>
              <td className={`num-cell font-semibold ${counts[key] > 0 ? (highlight === 'delete' ? 'text-red-600' : 'text-green-700') : 'text-gray-400'}`}>
                {(counts[key] || 0).toLocaleString('id-ID')}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className={highlight === 'delete' ? 'bg-red-50 border-t-2 border-red-200' : 'bg-green-50 border-t-2 border-green-200'}>
            <td className="px-4 py-2.5 font-bold text-gray-900">Total Record</td>
            <td className={`num-cell font-bold text-base ${highlight === 'delete' ? 'text-red-700' : 'text-green-700'}`}>
              {Object.values(counts).reduce((s, v) => s + (v || 0), 0).toLocaleString('id-ID')}
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

  // Master data untuk filter
  const [outlets, setOutlets] = useState([]);
  const [dataTypeOptions, setDataTypeOptions] = useState([]);

  // Filter cabang
  const [scopeAllBranches, setScopeAllBranches] = useState(true);
  const [selectedOutletIds, setSelectedOutletIds] = useState([]);

  // Filter jenis data
  const [selectedDataTypes, setSelectedDataTypes] = useState([]);

  // Filter tanggal opsional
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');

  // State mesin
  // idle → previewing → preview_ready → deleting → done
  const [stage, setStage] = useState('idle');

  // Data
  const [previewData, setPreviewData] = useState(null);
  const [resultData, setResultData]   = useState(null);

  // Konfirmasi
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Pesan
  const { toast, showToast, hideToast } = useToast();
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/outlets').then((res) => setOutlets(res.data || [])).catch(() => {});
    api.get('/api/data-deletion/data-types').then((res) => setDataTypeOptions(res.data || [])).catch(() => {});
  }, []);

  function resetAll() {
    setStage('idle');
    setPreviewData(null);
    setResultData(null);
    setConfirmChecked(false);
    setShowConfirmDialog(false);
    setError('');
    setScopeAllBranches(true);
    setSelectedOutletIds([]);
    setSelectedDataTypes([]);
    setShowDateFilter(false);
    setDateFrom('');
    setDateTo('');
  }

  function backToFilters() {
    setStage('idle');
    setPreviewData(null);
    setConfirmChecked(false);
    setShowConfirmDialog(false);
    setError('');
  }

  function toggleOutlet(id) {
    setSelectedOutletIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setError('');
    if (stage !== 'idle') backToFilters();
  }

  function toggleDataType(key) {
    setSelectedDataTypes((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
    setError('');
    if (stage !== 'idle') backToFilters();
  }

  // ── Validasi input ─────────────────────────────────────────────────────────
  function validateFilters() {
    if (!scopeAllBranches && selectedOutletIds.length === 0) {
      return 'Pilih minimal satu cabang, atau pilih "Semua Cabang".';
    }
    if (selectedDataTypes.length === 0) {
      return 'Pilih minimal satu jenis data yang ingin dihapus.';
    }
    if (showDateFilter) {
      if (dateFrom && dateTo && dateFrom > dateTo) {
        return 'Tanggal mulai tidak boleh lebih besar dari tanggal akhir.';
      }
      if (dateTo && dateTo > today) {
        return 'Tanggal akhir tidak boleh melebihi tanggal hari ini.';
      }
    }
    return '';
  }

  function buildRequestBody() {
    return {
      outlet_ids: scopeAllBranches ? [] : selectedOutletIds,
      data_types: selectedDataTypes,
      date_from: showDateFilter && dateFrom ? dateFrom : undefined,
      date_to: showDateFilter && dateTo ? dateTo : undefined,
    };
  }

  // ── Preview ────────────────────────────────────────────────────────────────
  async function handlePreview() {
    const validationError = validateFilters();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setPreviewData(null);
    setConfirmChecked(false);
    setStage('previewing');

    try {
      const res = await api.post('/api/data-deletion/preview', buildRequestBody());
      setPreviewData(res.data);
      setStage('preview_ready');
    } catch (err) {
      setError(err.response?.data?.error || 'Gagal memuat preview. Coba lagi.');
      setStage('idle');
    }
  }

  // ── Eksekusi hapus ─────────────────────────────────────────────────────────
  async function handleDelete() {
    setShowConfirmDialog(false);
    setError('');
    setStage('deleting');

    try {
      const res = await api.post('/api/data-deletion/execute', { ...buildRequestBody(), confirm: true });
      setResultData(res.data);
      setStage('done');
    } catch (err) {
      setError(err.response?.data?.error || 'Gagal menghapus data. Coba lagi.');
      setStage('preview_ready');
    }
  }

  // ── Derived state ──────────────────────────────────────────────────────────
  const totalPreview = previewData ? Object.values(previewData.preview).reduce((s, v) => s + (v || 0), 0) : 0;
  const noDataFound  = stage === 'preview_ready' && totalPreview === 0;
  const canDelete    = stage === 'preview_ready' && totalPreview > 0 && confirmChecked;
  const isDeleting   = stage === 'deleting';
  const isPreviewing = stage === 'previewing';

  const selectedOutletNames = scopeAllBranches
    ? ['Semua Cabang']
    : outlets.filter((o) => selectedOutletIds.includes(o.id)).map((o) => o.name);

  const selectedTypeLabels = dataTypeOptions.filter((t) => selectedDataTypes.includes(t.key));
  const nonBranchScopedSelected = !scopeAllBranches && selectedTypeLabels.filter((t) => t.branchScoped === false);

  // ── Step indicator ─────────────────────────────────────────────────────────
  const stepDone = {
    1: stage !== 'idle',
    2: stage === 'preview_ready' || stage === 'deleting' || stage === 'done',
    3: stage === 'deleting' || stage === 'done',
    4: stage === 'done',
  };

  return (
    <div className="page-shell max-w-3xl">
      <Toast toast={toast} onClose={hideToast} />

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Trash2 className="h-6 w-6 text-red-600" />
            Hapus Data
          </h1>
          <p className="page-subtitle">
            Hapus data transaksi/operasional berdasarkan cabang dan/atau jenis data tertentu
          </p>
        </div>
      </div>

      {/* Peringatan master data aman */}
      <AlertBox type="info" icon={Info} title="Master data tidak ikut terhapus">
        Data master seperti <strong>Outlet/Cabang, Supplier, Bahan Baku, dan Pengaturan Sistem</strong> tidak
        akan pernah terhapus lewat fitur ini — apapun kombinasi cabang dan jenis data yang dipilih.
        Memilih cabang berarti menghapus <strong>data transaksi milik cabang itu</strong>, bukan menghapus
        cabangnya sendiri.
      </AlertBox>

      {/* Step indicator */}
      {stage !== 'done' && (
        <div className="card p-4 mt-5 flex flex-wrap items-center gap-3">
          <StepBadge step={1} label="Pilih Filter"     active={stage === 'idle'}         done={stepDone[1]} />
          <StepBadge step={2} label="Preview Data"      active={stage === 'previewing' || stage === 'preview_ready'} done={stepDone[2]} />
          <StepBadge step={3} label="Konfirmasi"        active={stage === 'deleting'}     done={stepDone[3]} />
          <StepBadge step={4} label="Selesai"           active={false}                    done={stepDone[4]} />
        </div>
      )}

      {/* Pesan error global */}
      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── STEP 1: Pilih filter ──────────────────────────────────────────── */}
      {stage !== 'done' && (
        <>
          {/* Pilih cabang */}
          <div className="card p-5 mt-5">
            <h2 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-gray-500" />
              Pilih Cabang
            </h2>
            <p className="text-sm text-gray-500 mb-3">
              Pilih cabang mana saja yang datanya ingin dihapus.
            </p>

            <div className="flex flex-wrap gap-2 mb-3">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => { setScopeAllBranches(true); setSelectedOutletIds([]); setError(''); if (stage !== 'idle') backToFilters(); }}
                className={`rounded-full px-4 py-1.5 text-sm font-medium border transition-colors ${
                  scopeAllBranches ? 'bg-brand-red text-white border-brand-red' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Semua Cabang
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => { setScopeAllBranches(false); setError(''); if (stage !== 'idle') backToFilters(); }}
                className={`rounded-full px-4 py-1.5 text-sm font-medium border transition-colors ${
                  !scopeAllBranches ? 'bg-brand-red text-white border-brand-red' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Pilih Cabang Tertentu
              </button>
            </div>

            {!scopeAllBranches && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-56 overflow-y-auto rounded-lg border border-gray-200 p-3">
                {outlets.length === 0 && <p className="text-sm text-gray-400 col-span-full">Memuat daftar cabang...</p>}
                {outlets.map((o) => (
                  <label key={o.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedOutletIds.includes(o.id)}
                      onChange={() => toggleOutlet(o.id)}
                      disabled={isDeleting}
                      className="h-4 w-4 accent-brand-red"
                    />
                    <span className={o.is_active === false ? 'text-gray-400' : 'text-gray-700'}>
                      {o.name}{o.is_active === false ? ' (nonaktif)' : ''}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Pilih jenis data */}
          <div className="card p-5 mt-5">
            <h2 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-gray-500" />
              Pilih Jenis Data
            </h2>
            <p className="text-sm text-gray-500 mb-3">
              Pilih satu atau beberapa jenis data yang ingin dihapus.
            </p>

            <div className="space-y-2">
              {dataTypeOptions.length === 0 && <p className="text-sm text-gray-400">Memuat jenis data...</p>}
              {dataTypeOptions.map((t) => (
                <label
                  key={t.key}
                  className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 cursor-pointer hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedDataTypes.includes(t.key)}
                    onChange={() => toggleDataType(t.key)}
                    disabled={isDeleting}
                    className="mt-0.5 h-4 w-4 flex-shrink-0 accent-brand-red"
                  />
                  <span className="text-sm">
                    <span className="font-medium text-gray-800">{t.label}</span>
                    {t.branchScoped === false && (
                      <span className="ml-2 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700">
                        semua cabang
                      </span>
                    )}
                    {t.note && <span className="block text-xs text-gray-400 mt-0.5">{t.note}</span>}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Filter tanggal opsional */}
          <div className="card p-5 mt-5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showDateFilter}
                onChange={(e) => {
                  setShowDateFilter(e.target.checked);
                  if (!e.target.checked) { setDateFrom(''); setDateTo(''); }
                  if (stage !== 'idle') backToFilters();
                }}
                disabled={isDeleting}
                className="h-4 w-4 accent-brand-red"
              />
              <span className="font-semibold text-gray-900">Batasi juga dengan Rentang Tanggal (opsional)</span>
            </label>

            {showDateFilter && (
              <div className="grid gap-4 sm:grid-cols-2 mt-4">
                <div className="filter-field">
                  <label className="filter-label">Tanggal Mulai</label>
                  <input
                    type="date"
                    value={dateFrom}
                    max={today}
                    onChange={(e) => { setDateFrom(e.target.value); setError(''); if (stage !== 'idle') backToFilters(); }}
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
                    onChange={(e) => { setDateTo(e.target.value); setError(''); if (stage !== 'idle') backToFilters(); }}
                    className="input"
                    disabled={isDeleting}
                  />
                </div>
              </div>
            )}
          </div>

          {stage === 'idle' && (
            <div className="mt-5">
              <button
                onClick={handlePreview}
                disabled={isPreviewing}
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
          )}
        </>
      )}

      {/* ── STEP 2: Preview ────────────────────────────────────────────────── */}
      {(stage === 'preview_ready' || stage === 'deleting') && previewData && (
        <div className="card p-5 mt-5">
          <h2 className="font-semibold text-gray-900 mb-1">
            Preview Data yang Akan Dihapus
          </h2>
          <div className="text-sm text-gray-500 mb-4 space-y-0.5">
            <p>Cabang: <span className="font-semibold text-gray-800">{selectedOutletNames.join(', ')}</span></p>
            <p>Jenis Data: <span className="font-semibold text-gray-800">{selectedTypeLabels.map((t) => t.label).join(', ')}</span></p>
            {previewData.date_from || previewData.date_to ? (
              <p>Periode: <span className="font-semibold text-gray-800">
                {previewData.date_from ? formatDateID(previewData.date_from) : 'Awal data'} – {previewData.date_to ? formatDateID(previewData.date_to) : 'Sekarang'}
              </span></p>
            ) : (
              <p>Periode: <span className="font-semibold text-gray-800">Semua waktu</span></p>
            )}
          </div>

          {noDataFound ? (
            <div className="rounded-lg bg-gray-50 p-8 text-center">
              <p className="text-gray-500 text-sm">
                Tidak ada data yang cocok dengan filter cabang/jenis data ini. Tidak ada yang perlu dihapus.
              </p>
            </div>
          ) : (
            <>
              <CountTable counts={previewData.preview} highlight="delete" />

              {/* Peringatan destruktif */}
              <div className="mt-5">
                <AlertBox type="danger" icon={ShieldAlert} title="Peringatan — Data tidak bisa dikembalikan!">
                  <ul className="mt-1 list-disc pl-4 space-y-1">
                    <li>
                      Sebanyak <strong>{totalPreview.toLocaleString('id-ID')} record</strong> akan
                      dihapus permanen dari database (hard delete, bukan arsip/nonaktif).
                    </li>
                    <li>Tindakan ini <strong>tidak bisa dibatalkan</strong>.</li>
                    <li>Pastikan Anda sudah yakin dengan cabang dan jenis data yang dipilih sebelum melanjutkan.</li>
                  </ul>
                </AlertBox>
              </div>

              {/* Checkbox konfirmasi */}
              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 hover:bg-red-50 hover:border-red-200 transition-colors">
                <input
                  type="checkbox"
                  checked={confirmChecked}
                  onChange={(e) => { setConfirmChecked(e.target.checked); setError(''); }}
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
                  onClick={() => setShowConfirmDialog(true)}
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
                  onClick={backToFilters}
                  disabled={isDeleting}
                  className="btn-secondary text-sm"
                >
                  Ubah Filter
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Dialog konfirmasi final ───────────────────────────────────────── */}
      {showConfirmDialog && (
        <ConfirmDialog
          title="Konfirmasi Hapus Data Permanen"
          danger
          loading={isDeleting}
          loadingLabel="Menghapus..."
          confirmLabel={`Ya, Hapus ${totalPreview.toLocaleString('id-ID')} Record`}
          cancelLabel="Batal"
          onConfirm={handleDelete}
          onCancel={() => setShowConfirmDialog(false)}
        >
          <div className="space-y-2">
            <p>Anda akan menghapus data berikut secara <strong>permanen dan tidak bisa dibatalkan</strong>:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Cabang: <strong>{selectedOutletNames.join(', ')}</strong></li>
              <li>Jenis data: <strong>{selectedTypeLabels.map((t) => t.label).join(', ')}</strong></li>
              <li>
                Periode:{' '}
                <strong>
                  {previewData?.date_from || previewData?.date_to
                    ? `${previewData.date_from ? formatDateID(previewData.date_from) : 'Awal data'} – ${previewData.date_to ? formatDateID(previewData.date_to) : 'Sekarang'}`
                    : 'Semua waktu'}
                </strong>
              </li>
              <li>Total: <strong className="text-red-700">{totalPreview.toLocaleString('id-ID')} record</strong></li>
            </ul>
            {nonBranchScopedSelected && nonBranchScopedSelected.length > 0 && (
              <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 text-xs">
                Catatan: {nonBranchScopedSelected.map((t) => t.label).join(', ')} tidak terikat cabang tertentu,
                sehingga akan tetap terhapus untuk semua cabang meski Anda memilih cabang spesifik di atas.
              </p>
            )}
          </div>
        </ConfirmDialog>
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
                  {resultData.files_deleted > 0 && ` (${resultData.files_deleted} file foto ikut dihapus dari storage.)`}
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
            <div className="text-sm text-gray-500 mb-4 space-y-0.5">
              <p>Cabang: <span className="font-semibold text-gray-800">{selectedOutletNames.join(', ')}</span></p>
              <p>Jenis Data: <span className="font-semibold text-gray-800">{selectedTypeLabels.map((t) => t.label).join(', ')}</span></p>
            </div>
            <CountTable counts={resultData.deleted} highlight="done" />
          </div>

          {/* Tombol hapus data lagi */}
          <div className="flex justify-end">
            <button onClick={resetAll} className="btn-secondary text-sm">
              Hapus Data Lain
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
