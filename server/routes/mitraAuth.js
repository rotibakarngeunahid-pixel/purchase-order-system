const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const supabase = require('../services/supabase');

// Login khusus akun Mitra — TERPISAH TOTAL dari /api/auth/login (admin,
// password tunggal). Akun mitra dibuat oleh admin lewat Master Data
// (lihat routes/mitraAccounts.js), satu akun = satu outlet.
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password wajib diisi' });
  }

  const { data: account, error } = await supabase
    .from('mitra_accounts')
    .select('id, outlet_id, username, password_hash, full_name, is_active, outlets(id, name)')
    .eq('username', String(username).trim())
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!account || !account.is_active) {
    return res.status(401).json({ error: 'Username atau password salah' });
  }

  const valid = await bcrypt.compare(password, account.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Username atau password salah' });
  }

  const token = jwt.sign(
    {
      actorType: 'mitra',
      mitraAccountId: account.id,
      outletId: account.outlet_id,
      outletName: account.outlets?.name || '',
      name: account.full_name,
      username: account.username,
    },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );

  res.json({
    token,
    mitra: {
      id: account.id,
      full_name: account.full_name,
      username: account.username,
      outlet_id: account.outlet_id,
      outlet_name: account.outlets?.name || '',
    },
  });
});

module.exports = router;
