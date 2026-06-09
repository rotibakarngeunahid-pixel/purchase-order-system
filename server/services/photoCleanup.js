const supabase = require('./supabase');

const RETENTION_DAYS = 7;

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

  // Ekstrak path storage dari URL publik Supabase
  // Format URL: .../storage/v1/object/public/distribusi/<path>
  const filePaths = oldRecords.flatMap((record) =>
    (record.photos || []).map((p) => {
      try {
        const url = new URL(p.url);
        const match = url.pathname.match(/\/object\/public\/distribusi\/(.+)/);
        return match ? decodeURIComponent(match[1]) : null;
      } catch {
        return null;
      }
    }).filter(Boolean)
  );

  // Hapus dari Supabase Storage (batch, maks 1000 per panggilan)
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

module.exports = { cleanupOldDistributionPhotos, RETENTION_DAYS };
