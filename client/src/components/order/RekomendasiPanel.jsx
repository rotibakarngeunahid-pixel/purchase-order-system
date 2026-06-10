import { useEffect, useState } from 'react';
import api, { formatDateID } from '../../lib/api';

function RekomendasiItem({ item, material, isAdded, onAdd }) {
  const hasNumber = item.tipe_stok !== 'foto' && item.stok_akhir !== null && item.stok_akhir !== undefined;
  const hasPhoto  = !!item.foto_url;

  return (
    <div className="border border-orange-200 rounded-xl p-3 bg-white">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-gray-900 truncate">{item.nama_bahan}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {item.nama_cabang} · {formatDateID(item.tanggal)}
          </p>
          {hasNumber && (
            <p className="text-xs text-orange-700 mt-1 font-medium">
              Sisa: {item.stok_akhir} {material?.package_unit || ''}
            </p>
          )}
          {!hasNumber && hasPhoto && (
            <a
              href={item.foto_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block mt-1"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={item.foto_url.replace('/view', '/preview')}
                alt="stok"
                className="w-14 h-14 object-cover rounded-lg border border-orange-200"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            </a>
          )}
          {!hasNumber && !hasPhoto && (
            <p className="text-xs text-gray-400 mt-1">Stok: lihat laporan inventori</p>
          )}
        </div>
        <div className="flex-shrink-0 mt-0.5">
          {!material && (
            <span
              className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg block text-center"
              title="Bahan ini belum ada di master data PO — isi sheet Mapping_Bahan_PO"
            >
              Belum di master PO
            </span>
          )}
          {material && !isAdded && (
            <button
              onClick={() => onAdd(material.id, item.rekomendasi_id)}
              className="text-xs bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap"
            >
              + Tambahkan
            </button>
          )}
          {material && isAdded && (
            <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-lg font-medium">
              ✓ Ditambahkan
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RekomendasiPanel({ materials, onAddToOrder, addedIds }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetchRekomendasi();
  }, []);

  async function fetchRekomendasi() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/inventori/rekomendasi?status=pending');
      setItems(res.data?.data || []);
    } catch (err) {
      // Jika env belum dikonfigurasi (503), jangan tampilkan panel sama sekali
      if (err.response?.status === 503) {
        setDismissed(true);
        return;
      }
      setError('Gagal memuat rekomendasi. Panel ini tidak mempengaruhi order.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDismissAll() {
    if (items.length === 0) { setDismissed(true); return; }
    try {
      const ids = items.map(i => i.rekomendasi_id);
      await api.post('/api/inventori/rekomendasi/process', { rekomendasi_ids: ids, note: 'Diabaikan oleh admin' });
    } catch (_) {
      // Gagal proses tidak masalah — tetap sembunyikan panel
    }
    setDismissed(true);
  }

  // Jangan render sama sekali jika dismissed atau env belum dikonfigurasi
  if (dismissed) return null;

  // Cari material PO berdasarkan po_material_id dari mapping inventori
  function findMaterial(item) {
    if (!item.po_material_id) return null;
    return materials.find(m => m.id === item.po_material_id) || null;
  }

  const pendingCount = items.length;

  return (
    <div className="bg-orange-50 border border-orange-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2.5 cursor-pointer select-none"
        onClick={() => setCollapsed(v => !v)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-orange-800">📋 Rekomendasi Staff</span>
          {!loading && pendingCount > 0 && (
            <span className="text-xs bg-orange-500 text-white px-1.5 py-0.5 rounded-full font-bold">
              {pendingCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-orange-400 text-xs">{collapsed ? '▶' : '▼'}</span>
        </div>
      </div>

      {!collapsed && (
        <div className="px-3 pb-3 space-y-2 border-t border-orange-200 pt-2">
          {loading && (
            <div className="text-xs text-orange-600 text-center py-2">
              <span className="animate-spin inline-block mr-1">⟳</span> Memuat rekomendasi...
            </div>
          )}

          {!loading && error && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
              <p>⚠ {error}</p>
              <button
                onClick={fetchRekomendasi}
                className="underline mt-1 hover:text-amber-900"
              >
                Coba Lagi
              </button>
            </div>
          )}

          {!loading && !error && items.length === 0 && (
            <div className="text-xs text-gray-400 text-center py-2">
              ✅ Tidak ada rekomendasi baru dari staff.
            </div>
          )}

          {!loading && !error && items.map(item => (
            <RekomendasiItem
              key={item.rekomendasi_id}
              item={item}
              material={findMaterial(item)}
              isAdded={addedIds.has(item.rekomendasi_id)}
              onAdd={onAddToOrder}
            />
          ))}

          {!loading && items.length > 0 && (
            <button
              onClick={handleDismissAll}
              className="w-full text-xs text-orange-500 hover:text-orange-700 mt-1 py-1 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors"
            >
              Tutup / Tandai Semua Diproses
            </button>
          )}
        </div>
      )}
    </div>
  );
}
