/**
 * Reset Data Route
 * Hard delete data operasional berdasarkan kombinasi filter: cabang (outlet)
 * dan/atau jenis data, dengan rentang tanggal opsional sebagai filter tambahan.
 * Master data (outlets, suppliers, materials, dll) TIDAK ikut terhapus.
 *
 * Seluruh proses hapus dijalankan lewat fungsi Postgres (RPC) di dalam SATU
 * transaksi database — kalau ada error di tengah proses, seluruh perubahan
 * otomatis di-rollback. Lihat supabase/migration_reset_data.sql.
 *
 * Endpoint:
 *   GET  /api/data-deletion/data-types → daftar jenis data yang bisa dipilih
 *   POST /api/data-deletion/preview    → hitung berapa record yang akan dihapus (read-only)
 *   POST /api/data-deletion/execute    → eksekusi penghapusan (perlu confirm: true)
 */

const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const { extractDistribusiPath, removeDistribusiFiles } = require('../services/photoCleanup');

/** Jenis data yang bisa dipilih pengguna, beserta label & tabel yang terpengaruh. */
const DATA_TYPES = [
  {
    key: 'order',
    label: 'Order (Sesi Order + Permintaan Bahan per Cabang)',
    tables: ['order_sessions', 'order_request_items', 'order_outlet_holiday_metadata'],
    branchScoped: true,
  },
  {
    key: 'purchase_order',
    label: 'Penerimaan / Purchase Order (PO + Item + Distribusi Cabang)',
    tables: ['purchase_orders', 'purchase_order_items', 'purchase_item_branch_distribution'],
    branchScoped: true,
    note: 'Satu PO bisa dikirim ke beberapa cabang. PO/item hanya ikut terhapus jika seluruh cabang penerimanya termasuk dalam pilihan.',
  },
  {
    key: 'purchase_report',
    label: 'Laporan Barang Masuk',
    tables: ['purchase_report', 'report_resets'],
    branchScoped: true,
    note: 'Catatan Reset Laporan (report_resets) hanya ikut terhapus bila cabang = Semua Cabang.',
  },
  {
    key: 'price_log',
    label: 'Log Harga Bahan',
    tables: ['material_price_logs'],
    branchScoped: false,
    note: 'Tidak terikat cabang tertentu — akan terhapus untuk semua cabang setiap kali dipilih.',
  },
  {
    key: 'distribution_photo',
    label: 'Foto Distribusi',
    tables: ['distribution_photos'],
    branchScoped: true,
    note: 'File foto di Supabase Storage ikut dihapus.',
  },
  {
    key: 'branch_holiday',
    label: 'Hari Libur Spesifik per Cabang',
    tables: ['branch_holidays'],
    branchScoped: true,
    note: 'Hanya hari libur tanggal tertentu (one-time). Hari libur mingguan yang berulang tidak ikut terhapus.',
  },
  {
    key: 'finance_log',
    label: 'Log Akses Portal Keuangan',
    tables: ['finance_portal_access_logs'],
    branchScoped: true,
  },
];

const VALID_TYPE_KEYS = DATA_TYPES.map((t) => t.key);

/** Label ramah untuk setiap key tabel hasil RPC (dipakai di response). */
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

function isValidDate(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(str + 'T00:00:00Z');
  return !isNaN(d.getTime());
}

/** Validasi & normalisasi body request bersama untuk preview & execute. */
function parseFilters(body) {
  const { outlet_ids, data_types, date_from, date_to } = body;

  if (outlet_ids !== undefined && !Array.isArray(outlet_ids)) {
    return { error: 'outlet_ids harus berupa array' };
  }
  if (!Array.isArray(data_types) || data_types.length === 0) {
    return { error: 'Pilih minimal satu jenis data yang ingin dihapus' };
  }
  const unknownType = data_types.find((t) => !VALID_TYPE_KEYS.includes(t));
  if (unknownType) {
    return { error: `Jenis data tidak dikenal: ${unknownType}` };
  }
  if (date_from && !isValidDate(date_from)) {
    return { error: 'Format tanggal mulai tidak valid. Gunakan format YYYY-MM-DD' };
  }
  if (date_to && !isValidDate(date_to)) {
    return { error: 'Format tanggal akhir tidak valid. Gunakan format YYYY-MM-DD' };
  }
  if (date_from && date_to && date_from > date_to) {
    return { error: 'Tanggal mulai tidak boleh lebih besar dari tanggal akhir' };
  }

  return {
    outletIds: outlet_ids && outlet_ids.length > 0 ? outlet_ids : null,
    dataTypes: data_types,
    dateFrom: date_from || null,
    dateTo: date_to || null,
  };
}

/** Buang key internal (mis. daftar file foto) sebelum dikirim ke client. */
function toPublicResult(rpcResult) {
  const { _distribution_photo_files, ...counts } = rpcResult || {};
  return counts;
}

// ─── GET /api/data-deletion/data-types ───────────────────────────────────────
router.get('/data-types', (req, res) => {
  res.json(DATA_TYPES.map(({ key, label, branchScoped, note }) => ({ key, label, branchScoped, note })));
});

// ─── POST /api/data-deletion/preview ─────────────────────────────────────────
router.post('/preview', async (req, res) => {
  const filters = parseFilters(req.body);
  if (filters.error) return res.status(400).json({ error: filters.error });

  try {
    const { data, error } = await supabase.rpc('reset_data_preview', {
      p_outlet_ids: filters.outletIds,
      p_data_types: filters.dataTypes,
      p_date_from: filters.dateFrom,
      p_date_to: filters.dateTo,
    });
    if (error) throw error;

    const preview = toPublicResult(data);
    const total = Object.values(preview).reduce((sum, v) => sum + (v || 0), 0);
    res.json({ preview, total, outlet_ids: filters.outletIds, data_types: filters.dataTypes, date_from: filters.dateFrom, date_to: filters.dateTo });
  } catch (err) {
    console.error('[ResetData] Preview error:', err);
    res.status(500).json({ error: err.message || 'Gagal memuat preview data' });
  }
});

// ─── POST /api/data-deletion/execute ─────────────────────────────────────────
router.post('/execute', async (req, res) => {
  const filters = parseFilters(req.body);
  if (filters.error) return res.status(400).json({ error: filters.error });
  if (!req.body.confirm) {
    return res.status(400).json({ error: 'Konfirmasi wajib diberikan sebelum menghapus data' });
  }

  try {
    const { data, error } = await supabase.rpc('reset_data_execute', {
      p_outlet_ids: filters.outletIds,
      p_data_types: filters.dataTypes,
      p_date_from: filters.dateFrom,
      p_date_to: filters.dateTo,
    });
    if (error) throw error;

    // Data DB sudah permanen terhapus & ter-commit di titik ini. Bersihkan file
    // foto di Supabase Storage secara best-effort (kegagalan di sini tidak
    // membatalkan penghapusan data yang sudah berhasil).
    let filesDeleted = 0;
    const photoGroups = data?._distribution_photo_files;
    if (Array.isArray(photoGroups) && photoGroups.length > 0) {
      const filePaths = photoGroups
        .flatMap((photos) => (Array.isArray(photos) ? photos : []))
        .map((p) => extractDistribusiPath(p?.url))
        .filter(Boolean);
      if (filePaths.length > 0) {
        try {
          filesDeleted = await removeDistribusiFiles(filePaths);
        } catch (storageErr) {
          console.error('[ResetData] Gagal menghapus file foto distribusi:', storageErr.message);
        }
      }
    }

    const deleted = toPublicResult(data);
    const totalDeleted = Object.values(deleted).reduce((sum, v) => sum + (v || 0), 0);

    console.log(
      `[ResetData] Berhasil menghapus ${totalDeleted} record` +
      ` | cabang: ${filters.outletIds ? filters.outletIds.join(',') : 'SEMUA'}` +
      ` | jenis: ${filters.dataTypes.join(',')}` +
      ` | file foto: ${filesDeleted}` +
      ` | oleh user ${req.user?.role || 'admin'}`
    );

    res.json({
      success: true,
      message: totalDeleted > 0
        ? `Berhasil menghapus ${totalDeleted} record data secara permanen.`
        : 'Tidak ada data yang cocok dengan filter yang dipilih.',
      deleted,
      total_deleted: totalDeleted,
      files_deleted: filesDeleted,
      outlet_ids: filters.outletIds,
      data_types: filters.dataTypes,
      date_from: filters.dateFrom,
      date_to: filters.dateTo,
      deleted_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[ResetData] Execute error:', err);
    res.status(500).json({ error: err.message || 'Terjadi kesalahan saat menghapus data' });
  }
});

module.exports = router;
module.exports.DATA_TYPES = DATA_TYPES;
module.exports.TABLE_LABELS = TABLE_LABELS;
module.exports.parseFilters = parseFilters;
module.exports.VALID_TYPE_KEYS = VALID_TYPE_KEYS;
