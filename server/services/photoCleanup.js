const supabase = require('./supabase');

const RETENTION_DAYS = 7;

/** Ekstrak path storage dari URL publik Supabase. Format: .../object/public/distribusi/<path> */
function extractDistribusiPath(url) {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/object\/public\/distribusi\/(.+)/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

/** Hapus batch file dari bucket 'distribusi' (maks 100 per panggilan). Mengembalikan jumlah file terhapus. */
async function removeDistribusiFiles(filePaths) {
  let filesDeleted = 0;
  const BATCH = 100;
  for (let i = 0; i < filePaths.length; i += BATCH) {
    const batch = filePaths.slice(i, i + BATCH);
    const { error: storageErr } = await supabase.storage.from('distribusi').remove(batch);
    if (storageErr) {
      console.error('[PhotoCleanup] Storage delete error:', storageErr.message);
    } else {
      filesDeleted += batch.length;
    }
  }
  return filesDeleted;
}

/**
 * Hapus foto distribusi yang sudah lebih dari RETENTION_DAYS hari.
 * Menghapus file dari Supabase Storage DAN record di tabel distribution_photos.
 * Aman dipanggil fire-and-forget (tidak throw, hanya log error).
 */
async function cleanupOldDistributionPhotos() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: oldRecords, error: queryErr } = await supabase
    .from('distribution_photos')
    .select('id, photos')
    .lt('uploaded_at', cutoff);

  if (queryErr) {
    console.error('[PhotoCleanup] Query error:', queryErr.message);
    return { deleted: 0, files: 0, error: queryErr.message };
  }
  if (!oldRecords?.length) {
    return { deleted: 0, files: 0 };
  }

  const filePaths = oldRecords.flatMap((record) =>
    (record.photos || []).map((p) => extractDistribusiPath(p.url)).filter(Boolean)
  );

  const filesDeleted = await removeDistribusiFiles(filePaths);

  // Hapus record DB
  const ids = oldRecords.map((r) => r.id);
  const { error: dbErr } = await supabase
    .from('distribution_photos')
    .delete()
    .in('id', ids);

  if (dbErr) {
    console.error('[PhotoCleanup] DB delete error:', dbErr.message);
    return { deleted: 0, files: filesDeleted, error: dbErr.message };
  }

  console.log(`[PhotoCleanup] Selesai: hapus ${oldRecords.length} record, ${filesDeleted} file (cutoff: ${cutoff})`);
  return { deleted: oldRecords.length, files: filesDeleted };
}

module.exports = { cleanupOldDistributionPhotos, RETENTION_DAYS, extractDistribusiPath, removeDistribusiFiles };
