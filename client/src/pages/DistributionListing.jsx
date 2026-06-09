import { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { toInputDate, formatDateID } from '../lib/api';

const baseURL = import.meta.env.VITE_API_URL ?? '';
const publicApi = axios.create({ baseURL, timeout: 60000 });

const STORAGE_KEY = (date, outletId) => `dist_check_${date}_${outletId}`;
const PHOTO_KEY = (date, outletName) => `dist_photo_${date}_${outletName}`;

function loadChecks(date, outletId) {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY(date, outletId)) || '{}'); }
  catch { return {}; }
}
function saveChecks(date, outletId, checks) {
  localStorage.setItem(STORAGE_KEY(date, outletId), JSON.stringify(checks));
}
function loadUploadedPhotos(date, outletName) {
  try { return JSON.parse(localStorage.getItem(PHOTO_KEY(date, outletName)) || 'null'); }
  catch { return null; }
}
function saveUploadedPhotos(date, outletName, data) {
  localStorage.setItem(PHOTO_KEY(date, outletName), JSON.stringify(data));
}

function mergeOutletTabs(masterOutlets, distributionOutlets) {
  const map = new Map((masterOutlets || []).map((outlet) => [String(outlet.id), outlet]));
  (distributionOutlets || []).forEach((entry) => {
    const outlet = entry.outlet;
    if (outlet?.id && !map.has(String(outlet.id))) map.set(String(outlet.id), outlet);
  });
  return Array.from(map.values());
}

function sortItems(items) {
  return [...items].sort((a, b) => {
    const aIsRoti = a.material_name?.toLowerCase().includes('roti tawar');
    const bIsRoti = b.material_name?.toLowerCase().includes('roti tawar');
    if (aIsRoti && !bIsRoti) return -1;
    if (!aIsRoti && bIsRoti) return 1;
    return 0;
  });
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Photo Upload Card ────────────────────────────────────────────────────────

function PhotoUploadCard({ outletName, date, allDone, alreadyUploaded, onUploadSuccess }) {
  const [guide, setGuide] = useState(null);
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [uploadStatus, setUploadStatus] = useState('idle'); // idle|processing|uploading|done|error
  const [uploadProgress, setUploadProgress] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploadedPhotos, setUploadedPhotos] = useState(alreadyUploaded || null);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    publicApi.get('/api/public/distribution/photo-guide')
      .then((res) => setGuide(res.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setUploadedPhotos(alreadyUploaded || null);
  }, [alreadyUploaded]);

  const defaultInstruction =
    'Pastikan foto jelas, semua bahan terlihat, dan nota/surat jalan tampak dalam frame.';
  const instruction = guide?.instruction || defaultInstruction;
  const examplePhotos = guide?.example_photos || [];

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    const remaining = 3 - selectedPhotos.length;
    if (remaining <= 0) return;

    const added = [];
    const fileErrors = [];
    for (const file of files.slice(0, remaining)) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        fileErrors.push(`${file.name}: Format tidak didukung.`);
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        fileErrors.push(`${file.name}: Terlalu besar. Maksimal 10MB.`);
        continue;
      }
      added.push({ file, preview: URL.createObjectURL(file), name: file.name, size: file.size });
    }
    if (fileErrors.length > 0) setUploadError(fileErrors.join(' '));
    else setUploadError('');
    setSelectedPhotos((prev) => [...prev, ...added]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemove = (idx) => {
    setSelectedPhotos((prev) => {
      const next = [...prev];
      URL.revokeObjectURL(next[idx].preview);
      next.splice(idx, 1);
      return next;
    });
    setUploadError('');
  };

  const canSubmit = allDone && selectedPhotos.length > 0 && uploadStatus === 'idle';

  async function attemptUpload(formData, attempt = 0) {
    try {
      const res = await publicApi.post('/api/public/distribution/upload-photo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      });
      return res.data;
    } catch (err) {
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        return attemptUpload(formData, attempt + 1);
      }
      throw err;
    }
  }

  const handleUpload = async () => {
    if (!canSubmit) {
      setShowTooltip(true);
      setTimeout(() => setShowTooltip(false), 3000);
      return;
    }
    setUploadStatus('processing');
    setUploadProgress('Memproses foto... (konversi ke WebP)');
    setUploadError('');

    const formData = new FormData();
    formData.append('branch', outletName);
    formData.append('date', date);
    selectedPhotos.forEach((p) => formData.append('photos', p.file));

    try {
      setUploadStatus('uploading');
      setUploadProgress(`Mengunggah ${selectedPhotos.length} foto...`);
      const result = await attemptUpload(formData);

      setUploadStatus('done');
      setUploadProgress('Selesai ✓');

      const uploadData = {
        photos: result.photos,
        uploadedAt: new Date().toISOString(),
        failed: result.failed || 0,
        errors: result.errors,
      };
      setUploadedPhotos(uploadData);
      saveUploadedPhotos(date, outletName, uploadData);
      onUploadSuccess?.(uploadData);

      selectedPhotos.forEach((p) => URL.revokeObjectURL(p.preview));
      setSelectedPhotos([]);
    } catch (err) {
      setUploadStatus('error');
      const msg = err.response?.data?.error || err.message || 'Gagal mengirim foto.';
      setUploadError(`${msg} Periksa koneksi dan coba lagi.`);
      setUploadProgress('');
    }
  };

  const handleRetry = () => {
    setUploadStatus('idle');
    setUploadError('');
    setUploadProgress('');
  };

  // ── Lightbox ──────────────────────────────────────────────────────────────
  const Lightbox = lightboxUrl ? (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={() => setLightboxUrl(null)}
    >
      <button className="absolute top-4 right-4 text-white bg-black/40 rounded-full w-9 h-9 flex items-center justify-center text-lg" onClick={() => setLightboxUrl(null)}>✕</button>
      <img src={lightboxUrl} alt="Foto" className="max-w-full max-h-full rounded-xl object-contain" onClick={(e) => e.stopPropagation()} />
    </div>
  ) : null;

  // ── Already uploaded view ─────────────────────────────────────────────────
  if (uploadedPhotos?.photos?.length > 0 && uploadStatus !== 'error') {
    const ts = uploadedPhotos.uploadedAt
      ? new Date(uploadedPhotos.uploadedAt).toLocaleString('id-ID', {
          day: '2-digit', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        })
      : '';
    return (
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {Lightbox}
        <div className="px-4 py-3.5 bg-green-50 border-b border-green-100">
          <h2 className="font-bold text-green-700 text-base">📷 Foto Bukti Bahan Masuk</h2>
        </div>
        <div className="p-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
            <p className="text-green-700 font-semibold text-sm">
              ✅ Foto bukti berhasil dikirim — {ts}
            </p>
            {uploadedPhotos.failed > 0 && (
              <p className="text-yellow-600 text-xs mt-1">
                {uploadedPhotos.failed} foto gagal diunggah
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            {uploadedPhotos.photos.map((photo, idx) => (
              <div key={idx} className="relative">
                <div className="w-24 h-24 rounded-xl overflow-hidden bg-gray-100 border border-gray-200 cursor-pointer" onClick={() => setLightboxUrl(photo.url)}>
                  <img src={photo.url} alt={photo.filename} className="w-full h-full object-cover" loading="lazy" />
                </div>
                <p className="text-[10px] text-gray-400 mt-1 w-24 truncate text-center" title={photo.filename}>
                  {photo.filename}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Upload form view ──────────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      {Lightbox}

      <div className="px-4 py-3.5 bg-blue-50 border-b border-blue-100">
        <h2 className="font-bold text-blue-800 text-base">📷 Foto Bukti Bahan Masuk</h2>
      </div>

      <div className="p-4 space-y-4">

        {/* Guide section */}
        <div className="bg-gray-50 rounded-xl p-3 space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Panduan Foto</p>
          <p className="text-sm text-gray-700 leading-relaxed">{instruction}</p>
          {examplePhotos.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-2">Contoh Foto:</p>
              <div className="flex gap-2 flex-wrap">
                {examplePhotos.map((url, idx) => (
                  <div key={idx} className="w-16 h-16 rounded-lg overflow-hidden bg-gray-200 cursor-pointer border border-gray-300 hover:opacity-80 transition-opacity" onClick={() => setLightboxUrl(url)}>
                    <img src={url} alt={`Contoh ${idx + 1}`} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Upload zone */}
        {selectedPhotos.length < 3 && uploadStatus === 'idle' && (
          <label className="block cursor-pointer">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/*"
              capture="environment"
              multiple
              className="sr-only"
              onChange={handleFileSelect}
            />
            <div className="border-2 border-dashed border-blue-300 rounded-xl p-6 text-center hover:border-blue-400 hover:bg-blue-50/50 transition-colors active:scale-[0.99]">
              <div className="text-4xl mb-2">📷</div>
              <p className="text-sm font-semibold text-blue-700">Ketuk untuk ambil foto atau pilih dari galeri</p>
              <p className="text-xs text-gray-400 mt-1">
                Maks. {3 - selectedPhotos.length} foto lagi • JPG, PNG, WebP • Maks. 10MB/foto
              </p>
            </div>
          </label>
        )}

        {/* Inline file error */}
        {uploadError && uploadStatus === 'idle' && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <p className="text-red-600 text-sm">{uploadError}</p>
          </div>
        )}

        {/* Photo previews */}
        {selectedPhotos.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Foto Dipilih ({selectedPhotos.length}/3)
            </p>
            <div className="flex flex-wrap gap-3">
              {selectedPhotos.map((photo, idx) => (
                <div key={idx} className="relative">
                  <div className="w-24 h-24 rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
                    <img src={photo.preview} alt={photo.name} className="w-full h-full object-cover" />
                  </div>
                  <span className="absolute top-1 left-1 bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">WebP</span>
                  {uploadStatus === 'idle' && (
                    <button
                      onClick={() => handleRemove(idx)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-bold hover:bg-red-600 active:scale-90"
                    >
                      ✕
                    </button>
                  )}
                  <p className="text-[10px] text-gray-400 mt-1 w-24 truncate" title={photo.name}>{photo.name}</p>
                  <p className="text-[10px] text-gray-400">{formatFileSize(photo.size)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Progress indicator */}
        {(uploadStatus === 'processing' || uploadStatus === 'uploading') && (
          <div className="flex items-center gap-3 bg-blue-50 rounded-xl p-3">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <p className="text-sm text-blue-700 font-medium">{uploadProgress}</p>
          </div>
        )}

        {/* Error state with retry */}
        {uploadStatus === 'error' && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-2">
            <p className="text-red-600 text-sm">{uploadError}</p>
            <button onClick={handleRetry} className="text-sm font-semibold text-red-600 underline underline-offset-2">
              Coba Lagi
            </button>
          </div>
        )}

        {/* Submit button */}
        {uploadStatus !== 'done' && (
          <div className="relative">
            <button
              onClick={handleUpload}
              disabled={uploadStatus !== 'idle' || selectedPhotos.length === 0}
              className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all active:scale-[0.98] ${
                canSubmit
                  ? 'bg-brand-red text-white shadow-sm hover:bg-red-700'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {uploadStatus === 'processing' || uploadStatus === 'uploading'
                ? uploadProgress || 'Mengunggah...'
                : 'Kirim Foto Bukti'}
            </button>
            {showTooltip && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-gray-800 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap z-10 shadow-lg">
                {!allDone
                  ? 'Selesaikan pengecekan semua item terlebih dahulu'
                  : 'Pilih minimal 1 foto terlebih dahulu'}
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
              </div>
            )}
          </div>
        )}

        {!allDone && uploadStatus === 'idle' && (
          <p className="text-xs text-gray-400 text-center">
            Selesaikan pengecekan semua item untuk mengaktifkan tombol kirim
          </p>
        )}

      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function DistributionListing() {
  // ── State ──
  const [date, setDate] = useState(toInputDate());
  const [outlets, setOutlets] = useState([]);
  const [selectedOutletId, setSelectedOutletId] = useState('');
  const [distributionData, setDistributionData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [checks, setChecks] = useState({});
  const [alreadyUploaded, setAlreadyUploaded] = useState(null);

  // ── Derived values (computed before effects so they can be used in deps) ──
  const displayOutlets = mergeOutletTabs(outlets, distributionData?.outlets || []);
  const outletData = distributionData?.outlets?.find(
    (o) => String(o.outlet?.id) === String(selectedOutletId)
  );
  const isAdjustmentGroup = !!outletData?.is_adjustment_group;
  const rawItems = outletData?.items || [];
  const items = sortItems(rawItems);
  const checkedCount = items.filter((item) => checks[item.id]).length;
  const allDone = items.length > 0 && checkedCount === items.length;
  const progressPct = items.length > 0 ? (checkedCount / items.length) * 100 : 0;
  const selectedOutletName = displayOutlets.find((o) => String(o.id) === String(selectedOutletId))?.name || '';
  const showPhotoCard = !!distributionData?.session && !isAdjustmentGroup && items.length > 0;

  // ── Effects ──
  useEffect(() => {
    publicApi.get('/api/public/outlets').then((res) => {
      setOutlets(res.data || []);
      if ((res.data || []).length > 0) setSelectedOutletId(String(res.data[0].id));
    }).catch(console.error);
  }, []);

  const loadDistribution = useCallback(async () => {
    setLoading(true);
    try {
      const res = await publicApi.get(`/api/public/distribution?date=${date}`);
      setDistributionData(res.data);
    } catch (err) {
      console.error(err);
      setDistributionData(null);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { loadDistribution(); }, [loadDistribution]);

  useEffect(() => {
    const merged = mergeOutletTabs(outlets, distributionData?.outlets || []);
    const selectedExists = merged.some((outlet) => String(outlet.id) === String(selectedOutletId));
    if ((!selectedOutletId || !selectedExists) && merged.length > 0) {
      setSelectedOutletId(String(merged[0].id));
    }
  }, [outlets, distributionData, selectedOutletId]);

  useEffect(() => {
    if (selectedOutletId) setChecks(loadChecks(date, selectedOutletId));
  }, [date, selectedOutletId]);

  useEffect(() => {
    if (date && selectedOutletName) {
      setAlreadyUploaded(loadUploadedPhotos(date, selectedOutletName));
    }
  }, [date, selectedOutletName]);

  // ── Handlers ──
  const toggleCheck = (itemId) => {
    const next = { ...checks, [itemId]: !checks[itemId] };
    setChecks(next);
    saveChecks(date, selectedOutletId, next);
  };

  return (
    <div className="min-h-screen bg-gray-100 text-[16px]">

      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-20 bg-brand-red shadow-md">
        <div className="px-4 pt-5 pb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-red-300 text-[11px] font-bold tracking-widest uppercase mb-0.5">
              Roti Bakar Ngeunah
            </p>
            <h1 className="text-white text-xl font-bold leading-tight">Distribution Listing</h1>
            <p className="text-red-200 text-sm mt-0.5">{formatDateID(date)}</p>
          </div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-red-700 text-white text-sm rounded-xl px-3 py-2 border border-red-600 focus:outline-none focus:ring-2 focus:ring-white/40 flex-shrink-0 mt-1"
          />
        </div>

        {/* Tab navigasi cabang */}
        <div className="pb-3">
          <p className="px-4 text-red-300 text-[10px] font-bold tracking-widest uppercase mb-2">
            Pilih Cabang
          </p>
          <div className="flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none">
            {displayOutlets.map((o) => {
              const active = String(o.id) === String(selectedOutletId);
              return (
                <button
                  key={o.id}
                  onClick={() => setSelectedOutletId(String(o.id))}
                  className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all active:scale-95 ${
                    active
                      ? 'bg-white text-brand-red shadow-sm'
                      : 'bg-red-700/60 text-red-100 border border-red-600'
                  }`}
                >
                  {o.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="px-4 pt-3 pb-24 max-w-lg mx-auto space-y-3">

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-400">Memuat data...</p>
          </div>
        ) : !distributionData?.session ? (
          <div className="bg-white rounded-2xl shadow-sm p-10 text-center mt-4">
            <p className="text-5xl mb-3">📋</p>
            <p className="font-semibold text-gray-700 text-base">Belum ada order untuk tanggal ini</p>
            <p className="text-sm text-gray-400 mt-1">Order belum dibuat atau belum ada item yang diisi</p>
          </div>
        ) : (
          <>
            {/* Progress bar */}
            <div className="bg-white rounded-2xl shadow-sm px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-600">Progress Pengecekan</span>
                <span className={`text-sm font-bold tabular-nums ${allDone ? 'text-green-600' : 'text-brand-red'}`}>
                  {checkedCount} / {items.length}
                </span>
              </div>
              <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${allDone ? 'bg-green-500' : 'bg-brand-red'}`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              {allDone && (
                <p className="text-green-600 text-xs font-bold mt-2 text-center tracking-wide">
                  ✓ Semua item sudah dicek!
                </p>
              )}
            </div>

            {/* Daftar item */}
            {items.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
                <p className="text-4xl mb-2">📦</p>
                <p className="font-medium text-gray-600">Tidak ada bahan untuk outlet ini</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3.5 bg-orange-50 border-b border-orange-100">
                  <h2 className="font-bold text-brand-red text-base">{selectedOutletName}</h2>
                  <span className={`${isAdjustmentGroup ? 'bg-blue-600' : 'bg-brand-red'} text-white text-xs font-bold px-3 py-1 rounded-full`}>
                    {items.length} item
                  </span>
                </div>

                {items.map((item, idx) => {
                  const checked = !!checks[item.id];
                  const isRoti = item.material_name?.toLowerCase().includes('roti tawar');
                  const isAdjustment = item.source === 'adjustment';
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center border-b border-gray-100 last:border-b-0 transition-colors active:bg-gray-50 ${
                        checked
                          ? 'bg-green-50'
                          : isAdjustment
                          ? 'bg-blue-50/50'
                          : isRoti
                          ? 'bg-orange-50/40'
                          : 'bg-white'
                      }`}
                    >
                      <button
                        onClick={() => toggleCheck(item.id)}
                        className="flex-1 min-w-0 flex items-center gap-3 px-4 py-4 text-left"
                      >
                        <span className="w-5 text-right text-sm text-gray-300 font-semibold flex-shrink-0 tabular-nums">
                          {idx + 1}
                        </span>
                        <span className={`flex-1 min-w-0 text-base font-medium leading-tight ${
                          checked ? 'line-through text-gray-400' : isRoti ? 'text-brand-red font-semibold' : 'text-gray-800'
                        }`}>
                          {item.material_name}
                          {isAdjustment && !checked && (
                            <span className="ml-2 text-[10px] font-bold bg-blue-600 text-white px-1.5 py-0.5 rounded-full align-middle">
                              MENYUSUL
                            </span>
                          )}
                          {isRoti && !checked && (
                            <span className="ml-2 text-[10px] font-bold bg-brand-red text-white px-1.5 py-0.5 rounded-full align-middle">
                              UTAMA
                            </span>
                          )}
                        </span>
                      </button>

                      <div className="flex items-center gap-1.5 flex-shrink-0 pr-2">
                        <span className={`w-9 text-right text-lg font-bold tabular-nums ${checked ? 'text-gray-400' : 'text-gray-800'}`}>
                          {item.qty}
                        </span>
                        <span className="w-[52px] text-center text-xs font-medium text-gray-500 bg-gray-100 rounded-full py-0.5">
                          {item.purchase_unit || 'pcs'}
                        </span>
                      </div>

                      <button
                        onClick={() => toggleCheck(item.id)}
                        className={`w-11 h-11 flex-shrink-0 flex items-center justify-center mr-2 rounded-full transition-all active:scale-90 ${
                          checked ? 'text-green-500' : 'text-gray-300 hover:text-gray-400'
                        }`}
                      >
                        {checked ? (
                          <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
                            <path fillRule="evenodd" d="M2.25 12a9.75 9.75 0 1119.5 0 9.75 9.75 0 01-19.5 0zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor" className="w-7 h-7">
                            <circle cx="12" cy="12" r="9.25" />
                          </svg>
                        )}
                      </button>
                    </div>
                  );
                })}

                <div className="bg-brand-red px-4 py-4 flex items-center justify-between">
                  <span className="text-white text-sm font-semibold">
                    {isAdjustmentGroup ? 'Total Bahan Menyusul' : 'Total Bahan Masuk'}
                  </span>
                  <span className="text-white font-bold">{items.length} item</span>
                </div>
              </div>
            )}

            {/* Photo upload card */}
            {showPhotoCard && (
              <PhotoUploadCard
                outletName={selectedOutletName}
                date={date}
                allDone={allDone}
                alreadyUploaded={alreadyUploaded}
                onUploadSuccess={(data) => setAlreadyUploaded(data)}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
