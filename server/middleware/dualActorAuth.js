const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Auth untuk endpoint yang dipakai BERSAMA oleh admin (JWT {role:'admin'},
// dari /api/auth/login) dan investor-dashboard (server-to-server, header
// X-Service-Key, dipanggil dari akun 'investor' outlet-scoped di
// dashboard-mitra.rotibakarngeunah.my.id — mitra TIDAK punya login sendiri
// di app ini, investor-dashboard sudah memvalidasi identitas & akses
// outlet-nya sebelum memanggil rute ini). Hasilnya ditaruh di req.actor.
function dualActorAuth(req, res, next) {
  const serviceKey = req.headers['x-service-key'];
  const expected = (process.env.INVESTOR_DASHBOARD_API_KEY || '').trim();
  if (serviceKey && expected) {
    const a = Buffer.from(String(serviceKey));
    const b = Buffer.from(expected);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      req.actor = { type: 'service' };
      return next();
    }
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Token atau X-Service-Key tidak ditemukan' });
  }

  const token = authHeader.split(' ')[1];
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Token tidak valid atau sudah expired' });
  }

  if (payload.role === 'admin') {
    req.actor = { type: 'admin' };
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized: Token tidak dikenali' });
}

module.exports = dualActorAuth;
