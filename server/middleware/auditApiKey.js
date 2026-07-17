const crypto = require('crypto');

// Auth khusus untuk endpoint integrasi Audit System (audit.rotibakarngeunah.my.id).
// Shared-secret sederhana lewat env var AUDIT_API_KEY (bukan sesi admin JWT),
// dibandingkan pakai timing-safe compare. Semua route di belakang middleware
// ini WAJIB hanya baca (SELECT) — tidak ada endpoint tulis yang memakainya.
function auditApiKeyMiddleware(req, res, next) {
  const expected = (process.env.AUDIT_API_KEY || '').trim();
  const provided = String(req.headers['x-api-key'] || '').trim();
  if (!expected) {
    return res.status(503).json({ error: 'AUDIT_API_KEY belum dikonfigurasi di server' });
  }
  if (!provided) {
    return res.status(401).json({ error: 'API key wajib (header X-API-Key)' });
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  const valid = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!valid) {
    return res.status(401).json({ error: 'API key tidak valid' });
  }
  next();
}

module.exports = auditApiKeyMiddleware;
