import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Copy,
  KeyRound,
  Link as LinkIcon,
  Power,
  PowerOff,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import api, { formatDateID, formatRupiah, toInputDate } from '../lib/api';

function getFirstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function buildApiBaseUrl() {
  const configured = import.meta.env.VITE_API_URL;
  if (configured) return configured.replace(/\/$/, '');
  return window.location.origin;
}

function StatusBadge({ active }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
        active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${active ? 'bg-green-500' : 'bg-gray-400'}`} />
      {active ? 'Aktif' : 'Nonaktif'}
    </span>
  );
}

function SmallInfo({ icon: Icon, title, children }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-red-50 text-brand-red">
          <Icon className="h-[18px] w-[18px]" strokeWidth={2.3} />
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-gray-900">{title}</p>
          <p className="mt-1 text-sm leading-6 text-gray-500">{children}</p>
        </div>
      </div>
    </div>
  );
}

function CopyButton({ value, label = 'Salin', onCopied }) {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value || '');
      onCopied?.(`${label} berhasil disalin.`);
    } catch {
      onCopied?.('Belum bisa menyalin. Silakan salin manual.', 'error');
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!value}
      className="btn-outline text-sm"
    >
      <Copy className="h-4 w-4" />
      {label}
    </button>
  );
}

export default function FinancePortal() {
  const [config, setConfig] = useState({ is_enabled: false, api_key: '' });
  const [outlets, setOutlets] = useState([]);
  const [dateFrom, setDateFrom] = useState(getFirstOfMonth());
  const [dateTo, setDateTo] = useState(toInputDate());
  const [outletId, setOutletId] = useState('');
  const [preview, setPreview] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [toast, setToast] = useState(null);

  const integrationLink = useMemo(() => {
    const params = new URLSearchParams();
    if (dateFrom) params.set('tanggal_mulai', dateFrom);
    if (dateTo) params.set('tanggal_akhir', dateTo);
    if (outletId) params.set('outlet_id', outletId);
    return `${buildApiBaseUrl()}/api/finance-portal/data?${params.toString()}`;
  }, [dateFrom, dateTo, outletId]);

  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    setLoading(true);
    try {
      const [configRes, outletsRes, logsRes] = await Promise.all([
        api.get('/api/finance-portal/admin/config'),
        api.get('/api/outlets'),
        api.get('/api/finance-portal/admin/logs?limit=20'),
      ]);
      setConfig(configRes.data || { is_enabled: false, api_key: '' });
      setOutlets((outletsRes.data || []).filter((outlet) => outlet.is_active));
      setLogs(logsRes.data || []);
      await loadPreview();
    } catch (err) {
      showToast(err.response?.data?.error || 'Portal Data Keuangan belum bisa dimuat.', 'error');
    } finally {
      setLoading(false);
    }
  }

  function showToast(message, type = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function loadPreview() {
    setPreviewLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('tanggal_mulai', dateFrom);
      if (dateTo) params.set('tanggal_akhir', dateTo);
      if (outletId) params.set('outlet_id', outletId);
      const res = await api.get(`/api/finance-portal/admin/preview?${params.toString()}`);
      setPreview(res.data);
    } catch (err) {
      setPreview(err.response?.data || {
        success: false,
        message: 'Preview data belum bisa dimuat.',
        data: [],
        ringkasan: { total_semua_cabang: 0, jumlah_cabang: 0 },
      });
      showToast(err.response?.data?.message || 'Preview data belum bisa dimuat.', 'error');
    } finally {
      setPreviewLoading(false);
    }
  }

  async function toggleAccess() {
    setSavingStatus(true);
    try {
      const res = await api.put('/api/finance-portal/admin/config', {
        is_enabled: !config.is_enabled,
      });
      setConfig(res.data);
      showToast(res.data.is_enabled ? 'Akses Portal Data Keuangan aktif.' : 'Akses Portal Data Keuangan nonaktif.');
    } catch (err) {
      showToast(err.response?.data?.error || 'Status akses belum bisa disimpan.', 'error');
    } finally {
      setSavingStatus(false);
    }
  }

  async function regenerateKey() {
    if (!window.confirm('Buat API key baru? API key lama tidak bisa dipakai lagi.')) return;
    setRegenerating(true);
    try {
      const res = await api.post('/api/finance-portal/admin/regenerate-key');
      setConfig(res.data);
      showToast('API key baru berhasil dibuat.');
    } catch (err) {
      showToast(err.response?.data?.error || 'API key baru belum bisa dibuat.', 'error');
    } finally {
      setRegenerating(false);
    }
  }

  async function refreshLogs() {
    try {
      const res = await api.get('/api/finance-portal/admin/logs?limit=20');
      setLogs(res.data || []);
    } catch {
      showToast('Log akses belum bisa dimuat.', 'error');
    }
  }

  const previewRows = preview?.data || [];
  const previewTotal = preview?.ringkasan?.total_semua_cabang || 0;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <div className="text-center">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-brand-red border-t-transparent" />
          <p className="text-sm text-gray-500">Memuat Portal Data Keuangan...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      {toast && (
        <div className={`fixed right-4 top-4 z-50 max-w-sm rounded-lg px-4 py-3 text-sm text-white shadow-lg ${
          toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'
        }`}>
          {toast.message}
        </div>
      )}

      <div className="page-header">
        <div>
          <h1 className="page-title">Portal Data Keuangan</h1>
          <p className="page-subtitle">
            Fitur ini digunakan agar sistem keuangan bisa mengambil total pengeluaran bahan baku per cabang secara otomatis.
          </p>
        </div>
        <StatusBadge active={config.is_enabled} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SmallInfo icon={ShieldCheck} title="Akses aman">
          API key adalah kode rahasia agar hanya sistem keuangan yang bisa mengambil data.
        </SmallInfo>
        <SmallInfo icon={LinkIcon} title="Link integrasi">
          Link ini diberikan ke sistem keuangan agar mereka bisa membaca data pengeluaran.
        </SmallInfo>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-gray-900">Pengaturan Akses</h2>
              <p className="mt-1 text-sm text-gray-500">Aktifkan akses sebelum data diberikan ke sistem keuangan.</p>
            </div>
            <button
              type="button"
              onClick={toggleAccess}
              disabled={savingStatus}
              className={config.is_enabled ? 'btn-danger text-sm' : 'btn-primary text-sm'}
            >
              {config.is_enabled ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
              {savingStatus ? 'Menyimpan...' : config.is_enabled ? 'Nonaktifkan' : 'Aktifkan'}
            </button>
          </div>

          <div className="rounded-lg border border-gray-200 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
              <KeyRound className="h-4 w-4 text-brand-red" />
              API key
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
              <input
                readOnly
                value={config.api_key || ''}
                className="input font-mono text-xs"
                aria-label="API key Portal Data Keuangan"
              />
              <CopyButton value={config.api_key} label="Salin API key" onCopied={showToast} />
              <button
                type="button"
                onClick={regenerateKey}
                disabled={regenerating}
                className="btn-secondary text-sm"
              >
                <RefreshCw className={`h-4 w-4 ${regenerating ? 'animate-spin' : ''}`} />
                {regenerating ? 'Membuat...' : 'Buat Baru'}
              </button>
            </div>
            <p className="mt-2 text-xs leading-5 text-gray-500">
              Jika API key dibuat baru, kode lama otomatis tidak bisa dipakai.
            </p>
          </div>
        </section>

        <section className="card p-5">
          <div className="mb-4 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-brand-red" />
            <h2 className="font-semibold text-gray-900">Panduan Integrasi</h2>
          </div>
          <ol className="space-y-3 text-sm text-gray-600">
            <li><span className="font-semibold text-gray-900">Langkah 1:</span> Aktifkan akses Portal Data Keuangan.</li>
            <li><span className="font-semibold text-gray-900">Langkah 2:</span> Salin API key.</li>
            <li><span className="font-semibold text-gray-900">Langkah 3:</span> Salin link integrasi.</li>
            <li><span className="font-semibold text-gray-900">Langkah 4:</span> Berikan API key dan link integrasi ke sistem keuangan.</li>
            <li><span className="font-semibold text-gray-900">Langkah 5:</span> Sistem keuangan akan menarik data pengeluaran bahan baku otomatis.</li>
          </ol>
          <div className="mt-4 rounded-lg bg-gray-50 p-3 text-xs leading-5 text-gray-500">
            Sistem keuangan mengirim API key dengan nama <span className="font-semibold text-gray-700">x-api-key</span>.
          </div>
        </section>
      </div>

      <section className="card mt-6 p-5">
        <div className="mb-4">
          <h2 className="font-semibold text-gray-900">Filter dan Preview Data</h2>
          <p className="mt-1 text-sm text-gray-500">Preview ini sama dengan data yang akan dibaca sistem keuangan.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[160px_160px_minmax(180px,1fr)_auto]">
          <div className="filter-field">
            <label className="filter-label">Tanggal mulai</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input" />
          </div>
          <div className="filter-field">
            <label className="filter-label">Tanggal akhir</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input" />
          </div>
          <div className="filter-field">
            <label className="filter-label">Cabang/outlet</label>
            <select value={outletId} onChange={(e) => setOutletId(e.target.value)} className="input">
              <option value="">Semua cabang</option>
              {outlets.map((outlet) => (
                <option key={outlet.id} value={outlet.id}>{outlet.name}</option>
              ))}
            </select>
          </div>
          <button type="button" onClick={loadPreview} disabled={previewLoading} className="btn-primary h-10 text-sm">
            {previewLoading ? 'Memuat...' : 'Tampilkan'}
          </button>
        </div>

        <div className="mt-5 rounded-lg border border-gray-200 p-4">
          <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                Periode: {formatDateID(dateFrom)} - {formatDateID(dateTo)}
              </p>
              <p className="mt-1 text-sm text-gray-500">{preview?.message || 'Pilih filter lalu tampilkan data.'}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase text-gray-500">Total semua cabang</p>
              <p className="text-xl font-bold text-brand-red">{formatRupiah(previewTotal)}</p>
            </div>
          </div>

          {previewLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-red border-t-transparent" />
            </div>
          ) : previewRows.length === 0 ? (
            <div className="rounded-lg bg-gray-50 p-8 text-center text-sm text-gray-500">
              Belum ada data pengeluaran bahan baku pada periode ini.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {previewRows.map((row) => (
                <div key={row.cabang} className="rounded-lg border border-gray-200 p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-gray-900">{row.cabang}</p>
                      <p className="mt-1 text-xs text-gray-500">{row.jumlah_transaksi} transaksi/order</p>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Berhasil
                    </span>
                  </div>
                  <p className="text-xs font-semibold uppercase text-gray-500">Total Pengeluaran Bahan Baku</p>
                  <p className="mt-1 text-2xl font-bold text-brand-red">
                    {formatRupiah(row.total_pengeluaran_bahan_baku)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="card mt-6 p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-900">Link Integrasi</h2>
            <p className="mt-1 text-sm text-gray-500">Link mengikuti filter tanggal dan cabang yang sedang dipilih.</p>
          </div>
          <CopyButton value={integrationLink} label="Salin link" onCopied={showToast} />
        </div>
        <div className="rounded-lg bg-gray-50 p-3 font-mono text-xs leading-5 text-gray-700 break-all">
          {integrationLink}
        </div>
      </section>

      <section className="card mt-6 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 p-5">
          <div>
            <h2 className="font-semibold text-gray-900">Log Akses</h2>
            <p className="mt-1 text-sm text-gray-500">Catatan saat sistem keuangan mengambil data.</p>
          </div>
          <button type="button" onClick={refreshLogs} className="btn-outline text-sm">
            <RefreshCw className="h-4 w-4" />
            Muat ulang
          </button>
        </div>

        {logs.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            Belum ada akses dari sistem keuangan.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table table-fixed" style={{ minWidth: '760px' }}>
              <colgroup>
                <col style={{ width: '24%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '18%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Waktu akses</th>
                  <th>Status</th>
                  <th>Cabang</th>
                  <th>Periode tanggal</th>
                  <th>Catatan</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="font-medium text-gray-800">
                      {new Date(log.waktu_akses).toLocaleString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td>
                      <span className={log.status === 'Berhasil' ? 'badge-received' : 'badge-pending'}>
                        {log.status}
                      </span>
                    </td>
                    <td className="truncate text-gray-700">{log.cabang}</td>
                    <td className="text-gray-600">
                      {log.tanggal_mulai && log.tanggal_akhir
                        ? `${formatDateID(log.tanggal_mulai)} - ${formatDateID(log.tanggal_akhir)}`
                        : '-'}
                    </td>
                    <td className="truncate text-gray-500" title={log.pesan}>{log.pesan || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
