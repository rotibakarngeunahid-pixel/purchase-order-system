import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import api, {
  formatDateID,
  getLocalOperationalDate,
  getLocalOperationalYesterday,
} from '../../lib/api';

// ── Helper tanggal operasional (WITA, cutoff 03:00) ────────────────────────────
function shiftDate(dateStr, deltaDays) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().split('T')[0];
}

function daysBetween(fromStr, toStr) {
  const a = new Date(`${fromStr}T00:00:00Z`).getTime();
  const b = new Date(`${toStr}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

const DATE_FILTERS = [
  { id: '7d', label: '7 Hari' },
  { id: 'today', label: 'Hari Ini' },
  { id: 'yesterday', label: 'Kemarin' },
  { id: 'all', label: 'Semua' },
];

const IGNORE_REASONS = [
  'Stok masih cukup',
  'Sudah dibeli manual',
  'Salah input staff',
  'Bahan tidak tersedia',
  'Lainnya',
];

function PhotoLightbox({ url, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <img
          src={url}
          alt="Foto stok"
          className="max-w-full max-h-[85vh] rounded-xl object-contain shadow-2xl"
        />
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center text-gray-700 hover:bg-gray-100 font-bold text-sm"
        >
          ✕
        </button>
      </div>
    </div>,
    document.body
  );
}

// Foto stok dari Inventori bisa berupa:
//  - URL langsung server gambar (Inventori baru: image.rotibakarngeunah.my.id/...jpg)
//  - URL Google Drive lama (.../file/d/<id>/...) → pakai endpoint thumbnail Drive
// Kembalikan { thumb, full } atau null bila bukan foto.
function resolvePhoto(url) {
  if (!url) return null;
  const gd = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (gd) {
    return {
      thumb: `https://drive.google.com/thumbnail?id=${gd[1]}&sz=w200`,
      full: `https://drive.google.com/thumbnail?id=${gd[1]}&sz=w1200`,
    };
  }
  if (/^https?:\/\//i.test(url)) {
    return { thumb: url, full: url };
  }
  return null;
}

// ── Modal pilih alasan abaikan ─────────────────────────────────────────────────
function IgnoreReasonModal({ item, onCancel, onConfirm }) {
  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const finalReason = reason === 'Lainnya' ? (detail.trim() || 'Lainnya') : reason;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold text-gray-900 mb-1">Abaikan rekomendasi?</h3>
        <p className="text-xs text-gray-500 mb-3">
          <span className="font-medium text-gray-700">{item.nama_bahan}</span>
          {' · '}{item.po_outlet_name || item.nama_cabang}
        </p>
        <p className="text-xs text-gray-500 mb-2">Pilih alasan (wajib):</p>
        <div className="space-y-1.5 mb-3">
          {IGNORE_REASONS.map((r) => (
            <label key={r} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="radio"
                name="ignore-reason"
                value={r}
                checked={reason === r}
                onChange={() => setReason(r)}
                className="accent-orange-500"
              />
              {r}
            </label>
          ))}
        </div>
        {reason === 'Lainnya' && (
          <input
            autoFocus
            className="input text-sm w-full mb-3"
            placeholder="Tulis alasan singkat"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
          />
        )}
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="btn-outline text-sm" disabled={busy}>
            Batal
          </button>
          <button
            onClick={async () => {
              if (!finalReason) return;
              setBusy(true);
              const ok = await onConfirm(item, finalReason);
              if (!ok) setBusy(false);
            }}
            disabled={!reason || busy}
            className="btn-primary text-sm"
          >
            {busy ? '...' : 'Abaikan'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function RekomendasiItem({ item, material, isAdded, onAdd, onIgnore, showCabang }) {
  const [lightbox, setLightbox] = useState(false);
  const [adding, setAdding] = useState(false);
  const hasNumber = item.tipe_stok !== 'foto' && item.stok_akhir !== null && item.stok_akhir !== undefined;
  const photo = !hasNumber ? resolvePhoto(item.foto_url) : null;
  const thumbUrl = photo?.thumb || null;
  const fullUrl  = photo?.full || null;
  const unit = material?.package_unit || '';

  const canAddOutlet = !!item.po_outlet_id;
  const canAddMaterial = !!item.po_material_id;
  const canAdd = canAddOutlet && canAddMaterial;

  const ageDays = item.tanggal ? daysBetween(item.tanggal, getLocalOperationalDate()) : 0;
  const isStale = ageDays >= 2;

  const handleAdd = async () => {
    if (adding) return;
    setAdding(true);
    const ok = await onAdd(item);
    if (!ok) setAdding(false); // sukses → parent menandai isAdded
  };

  return (
    <div className="flex items-start gap-2.5 py-2.5 border-b border-orange-100 last:border-0">
      {lightbox && fullUrl && <PhotoLightbox url={fullUrl} onClose={() => setLightbox(false)} />}
      {thumbUrl && (
        <button
          type="button"
          onClick={() => setLightbox(true)}
          className="flex-shrink-0 mt-0.5 rounded-lg overflow-hidden border border-orange-200 bg-orange-100 hover:opacity-80 transition-opacity"
        >
          <img
            src={thumbUrl}
            alt="stok"
            className="w-11 h-11 object-cover"
            onError={(e) => { e.target.parentElement.style.display = 'none'; }}
          />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <span className="font-semibold text-sm text-gray-900 leading-tight">
            {item.nama_bahan}
          </span>
          <div className="flex-shrink-0">
            {isAdded ? (
              <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-lg font-medium whitespace-nowrap">
                ✓ Ditambahkan
              </span>
            ) : !canAddMaterial ? (
              <span
                className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-medium whitespace-nowrap cursor-help"
                title={`Bahan "${item.nama_bahan}" (ID inventori: ${item.bahan_id}) belum terpetakan ke bahan PO.\nBuka Master Data → Bahan Baku → klik Link pada bahan yang sesuai.`}
              >
                Perlu mapping bahan
              </span>
            ) : !canAddOutlet ? (
              <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-medium whitespace-nowrap">
                Cabang belum dipetakan
              </span>
            ) : (
              <button
                onClick={handleAdd}
                disabled={adding}
                className="text-xs bg-orange-500 hover:bg-orange-600 active:bg-orange-700 disabled:opacity-60 text-white px-2.5 py-1 rounded-lg font-semibold transition-colors whitespace-nowrap"
              >
                {adding ? '...' : '+ Tambah'}
              </button>
            )}
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">
          {showCabang && (
            <span className="font-medium text-orange-600">
              {item.po_outlet_name || item.nama_cabang} ·{' '}
            </span>
          )}
          {formatDateID(item.tanggal)}
          {isStale && (
            <span className="ml-1 text-[9px] text-amber-600 bg-amber-50 border border-amber-200 px-1 py-px rounded">
              {ageDays} hari
            </span>
          )}
        </p>
        {hasNumber && (
          <p className="text-xs text-orange-600 font-semibold mt-0.5">
            Sisa: {item.stok_akhir}{unit ? ` ${unit}` : ''}
          </p>
        )}
        {!canAddOutlet && !isAdded && (
          <p className="text-[10px] text-amber-600 mt-0.5">
            Cabang Inventori belum dipetakan ke Outlet PO.
          </p>
        )}
        {!isAdded && (
          <button
            type="button"
            onClick={() => onIgnore(item)}
            className="text-[10px] text-gray-400 hover:text-gray-600 mt-1 underline"
          >
            Abaikan
          </button>
        )}
      </div>
    </div>
  );
}

export default function RekomendasiPanel({ materials, onAddToOrder, addedIds, currentOutlet, inputMode, orderDate }) {
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [showAll, setShowAll]   = useState(false);
  const [dateFilter, setDateFilter] = useState('7d');
  const [ignoreTarget, setIgnoreTarget] = useState(null);

  // Refetch saat filter tanggal atau tanggal order berubah (RF-09).
  useEffect(() => { fetchRekomendasi(); /* eslint-disable-next-line */ }, [dateFilter, orderDate]);

  async function fetchRekomendasi() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ status: 'pending' });
      const today = getLocalOperationalDate();
      if (dateFilter === '7d') {
        params.set('date_from', shiftDate(today, -7));
        params.set('date_to', today);
      } else if (dateFilter === 'today') {
        params.set('date_from', today);
        params.set('date_to', today);
      } else if (dateFilter === 'yesterday') {
        const y = getLocalOperationalYesterday();
        params.set('date_from', y);
        params.set('date_to', y);
      }
      // 'all' → tanpa parameter tanggal (semua pending lintas tanggal)
      const res = await api.get(`/api/inventori/rekomendasi?${params.toString()}`);
      setItems(res.data?.data || []);
    } catch (err) {
      if (err.response?.status === 503) {
        setError('Integrasi inventori belum aktif di server. Hubungi admin untuk mengatur env INVENTORY_API_URL di server.');
        return;
      }
      setError('Gagal memuat rekomendasi. Panel ini tidak mempengaruhi order.');
    } finally {
      setLoading(false);
    }
  }

  function findMaterial(item) {
    if (!item.po_material_id) return null;
    return materials.find((m) => m.id === item.po_material_id) || null;
  }

  const isPerOutlet = inputMode === 'per-outlet';

  const thisOutletItems = useMemo(() => {
    if (!currentOutlet) return items;
    return items.filter(
      (item) => item.po_outlet_id && String(item.po_outlet_id) === String(currentOutlet.id)
    );
  }, [items, currentOutlet]);

  const filteredItems = useMemo(() => {
    if (!isPerOutlet || showAll || !currentOutlet) return items;
    return thisOutletItems;
  }, [items, thisOutletItems, isPerOutlet, showAll, currentOutlet]);

  const unmappedBranchCount = useMemo(
    () => items.filter((i) => !i.po_outlet_id).length,
    [items]
  );
  const currentOutletMapped = !!(
    currentOutlet && (currentOutlet.inventori_branch_id || currentOutlet.inventori_cabang_name)
  );

  // Klik "Tambah" → parent menyimpan order ke outlet ASAL lalu memproses
  // rekomendasi di Inventori. Resolve true bila sukses (parent set addedIds).
  async function handleAdd(item) {
    try {
      return await onAddToOrder(item);
    } catch (_) {
      return false;
    }
  }

  // Abaikan eksplisit dengan alasan → tandai processed di Inventori + buang lokal.
  async function handleIgnoreConfirm(item, reason) {
    try {
      await api.post('/api/inventori/rekomendasi/process', {
        rekomendasi_ids: [item.rekomendasi_id],
        note: `Diabaikan oleh admin PO: ${reason}`,
      });
      setItems((prev) => prev.filter((i) => i.rekomendasi_id !== item.rekomendasi_id));
      setIgnoreTarget(null);
      return true;
    } catch (_) {
      return false;
    }
  }

  const showCabang = !isPerOutlet || showAll;
  const totalCount = items.length;
  const displayCount = filteredItems.length;

  const filterLabel =
    dateFilter === '7d' ? '7 hari terakhir'
    : dateFilter === 'today' ? 'hari ini'
    : dateFilter === 'yesterday' ? 'kemarin'
    : 'semua tanggal';

  return (
    <div className="bg-orange-50 border border-orange-200 rounded-xl overflow-hidden">
      {ignoreTarget && (
        <IgnoreReasonModal
          item={ignoreTarget}
          onCancel={() => setIgnoreTarget(null)}
          onConfirm={handleIgnoreConfirm}
        />
      )}

      {/* Header */}
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2.5 text-left"
        onClick={() => setCollapsed((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-orange-800">📋 Rekomendasi Staff</span>
          {!loading && totalCount > 0 && (
            <span className="text-[11px] bg-orange-500 text-white px-1.5 py-0.5 rounded-full font-bold leading-none">
              {displayCount}
            </span>
          )}
        </div>
        <span className="text-orange-400 text-xs">{collapsed ? '▶' : '▼'}</span>
      </button>

      {!collapsed && (
        <div className="border-t border-orange-200">
          {/* Filter tanggal (queue pending) */}
          <div className="flex border-b border-orange-200 text-[11px] font-semibold">
            {DATE_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setDateFilter(f.id)}
                className={`flex-1 py-1.5 transition-colors border-l first:border-l-0 border-orange-200 ${
                  dateFilter === f.id ? 'bg-orange-500 text-white' : 'text-orange-600 hover:bg-orange-100'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Filter cabang — hanya per-outlet mode dan ada data */}
          {isPerOutlet && currentOutlet && totalCount > 0 && !loading && !error && (
            <div className="flex border-b border-orange-200 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setShowAll(false)}
                className={`flex-1 py-1.5 transition-colors ${
                  !showAll ? 'bg-orange-400 text-white' : 'text-orange-600 hover:bg-orange-100'
                }`}
              >
                {currentOutlet.name} ({thisOutletItems.length})
              </button>
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className={`flex-1 py-1.5 transition-colors border-l border-orange-200 ${
                  showAll ? 'bg-orange-400 text-white' : 'text-orange-600 hover:bg-orange-100'
                }`}
              >
                Semua ({totalCount})
              </button>
            </div>
          )}

          <div className="px-3 py-1">
            {loading && (
              <div className="text-xs text-orange-600 text-center py-3">
                <span className="inline-block animate-spin mr-1">⟳</span> Memuat...
              </div>
            )}

            {!loading && error && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 my-2">
                <p>⚠ {error}</p>
                <button onClick={fetchRekomendasi} className="underline mt-1 hover:text-amber-900">
                  Coba Lagi
                </button>
              </div>
            )}

            {/* Empty state diagnostik */}
            {!loading && !error && filteredItems.length === 0 && (
              <div className="py-2 space-y-1.5">
                {totalCount === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-2">
                    ✅ Tidak ada rekomendasi pending ({filterLabel}).
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-gray-500 text-center py-1">
                      Tidak ada rekomendasi untuk{' '}
                      <strong>{currentOutlet?.name || 'cabang ini'}</strong>.
                    </p>
                    {!currentOutletMapped ? (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 text-center">
                        ⚠ Outlet ini belum dipetakan ke cabang Inventori. Atur kolom{' '}
                        <strong>"Nama di Inventori"</strong> di Master Data → Outlet.
                      </p>
                    ) : (
                      <div className="text-xs text-orange-700 bg-orange-100/60 border border-orange-200 rounded-lg p-2 text-center">
                        Ada <strong>{totalCount}</strong> rekomendasi pending di cabang lain
                        {unmappedBranchCount > 0 && (
                          <> ({unmappedBranchCount} belum termapping ke outlet PO)</>
                        )}.
                        <button
                          onClick={() => setShowAll(true)}
                          className="block w-full mt-1.5 underline font-medium hover:text-orange-900"
                        >
                          Lihat Semua
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {!loading && !error && filteredItems.length > 0 && (
              <div>
                {filteredItems.map((item) => (
                  <RekomendasiItem
                    key={item.rekomendasi_id}
                    item={item}
                    material={findMaterial(item)}
                    isAdded={addedIds.has(item.rekomendasi_id)}
                    onAdd={handleAdd}
                    onIgnore={setIgnoreTarget}
                    showCabang={showCabang}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
