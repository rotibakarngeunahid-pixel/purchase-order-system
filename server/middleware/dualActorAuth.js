const jwt = require('jsonwebtoken');

// Auth untuk endpoint yang dipakai BERSAMA oleh admin (JWT {role:'admin'},
// dari /api/auth/login) dan mitra (JWT {actorType:'mitra', ...}, dari
// /api/mitra-auth/login). Kedua jenis token pakai JWT_SECRET yang sama,
// hanya bentuk payload-nya beda — middleware ini menaruh hasilnya di
// req.actor supaya route handler tinggal cek req.actor.type.
function dualActorAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Token tidak ditemukan' });
  }

  const token = authHeader.split(' ')[1];

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Token tidak valid atau sudah expired' });
  }

  if (payload.actorType === 'mitra' && payload.mitraAccountId && payload.outletId) {
    req.actor = {
      type: 'mitra',
      mitraAccountId: payload.mitraAccountId,
      outletId: payload.outletId,
      outletName: payload.outletName || '',
      name: payload.name,
      username: payload.username,
    };
    return next();
  }

  if (payload.role === 'admin') {
    req.actor = { type: 'admin' };
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized: Token tidak dikenali' });
}

module.exports = dualActorAuth;
