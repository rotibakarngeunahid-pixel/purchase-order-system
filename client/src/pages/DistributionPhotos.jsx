import { useEffect, useState, useRef } from 'react';
import api, { toInputDate, formatDateID } from '../lib/api';
import { Image, Trash2, X, ZoomIn } from 'lucide-react';
import ConfirmDialog from '../components/ui/ConfirmDialog';

function formatDateTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function LightboxModal({ url, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 text-white bg-black/40 rounded-full p-2 hover:bg-black/60"
        onClick={onClose}
      >
        <X className="w-6 h-6" />
      </button>
      <img
        src={url}
        alt="Foto bukti"
        className="max-w-full max-h-full rounded-lg shadow-2xl object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

export default function DistributionPhotos() {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [outlets, setOutlets] = useState([]);
  const [filterBranch, setFilterBranch] = useState('');
  const [filterDate, setFilterDate] = useState(toInputDate());
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [cleaning, setCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState(null);
  const [confirmCleanup, setConfirmCleanup] = useState(false);
  const hasFetched = useRef(false);

  useEffect(() => {
    api.get('/api/outlets').then((res) => {
      setOutlets(res.data || []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams();
    if (filterBranch) params.set('branch', filterBranch);
    if (filterDate) params.set('date', filterDate);
    api.get(`/api/distribution-photos?${params}`, { signal: controller.signal })
      .then((res) => setPhotos(res.data || []))
      .catch((err) => { if (err.name !== 'CanceledError') console.error(err); })
      .finally(() => setLoading(false));
    hasFetched.current = true;
    return () => controller.abort();
  }, [filterBranch, filterDate]);

  const totalPhotos = photos.reduce((sum, r) => sum + (r.photos?.length || 0), 0);

  const handleCleanup = async () => {
    setCleaning(true);
    setCleanResult(null);
    try {
      const res = await api.post('/api/distribution-photos/cleanup');
      setCleanResult({ ok: true, msg: res.data.message });
      // Reload list setelah cleanup
      const params = new URLSearchParams();
      if (filterBranch) params.set('branch', filterBranch);
      if (filterDate) params.set('date', filterDate);
      api.get(`/api/distribution-photos?${params}`).then((r) => setPhotos(r.data || [])).catch(() => {});
    } catch (err) {
      setCleanResult({ ok: false, msg: err.response?.data?.error || err.message });
    } finally {
      setCleaning(false);
      setConfirmCleanup(false);
    }
  };

  return (
    <div className="page-shell max-w-5xl">
      {lightboxUrl && <LightboxModal url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}

      {confirmCleanup && (
        <ConfirmDialog
          title="Hapus Foto Lama?"
          confirmLabel="Ya, Hapus"
          danger
          loading={cleaning}
          loadingLabel="Membersihkan..."
          onConfirm={handleCleanup}
          onCancel={() => setConfirmCleanup(false)}
        >
          Semua foto yang sudah lebih dari 7 hari akan dihapus permanen dari
          penyimpanan. Tindakan ini tidak bisa dibatalkan.
        </ConfirmDialog>
      )}

      <div className="page-header">
        <div>
          <h1 className="page-title">Foto Bukti Distribusi</h1>
          <p className="page-subtitle">Arsip foto bukti bahan masuk per cabang • otomatis dihapus setelah 7 hari</p>
        </div>
        <button
          onClick={() => setConfirmCleanup(true)}
          disabled={cleaning}
          className="btn-secondary text-sm flex items-center gap-2"
          title="Hapus semua foto yang sudah lebih dari 7 hari"
        >
          <Trash2 className="w-4 h-4" />
          {cleaning ? 'Membersihkan...' : 'Hapus Foto Lama'}
        </button>
      </div>

      {cleanResult && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium ${cleanResult.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {cleanResult.msg}
        </div>
      )}

      {/* Filters */}
      <div className="card p-4 mb-5 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[140px]">
          <label className="label">Cabang</label>
          <select
            className="input"
            value={filterBranch}
            onChange={(e) => setFilterBranch(e.target.value)}
          >
            <option value="">Semua Cabang</option>
            {outlets.map((o) => (
              <option key={o.id} value={o.name}>{o.name}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="label">Tanggal</label>
          <input
            type="date"
            className="input"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
          />
        </div>
        <button
          className="btn-secondary text-sm h-[42px] px-4"
          onClick={() => { setFilterBranch(''); setFilterDate(''); }}
        >
          Reset
        </button>
      </div>

      {/* Summary */}
      {!loading && (
        <p className="text-sm text-gray-500 mb-4">
          {photos.length === 0
            ? 'Belum ada foto untuk filter ini.'
            : `${photos.length} sesi upload — ${totalPhotos} foto total`}
        </p>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
        </div>
      ) : photos.length === 0 ? (
        <div className="card p-12 text-center">
          <Image className="w-12 h-12 mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">Tidak ada foto bukti ditemukan</p>
          <p className="text-sm text-gray-400 mt-1">Coba ubah filter tanggal atau cabang</p>
        </div>
      ) : (
        <div className="space-y-4">
          {photos.map((record) => (
            <div key={record.id} className="card p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div>
                  <span className="font-bold text-gray-800 text-base">{record.branch}</span>
                  <span className="ml-3 text-sm text-gray-500">{formatDateID(record.date)}</span>
                </div>
                <div className="text-xs text-gray-400">
                  Dikirim: {formatDateTime(record.uploaded_at)}
                </div>
              </div>

              {/* Photo grid */}
              <div className="flex flex-wrap gap-3">
                {(record.photos || []).map((photo, idx) => (
                  <div key={idx} className="relative group">
                    <div className="w-28 h-28 rounded-xl overflow-hidden bg-gray-100 border border-gray-200 shadow-sm">
                      <img
                        src={photo.url}
                        alt={photo.filename}
                        className="w-full h-full object-cover cursor-pointer transition-transform group-hover:scale-105"
                        onClick={() => setLightboxUrl(photo.url)}
                        loading="lazy"
                      />
                    </div>
                    <button
                      className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 rounded-xl transition-colors"
                      onClick={() => setLightboxUrl(photo.url)}
                      title="Lihat ukuran penuh"
                    >
                      <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                    <p className="text-[10px] text-gray-400 mt-1 text-center w-28 truncate" title={photo.filename}>
                      {photo.filename}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
