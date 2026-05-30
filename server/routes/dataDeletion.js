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

const PAGE_SIZE = 1000;
/** Batas aman untuk filter .in() di PostgREST (UUID panjang) */
const IN_CHUNK = 80;

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

/** Ambil semua baris dengan paginasi (menghindari batas default 1000 baris Supabase). */
async function fetchPaged(buildQuery) {
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

/** Hapus baris dalam batch agar filter .in() tidak melebihi batas URL PostgREST. */
async function deleteInChunks(table, column, ids) {
  if (!ids.length) return;

  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    const { error } = await supabase.from(table).delete().in(column, chunk);
    if (error) throw error;
  }
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

async function countByIds(table, column, ids, filterFn) {
  if (!ids.length) return 0;

  let total = 0;
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    let query = supabase.from(table).select('*', { count: 'exact', head: true }).in(column, chunk);
    if (filterFn) query = filterFn(query);
    const { count, error } = await query;
    if (error) return 0;
    total += count || 0;
  }
  return total;
}

/**
 * Ambil semua PO dalam rentang tanggal order (halaman Catat Penerimaan).
 * Menggunakan inner join ke order_sessions agar filter tanggal konsisten.
 */
async function fetchPurchaseOrdersInRange(dateFrom, dateTo) {
  try {
    return await fetchPaged(() =>
      supabase
        .from('purchase_orders')
        .select('id, session_id, session:order_sessions!inner(order_date)')
        .gte('session.order_date', dateFrom)
        .lte('session.order_date', dateTo)
        .order('id')
    );
  } catch (joinError) {
    console.warn('[DataDeletion] PO join query fallback:', joinError.message);
    return [];
  }
}

/**
 * Kumpulkan ID sesi, PO, dan item PO yang masuk dalam rentang tanggal.
 * Dipakai baik untuk preview maupun eksekusi.
 */
async function gatherIds(dateFrom, dateTo) {
  const sessions = await fetchPaged(() =>
    supabase
      .from('order_sessions')
      .select('id')
      .gte('order_date', dateFrom)
      .lte('order_date', dateTo)
      .order('id')
  );

  const posInRange = await fetchPurchaseOrdersInRange(dateFrom, dateTo);

  const sessionIdSet = new Set([
    ...sessions.map((s) => s.id),
    ...posInRange.map((p) => p.session_id).filter(Boolean),
  ]);
  const sessionIds = [...sessionIdSet];

  let poIds = [...new Set(posInRange.map((p) => p.id))];

  // Cadangan: PO yang terhubung ke sesi dalam rentang (jika join filter tidak tersedia)
  if (sessionIds.length > 0) {
    for (let i = 0; i < sessionIds.length; i += IN_CHUNK) {
      const chunk = sessionIds.slice(i, i + IN_CHUNK);
      const { data: pos, error } = await supabase
        .from('purchase_orders')
        .select('id')
        .in('session_id', chunk);

      if (error) throw error;
      (pos || []).forEach((p) => poIds.push(p.id));
    }
    poIds = [...new Set(poIds)];
  }

  let poItemIds = [];
  if (poIds.length > 0) {
    for (let i = 0; i < poIds.length; i += IN_CHUNK) {
      const chunk = poIds.slice(i, i + IN_CHUNK);
      const items = await fetchPaged(() =>
        supabase.from('purchase_order_items').select('id').in('po_id', chunk).order('id')
      );
      poItemIds.push(...items.map((item) => item.id));
    }
    poItemIds = [...new Set(poItemIds)];
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
    countByIds('order_request_items', 'session_id', sessionIds),
    countByIds('order_outlet_holiday_metadata', 'session_id', sessionIds),
    countByIds('purchase_item_branch_distribution', 'po_item_id', poItemIds),
    safeCount('purchase_report', (q) => q.gte('date', dateFrom).lte('date', dateTo)),
    safeCount('report_resets', (q) =>
      q.gte('reset_at', dateFrom).lt('reset_at', nextDay(dateTo))),
    safeCount('branch_holidays', (q) =>
      q.eq('recurrence_type', 'none')
        .gte('holiday_date', dateFrom)
        .lte('holiday_date', dateTo)),
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

    const { sessionIds, poIds, poItemIds } = await gatherIds(date_from, date_to);

    // ── Urutan hapus: anak dulu, baru induk ─────────────────────────────────

    // 1. Distribusi roti per cabang (anak dari purchase_order_items)
    if (poItemIds.length > 0) {
      try {
        await deleteInChunks('purchase_item_branch_distribution', 'po_item_id', poItemIds);
      } catch (error) {
        console.error('[DataDeletion] branch_distribution:', error.message);
      }
    }

    // 2. Item PO (anak dari purchase_orders)
    if (poIds.length > 0) {
      await deleteInChunks('purchase_order_items', 'po_id', poIds);
    }

    // 3. Purchase Orders — sumber data halaman Catat Penerimaan
    if (poIds.length > 0) {
      await deleteInChunks('purchase_orders', 'id', poIds);
    } else if (sessionIds.length > 0) {
      await deleteInChunks('purchase_orders', 'session_id', sessionIds);
    }

    // 4. Permintaan item cabang (anak dari order_sessions)
    if (sessionIds.length > 0) {
      await deleteInChunks('order_request_items', 'session_id', sessionIds);
    }

    // 5. Metadata hari libur sesi (non-fatal — tabel mungkin belum ada)
    if (sessionIds.length > 0) {
      try {
        await deleteInChunks('order_outlet_holiday_metadata', 'session_id', sessionIds);
      } catch (e) {
        console.warn('[DataDeletion] order_outlet_holiday_metadata skip:', e.message);
      }
    }

    // 6. Sesi order
    if (sessionIds.length > 0) {
      await deleteInChunks('order_sessions', 'id', sessionIds);
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
      ` (${poIds.length} PO / Catat Penerimaan)` +
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
