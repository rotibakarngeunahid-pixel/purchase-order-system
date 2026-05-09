const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

router.post('/login', (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Password wajib diisi' });
  }

  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Password salah' });
  }

  const token = jwt.sign(
    { role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );

  res.json({ token });
});

module.exports = router;
