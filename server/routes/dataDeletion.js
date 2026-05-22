/**
 * Data Deletion Route
 * Hapus data transaksi/operasional berdasarkan rentang tanggal.
 * Master data (outlets, suppliers, materials, dll) TIDAK ikut terhapus.
 *
 * Endpoint:
 *   POST /api/data-deletion/preview  → hitung berapa record yang akan dihapus
 *   POST /api/data-deletion/execute  → eksekusi penghapusan (perlu confirm: true)
 */

const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');

// ─── Tabel yang BOLEH dihapus (operasional/transaksional) ─────────────────────
// Master data seperti outlets, suppliers, materials, material_variants,
// settings, finance_portal_config, dan branch_holidays weekly TIDAK termasuk.
// ─────────────────────────────────────────────────────────────────────────────

function isValidDate(str) {
  if (!str || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(str + 'T00:00:00Z');
  return !isNaN(d.getTime());
}

function nextDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + 1));
  return date.toISOString().split('T')[0];
}

/** Hitung jumlah baris di tabel dengan filter tertentu. Mengembalikan 0 jika tabel tidak ada. */
async function safeCount(table, filterFn) {
  try {
    let query = supabase.from(table).select('*', { count: 'exact', head: true });
    if (filterFn) query = filterFn(query);
    const { count, error } = await query;
    if (error) return 0;
    return count || 0;
  } catch {
    return 0;
  }
}

/**
 * Kumpulkan ID sesi, PO, dan item PO yang masuk dalam rentang tanggal.
 * Dipakai baik untuk preview maupun eksekusi.
 */
async function gatherIds(dateFrom, dateTo) {
  // Sesi order dalam rentang tanggal
  const { data: sessions } = await supabase
    .from('order_sessions')
    .select('id')
    .gte('order_date', dateFrom)
    .lte('order_date', dateTo);
  const sessionIds = (sessions || []).map((s) => s.id);

  // PO yang terkait sesi tersebut
  let poIds = [];
  if (sessionIds.length > 0) {
    const { data: pos } = await supabase
      .from('purchase_orders')
      .select('id')
      .in('session_id', sessionIds);
    poIds = (pos || []).map((p) => p.id);
  }

  // Item PO dari PO-PO tersebut
  let poItemIds = [];
  if (poIds.length > 0) {
    const { data: items } = await supabase
      .from('purchase_order_items')
      .select('id')
      .in('po_id', poIds);
    poItemIds = (items || []).map((i) => i.id);
  }

  return { sessionIds, poIds, poItemIds };
}

/**
 * Hitung semua record yang akan terhapus tanpa benar-benar menghapusnya.
 * Mengembalikan objek { preview, total }.
 */
async function buildPreview(dateFrom, dateTo) {
  const { sessionIds, poIds, poItemIds } = await gatherIds(dateFrom, dateTo);

  const [
    orderRequestItemCount,
    orderHolidayMetaCount,
    branchDistributionCount,
    purchaseReportCount,
    reportResetsCount,
    branchHolidaysOnetimeCount,
    financePortalLogsCount,
  ] = await Promise.all([
    // Permintaan cabang yang terkait sesi
    sessionIds.length > 0
      ? safeCount('order_request_items', (q) => q.in('session_id', sessionIds))
      : 0,
    // Metadata hari libur per sesi
    sessionIds.length > 0
      ? safeCount('order_outlet_holiday_metadata', (q) => q.in('session_id', sessionIds))
      : 0,
    // Distribusi roti ke cabang
    poItemIds.length > 0
      ? safeCount('purchase_item_branch_distribution', (q) => q.in('po_item_id', poItemIds))
      : 0,
    // Laporan barang masuk (purchase_report)
    safeCount('purchase_report', (q) => q.gte('date', dateFrom).lte('date', dateTo)),
    // Catatan reset laporan
    safeCount('report_resets', (q) =>
      q.gte('reset_at', dateFrom).lt('reset_at', nextDay(dateTo))),
    // Hari libur spesifik (one-time, bukan mingguan)
    safeCount('branch_holidays', (q) =>
      q.eq('recurrence_type', 'none')
        .gte('holiday_date', dateFrom)
        .lte('holiday_date', dateTo)),
    // Log akses portal keuangan
    safeCount('finance_portal_access_logs', (q) =>
      q.gte('accessed_at', dateFrom).lt('accessed_at', nextDay(dateTo))),
  ]);

  const preview = {
    order_sessions: sessionIds.length,
    order_request_items: orderRequestItemCount,
    order_outlet_holiday_metadata: orderHolidayMetaCount,
    purchase_orders: poIds.length,
    purchase_order_items: poItemIds.length,
    purchase_item_branch_distribution: branchDistributionCount,
    purchase_report: purchaseReportCount,
    report_resets: reportResetsCount,
    branch_holidays_onetime: branchHolidaysOnetimeCount,
    finance_portal_access_logs: financePortalLogsCount,
  };

  const total = Object.values(preview).reduce((sum, v) => sum + v, 0);
  return { preview, total };
}

// ─── POST /api/data-deletion/preview ─────────────────────────────────────────
router.post('/preview', async (req, res) => {
  const { date_from, date_to } = req.body;

  if (!date_from || !date_to) {
    return res.status(400).json({ error: 'Tanggal mulai dan tanggal akhir wajib diisi' });
  }
  if (!isValidDate(date_from) || !isValidDate(date_to)) {
    return res.status(400).json({ error: 'Format tanggal tidak valid. Gunakan format YYYY-MM-DD' });
  }
  if (date_from > date_to) {
    return res.status(400).json({ error: 'Tanggal mulai tidak boleh lebih besar dari tanggal akhir' });
  }

  try {
    const { preview, total } = await buildPreview(date_from, date_to);
    res.json({ preview, total, date_from, date_to });
  } catch (err) {
    console.error('[DataDeletion] Preview error:', err);
    res.status(500).json({ error: err.message || 'Gagal memuat preview data' });
  }
});

// ─── POST /api/data-deletion/execute ─────────────────────────────────────────
router.post('/execute', async (req, res) => {
  const { date_from, date_to, confirm } = req.body;

  if (!date_from || !date_to) {
    return res.status(400).json({ error: 'Tanggal mulai dan tanggal akhir wajib diisi' });
  }
  if (!isValidDate(date_from) || !isValidDate(date_to)) {
    return res.status(400).json({ error: 'Format tanggal tidak valid. Gunakan format YYYY-MM-DD' });
  }
  if (date_from > date_to) {
    return res.status(400).json({ error: 'Tanggal mulai tidak boleh lebih besar dari tanggal akhir' });
  }
  if (!confirm) {
    return res.status(400).json({ error: 'Konfirmasi wajib diberikan sebelum menghapus data' });
  }

  try {
    // Hitung dulu (untuk laporan ringkasan setelah hapus)
    const { preview: counts } = await buildPreview(date_from, date_to);

    if (Object.values(counts).every((v) => v === 0)) {
      return res.status(200).json({
        success: true,
        message: 'Tidak ada data yang dihapus karena tidak ditemukan data dalam rentang tanggal tersebut.',
        deleted: counts,
        total_deleted: 0,
        date_from,
        date_to,
        deleted_at: new Date().toISOString(),
      });
    }

    // Kumpulkan ID yang akan dihapus
    const { sessionIds, poIds, poItemIds } = await gatherIds(date_from, date_to);

    // ── Urutan hapus: anak dulu, baru induk ─────────────────────────────────

    // 1. Distribusi roti per cabang (anak dari purchase_order_items)
    if (poItemIds.length > 0) {
      const { error } = await supabase
        .from('purchase_item_branch_distribution')
        .delete()
        .in('po_item_id', poItemIds);
      if (error) console.error('[DataDeletion] branch_distribution:', error.message);
    }

    // 2. Item PO (anak dari purchase_orders)
    if (poIds.length > 0) {
      const { error } = await supabase
        .from('purchase_order_items')
        .delete()
        .in('po_id', poIds);
      if (error) {
        console.error('[DataDeletion] purchase_order_items:', error.message);
        return res.status(500).json({ error: 'Gagal menghapus item PO: ' + error.message });
      }
    }

    // 3. Purchase Orders (anak dari order_sessions)
    if (sessionIds.length > 0) {
      const { error } = await supabase
        .from('purchase_orders')
        .delete()
        .in('session_id', sessionIds);
      if (error) {
        console.error('[DataDeletion] purchase_orders:', error.message);
        return res.status(500).json({ error: 'Gagal menghapus purchase order: ' + error.message });
      }
    }

    // 4. Permintaan item cabang (anak dari order_sessions)
    if (sessionIds.length > 0) {
      const { error } = await supabase
        .from('order_request_items')
        .delete()
        .in('session_id', sessionIds);
      if (error) {
        console.error('[DataDeletion] order_request_items:', error.message);
        return res.status(500).json({ error: 'Gagal menghapus permintaan cabang: ' + error.message });
      }
    }

    // 5. Metadata hari libur sesi (non-fatal — tabel mungkin belum ada)
    if (sessionIds.length > 0) {
      try {
        await supabase
          .from('order_outlet_holiday_metadata')
          .delete()
          .in('session_id', sessionIds);
      } catch (e) {
        console.warn('[DataDeletion] order_outlet_holiday_metadata skip:', e.message);
      }
    }

    // 6. Sesi order
    if (sessionIds.length > 0) {
      const { error } = await supabase
        .from('order_sessions')
        .delete()
        .in('id', sessionIds);
      if (error) {
        console.error('[DataDeletion] order_sessions:', error.message);
        return res.status(500).json({ error: 'Gagal menghapus sesi order: ' + error.message });
      }
    }

    // 7. Laporan barang masuk (purchase_report) — tabel independen
    const { error: prError } = await supabase
      .from('purchase_report')
      .delete()
      .gte('date', date_from)
      .lte('date', date_to);
    if (prError) {
      console.error('[DataDeletion] purchase_report:', prError.message);
      return res.status(500).json({ error: 'Gagal menghapus laporan barang masuk: ' + prError.message });
    }

    // 8. Catatan reset laporan (non-fatal)
    try {
      await supabase
        .from('report_resets')
        .delete()
        .gte('reset_at', date_from)
        .lt('reset_at', nextDay(date_to));
    } catch (e) {
      console.warn('[DataDeletion] report_resets skip:', e.message);
    }

    // 9. Hari libur spesifik / one-time (non-fatal)
    try {
      await supabase
        .from('branch_holidays')
        .delete()
        .eq('recurrence_type', 'none')
        .gte('holiday_date', date_from)
        .lte('holiday_date', date_to);
    } catch (e) {
      console.warn('[DataDeletion] branch_holidays_onetime skip:', e.message);
    }

    // 10. Log akses portal keuangan (non-fatal)
    try {
      await supabase
        .from('finance_portal_access_logs')
        .delete()
        .gte('accessed_at', date_from)
        .lt('accessed_at', nextDay(date_to));
    } catch (e) {
      console.warn('[DataDeletion] finance_portal_access_logs skip:', e.message);
    }

    const totalDeleted = Object.values(counts).reduce((sum, v) => sum + v, 0);

    console.log(
      `[DataDeletion] Berhasil menghapus ${totalDeleted} record` +
      ` untuk periode ${date_from} s/d ${date_to}` +
      ` oleh user ${req.user?.role || 'admin'}`
    );

    res.json({
      success: true,
      message: `Berhasil menghapus ${totalDeleted} record data untuk periode ${date_from} s/d ${date_to}.`,
      deleted: counts,
      total_deleted: totalDeleted,
      date_from,
      date_to,
      deleted_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[DataDeletion] Execute error:', err);
    res.status(500).json({ error: err.message || 'Terjadi kesalahan saat menghapus data' });
  }
});

module.exports = router;
