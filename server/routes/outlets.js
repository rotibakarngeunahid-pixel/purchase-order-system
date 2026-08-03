const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const { extractDistribusiPath, removeDistribusiFiles } = require('../services/photoCleanup');

// Label ramah untuk tiap kategori data yang ikut terhapus saat hapus paksa
// (lihat supabase/migration_outlet_cascade_delete.sql).
const CASCADE_LABELS = {
  order_sessions: 'Sesi Order',
  order_request_items: 'Permintaan Bahan per Cabang',
  order_outlet_holiday_metadata: 'Metadata Hari Libur Sesi',
  purchase_orders: 'Catat Penerimaan (Purchase Order)',
  purchase_order_items: 'Item Penerimaan PO',
  purchase_item_branch_distribution: 'Distribusi Roti ke Cabang',
  purchase_report: 'Laporan Barang Masuk',
  distribution_photos: 'Foto Distribusi',
  branch_holidays_onetime: 'Hari Libur Spesifik (tanggal tertentu)',
  branch_holidays: 'Hari Libur Cabang (termasuk mingguan berulang)',
  finance_portal_access_logs: 'Log Akses Portal Keuangan',
  outlet_material_suppliers: 'Mapping Supplier per Bahan',
  mitra_purchases: 'Transaksi Pembelian Mitra',
};

function isMissingCascadeFunctionError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('outlet_delete_cascade') || (message.includes('function') && message.includes('does not exist'));
}

// Ubah hasil RPC (counts + outlet_name + file foto internal) jadi bentuk
// yang aman ditampilkan ke client.
function toPublicCascadeResult(rpcResult) {
  const { _distribution_photo_files, outlet_name, ...rawCounts } = rpcResult || {};
  const counts = Object.entries(rawCounts)
    .filter(([, v]) => Number(v) > 0)
    .map(([key, count]) => ({ key, label: CASCADE_LABELS[key] || key, count: Number(count) }));
  const total = counts.reduce((sum, c) => sum + c.count, 0);
  return { outlet_name, counts, total, _distribution_photo_files };
}

router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('outlets')
    .select('*')
    .order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/', async (req, res) => {
  const { name, inventori_branch_id, inventori_cabang_name, min_stock_roti } = req.body;
  if (!name) return res.status(400).json({ error: 'name wajib diisi' });
  const { data, error } = await supabase
    .from('outlets')
    .insert({
      name,
      inventori_branch_id: inventori_branch_id || null,
      inventori_cabang_name: inventori_cabang_name || null,
      min_stock_roti: Number(min_stock_roti) || 0,
    })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, is_active, inventori_branch_id, inventori_cabang_name, min_stock_roti } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (is_active !== undefined) updates.is_active = is_active;
  if (inventori_branch_id !== undefined) updates.inventori_branch_id = inventori_branch_id || null;
  if (inventori_cabang_name !== undefined) updates.inventori_cabang_name = inventori_cabang_name || null;
  if (min_stock_roti !== undefined) updates.min_stock_roti = Number(min_stock_roti) || 0;

  const { data, error } = await supabase
    .from('outlets')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase
    .from('outlets')
    .delete()
    .eq('id', id);
  if (error) {
    if (error.code === '23503') {
      return res.status(400).json({
        error: 'Outlet tidak dapat dihapus karena masih terhubung dengan data order/mapping/laporan. Nonaktifkan saja lewat toggle.',
      });
    }
    return res.status(500).json({ error: error.message });
  }
  res.json({ success: true });
});

// Preview hapus paksa: hitung semua data yang akan ikut terhapus (read-only,
// dieksekusi lalu di-rollback di sisi database — lihat
// supabase/migration_outlet_cascade_delete.sql). Dipakai frontend untuk
// menampilkan rincian sebelum user mengonfirmasi hapus paksa.
router.get('/:id/delete-preview', async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase.rpc('outlet_delete_cascade_preview', { p_outlet_id: id });
  if (error) {
    if (error.code === 'P0001' && /tidak ditemukan/i.test(error.message)) {
      return res.status(404).json({ error: 'Outlet tidak ditemukan' });
    }
    if (isMissingCascadeFunctionError(error)) {
      return res.status(409).json({
        error: 'Fitur hapus paksa belum aktif. Jalankan supabase/migration_outlet_cascade_delete.sql di Supabase SQL Editor terlebih dahulu.',
      });
    }
    return res.status(500).json({ error: error.message });
  }
  const { _distribution_photo_files, ...preview } = toPublicCascadeResult(data);
  res.json(preview);
});

// Hapus paksa: hapus outlet BESERTA seluruh data terkait (order, PO,
// mapping supplier, pembelian mitra, dll) dalam satu transaksi. Tujuannya
// untuk outlet yang salah buat/percobaan/sudah tutup permanen — bukan
// operasi rutin, frontend wajib menampilkan preview + konfirmasi eksplisit
// (ketik ulang nama outlet) sebelum memanggil endpoint ini.
router.delete('/:id/cascade', async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase.rpc('outlet_delete_cascade_execute', { p_outlet_id: id });
  if (error) {
    if (error.code === 'P0001' && /tidak ditemukan/i.test(error.message)) {
      return res.status(404).json({ error: 'Outlet tidak ditemukan' });
    }
    if (isMissingCascadeFunctionError(error)) {
      return res.status(409).json({
        error: 'Fitur hapus paksa belum aktif. Jalankan supabase/migration_outlet_cascade_delete.sql di Supabase SQL Editor terlebih dahulu.',
      });
    }
    return res.status(500).json({ error: error.message });
  }

  // Data DB sudah permanen terhapus & ter-commit di titik ini. Bersihkan file
  // foto distribusi di Supabase Storage secara best-effort (kegagalan di sini
  // tidak membatalkan penghapusan data yang sudah berhasil).
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
        console.error('[OutletCascadeDelete] Gagal menghapus file foto distribusi:', storageErr.message);
      }
    }
  }

  const { outlet_name, counts, total } = toPublicCascadeResult(data);
  console.log(
    `[OutletCascadeDelete] Outlet "${outlet_name}" (${id}) dihapus permanen beserta ${total} record terkait` +
    ` | file foto: ${filesDeleted} | oleh user ${req.user?.role || 'admin'}`
  );
  res.json({ success: true, outlet_name, deleted: counts, total_deleted: total, files_deleted: filesDeleted });
});

module.exports = router;
