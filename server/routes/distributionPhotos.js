const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const { cleanupOldDistributionPhotos, RETENTION_DAYS } = require('../services/photoCleanup');

// GET /api/distribution-photos?branch=&date=&date_from=&date_to=
router.get('/', async (req, res) => {
  const { branch, date, date_from, date_to } = req.query;

  let query = supabase
    .from('distribution_photos')
    .select('*')
    .order('uploaded_at', { ascending: false })
    .limit(200);

  if (branch) query = query.eq('branch', branch);
  if (date) {
    query = query.eq('date', date);
  } else {
    if (date_from) query = query.gte('date', date_from);
    if (date_to) query = query.lte('date', date_to);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// POST /api/distribution-photos/cleanup — trigger manual cleanup (admin only)
router.post('/cleanup', async (req, res) => {
  try {
    const result = await cleanupOldDistributionPhotos();
    res.json({
      success: true,
      deleted_records: result.deleted,
      deleted_files: result.files,
      retention_days: RETENTION_DAYS,
      message: result.deleted > 0
        ? `Berhasil menghapus ${result.deleted} record dan ${result.files} file foto lama.`
        : `Tidak ada foto yang lebih dari ${RETENTION_DAYS} hari.`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
