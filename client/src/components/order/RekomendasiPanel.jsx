import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import api, { formatDateID } from '../../lib/api';

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

function getGDriveThumbnailUrl(url) {
  if (!url) return null;
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) return null;
  return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w200`;
}

function RekomendasiItem({ item, material, isAdded, onAdd, showCabang }) {
  const [lightbox, setLightbox] = useState(false);
  const hasNumber = item.tipe_stok !== 'foto' && item.stok_akhir !== null && item.stok_akhir !== undefined;
  const thumbUrl = !hasNumber ? getGDriveThumbnailUrl(item.foto_url) : null;
  const fullUrl  = thumbUrl ? `https://drive.google.com/thumbnail?id=${item.foto_url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)?.[1]}&sz=w1200` : null;
  const unit = material?.package_unit || '';

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
            {!material && (
              <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-medium whitespace-nowrap">
                Belum dipetakan
              </span>
            )}
            {material && !isAdded && (
              <button
                onClick={() => onAdd(material.id, item.rekomendasi_id)}
                className="text-xs bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white px-2.5 py-1 rounded-lg font-semibold transition-colors whitespace-nowrap"
              >
                + Tambah
              </button>
            )}
            {material && isAdded && (
              <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-lg font-medium whitespace-nowrap">
                ✓ Ditambahkan
              </span>
            )}
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">
          {showCabang && (
            <span className="font-medium text-orange-600">{item.nama_cabang} · </span>
          )}
          {formatDateID(item.tanggal)}
        </p>
        {hasNumber && (
          <p className="text-xs text-orange-600 font-semibold mt-0.5">
            Sisa: {item.stok_akhir}{unit ? ` ${unit}` : ''}
          </p>
        )}
      </div>
    </div>
  );
}

export default function RekomendasiPanel({ materials, onAddToOrder, addedIds, currentOutlet, inputMode }) {
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [showAll, setShowAll]   = useState(false);

  useEffect(() => { fetchRekomendasi(); }, []);

  async function fetchRekomendasi() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/inventori/rekomendasi?status=pending');
      setItems(res.data?.data || []);
    } catch (err) {
      if (err.response?.status === 503) {
        setError('Integrasi inventori belum aktif di server. Hubungi admin untuk mengatur env INVENTORI_GAS_URL & INVENTORI_API_KEY di Vercel.');
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
    const outletKey = (currentOutlet.inventori_cabang_name || currentOutlet.name).toLowerCase();
    return items.filter((item) => item.nama_cabang.toLowerCase() === outletKey);
  }, [items, currentOutlet]);

  const filteredItems = useMemo(() => {
    if (!isPerOutlet || showAll || !currentOutlet) return items;
    return thisOutletItems;
  }, [items, thisOutletItems, isPerOutlet, showAll, currentOutlet]);

  async function handleMarkProcessed() {
    const ids = filteredItems
      .filter((i) => !addedIds.has(i.rekomendasi_id))
      .map((i) => i.rekomendasi_id);
    if (ids.length === 0) return;
    try {
      await api.post('/api/inventori/rekomendasi/process', {
        rekomendasi_ids: ids,
        note: showAll || !currentOutlet ? 'Diabaikan oleh admin' : `Diabaikan untuk ${currentOutlet.name}`,
      });
    } catch (_) {}
    setItems((prev) => prev.filter((item) => !ids.includes(item.rekomendasi_id)));
  }

  const showCabang = !isPerOutlet || showAll;
  const totalCount = items.length;
  const displayCount = filteredItems.length;

  return (
    <div className="bg-orange-50 border border-orange-200 rounded-xl overflow-hidden">
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
          {/* Filter toggle — hanya tampil di per-outlet mode dan ada data */}
          {isPerOutlet && currentOutlet && totalCount > 0 && !loading && !error && (
            <div className="flex border-b border-orange-200 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setShowAll(false)}
                className={`flex-1 py-1.5 transition-colors ${
                  !showAll
                    ? 'bg-orange-500 text-white'
                    : 'text-orange-600 hover:bg-orange-100'
                }`}
              >
                {currentOutlet.name} ({thisOutletItems.length})
              </button>
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className={`flex-1 py-1.5 transition-colors border-l border-orange-200 ${
                  showAll
                    ? 'bg-orange-500 text-white'
                    : 'text-orange-600 hover:bg-orange-100'
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
                <button
                  onClick={fetchRekomendasi}
                  className="underline mt-1 hover:text-amber-900"
                >
                  Coba Lagi
                </button>
              </div>
            )}

            {!loading && !error && filteredItems.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-3">
                ✅ Tidak ada rekomendasi
                {isPerOutlet && !showAll && currentOutlet ? ` untuk ${currentOutlet.name}` : ''}.
              </p>
            )}

            {!loading && !error && filteredItems.length > 0 && (
              <div>
                {filteredItems.map((item) => (
                  <RekomendasiItem
                    key={item.rekomendasi_id}
                    item={item}
                    material={findMaterial(item)}
                    isAdded={addedIds.has(item.rekomendasi_id)}
                    onAdd={onAddToOrder}
                    showCabang={showCabang}
                  />
                ))}
              </div>
            )}

            {!loading && !error && filteredItems.length > 0 && (
              <button
                type="button"
                onClick={handleMarkProcessed}
                className="w-full text-[11px] text-orange-400 hover:text-orange-600 mt-1 mb-1 py-1.5 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors"
              >
                Tandai {showAll || !isPerOutlet ? 'semua' : currentOutlet?.name} sudah diproses
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
