const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const { sendTestEmail } = require('../services/mailer');
const multer = require('multer');
let sharpLib;
try { sharpLib = require('sharp'); } catch { sharpLib = null; }

const guidePhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return cb(null, true);
    const err = new Error('FORMAT_NOT_SUPPORTED');
    err.code = 'FORMAT_NOT_SUPPORTED';
    cb(err);
  },
});

// GET semua settings
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value')
    .order('key');
  if (error) return res.status(500).json({ error: error.message });

  const settings = {};
  (data || []).forEach((row) => {
    settings[row.key] = row.value;
  });
  res.json(settings);
});

// PUT update settings (batch key-value)
router.put('/', async (req, res) => {
  const updates = req.body;
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'Body harus berupa object key-value' });
  }

  const upsertData = Object.entries(updates).map(([key, value]) => ({ key, value: String(value) }));

  const { error } = await supabase
    .from('app_settings')
    .upsert(upsertData, { onConflict: 'key' });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, updated: upsertData.length });
});

// POST upload guide example photo (admin only, auth via middleware in index.js)
router.post('/upload-guide-photo', (req, res) => {
  guidePhotoUpload.single('photo')(req, res, async (err) => {
    if (err) {
      if (err.code === 'FORMAT_NOT_SUPPORTED' || err.message === 'FORMAT_NOT_SUPPORTED') {
        return res.status(400).json({ error: 'Format tidak didukung. Gunakan JPG, PNG, atau WebP.' });
      }
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Foto terlalu besar. Maksimal 10MB.' });
      }
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) return res.status(400).json({ error: 'File foto tidak ditemukan.' });

    let buffer = req.file.buffer;
    try {
      if (sharpLib) {
        buffer = await sharpLib(buffer).rotate().webp({ quality: 82 }).toBuffer();
      }
    } catch (convErr) {
      console.error('[GuidePhoto] WebP conversion error:', convErr.message);
    }

    // Ensure bucket exists
    try {
      const { data: buckets } = await supabase.storage.listBuckets();
      if (!(buckets || []).some((b) => b.name === 'distribusi')) {
        await supabase.storage.createBucket('distribusi', { public: true });
      }
    } catch {}

    const rand = Array.from({ length: 8 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
    const filename = `guide_${rand}.webp`;
    const storagePath = `guide-examples/${filename}`;

    const { error: uploadErr } = await supabase.storage
      .from('distribusi')
      .upload(storagePath, buffer, { contentType: 'image/webp', upsert: false });

    if (uploadErr) return res.status(500).json({ error: uploadErr.message });

    const { data: urlData } = supabase.storage.from('distribusi').getPublicUrl(storagePath);
    res.json({ url: urlData.publicUrl, filename });
  });
});

// POST test email
router.post('/test-email', async (req, res) => {
  try {
    await sendTestEmail();
    res.json({ success: true, message: 'Email test berhasil dikirim! Cek inbox Anda.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
