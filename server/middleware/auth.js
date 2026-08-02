const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Token tidak ditemukan' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // Token mitra (server/routes/mitraAuth.js) dipakai JWT_SECRET yang sama
    // tapi TIDAK boleh lolos ke rute admin — tolak eksplisit di sini supaya
    // hak akses mitra tetap terbatas ke /api/mitra-* walau secret sama.
    if (payload.actorType === 'mitra') {
      return res.status(401).json({ error: 'Unauthorized: Token tidak valid untuk rute ini' });
    }
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Token tidak valid atau sudah expired' });
  }
}

module.exports = authMiddleware;
