const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const { sendTestEmail } = require('../services/mailer');

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

// POST test SMTP
router.post('/test-smtp', async (req, res) => {
  try {
    await sendTestEmail();
    res.json({ success: true, message: 'Email test berhasil dikirim! Cek inbox Anda.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
