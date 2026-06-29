require('./services/env').loadEnv();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const authMiddleware = require('./middleware/auth');
const authRouter = require('./routes/auth');
const publicRouter = require('./routes/publicRoutes');
const suppliersRouter = require('./routes/suppliers');
const materialsRouter = require('./routes/materials');
const outletsRouter = require('./routes/outlets');
const ordersRouter = require('./routes/orders');
const notificationsRouter = require('./routes/notifications');
const purchaseRouter = require('./routes/purchase');
const settingsRouter = require('./routes/settings');
const reportsRouter = require('./routes/reports');
const rotiTawarRouter = require('./routes/rotiTawar');
const purchaseReportRouter = require('./routes/purchaseReport');
const holidaysRouter = require('./routes/holidays');
const financePortalRouter = require('./routes/financePortal');
const dataDeletionRouter = require('./routes/dataDeletion');
const distributionPhotosRouter = require('./routes/distributionPhotos');
const inventoriRekomendasiRouter = require('./routes/inventoriRekomendasi');
const inventoriCabangRouter = require('./routes/inventoriCabang');
const inventoriBahanRouter = require('./routes/inventoriBahan');
const priceLogsRouter = require('./routes/priceLogs');

const app = express();

// Berjalan di belakang proxy Vercel — wajib agar req.ip & rate limit akurat
app.set('trust proxy', 1);

app.use(helmet());
app.use(compression());
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  // Admin panel POS — boleh baca endpoint publik untuk setup mapping
  'https://pos-system.rotibakarngeunah.my.id',
  'https://rotibakarngeunah.my.id',
  'http://localhost',
  'http://127.0.0.1',
];
app.use(
  cors({
    origin: (origin, callback) => {
      // Izinkan jika origin ada di whitelist, atau tidak ada origin (server-to-server)
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      // Izinkan semua subdomain rotibakarngeunah.my.id
      if (/^https?:\/\/[a-z0-9-]+\.rotibakarngeunah\.my\.id$/.test(origin)) return callback(null, true);
      // Izinkan domain Vercel project ini sendiri (alias produksi + URL deployment/preview).
      // Tanpa ini, POST dari halaman publik (mis. upload foto distribusi) ditolak
      // saat diakses via *.vercel.app — browser selalu mengirim header Origin untuk POST.
      if (/^https:\/\/purchase-order-system-[a-z0-9-]+\.vercel\.app$/.test(origin)) return callback(null, true);
      if (/^https:\/\/purchaseorder-[a-z0-9-]+\.vercel\.app$/.test(origin)) return callback(null, true);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);
// Limit dinaikkan dari default 100kb agar import XLSX/CSV besar tidak gagal 413
app.use(express.json({ limit: '2mb' }));

// Cegah browser cache API response (hindari 304 stale data)
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// Rate limit untuk notifikasi
const notifLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Terlalu banyak request. Coba lagi dalam 1 menit.' },
});

// Health check & auth (no middleware)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Roti Bakar Ngeunah API', timestamp: new Date().toISOString() });
});
app.use('/api/auth', authRouter);

// Public routes (no auth required)
app.use('/api/public', publicRouter);
app.use('/api/finance-portal', financePortalRouter);

// Protected routes
app.use('/api/suppliers', authMiddleware, suppliersRouter);
app.use('/api/materials', authMiddleware, materialsRouter);
app.use('/api/outlets', authMiddleware, outletsRouter);
app.use('/api/orders', authMiddleware, ordersRouter);
app.use('/api/orders', authMiddleware, notifLimiter, notificationsRouter);
app.use('/api/purchase', authMiddleware, purchaseRouter);
app.use('/api/settings', authMiddleware, settingsRouter);
app.use('/api/reports', authMiddleware, reportsRouter);
app.use('/api/roti-tawar', authMiddleware, rotiTawarRouter);
app.use('/api/purchase-report', authMiddleware, purchaseReportRouter);
app.use('/api/holidays', authMiddleware, holidaysRouter);
app.use('/api/data-deletion', authMiddleware, dataDeletionRouter);
app.use('/api/distribution-photos', authMiddleware, distributionPhotosRouter);
app.use('/api/inventori/rekomendasi', authMiddleware, inventoriRekomendasiRouter);
app.use('/api/inventori/cabang', authMiddleware, inventoriCabangRouter);
app.use('/api/inventori/bahan', authMiddleware, inventoriBahanRouter);
app.use('/api/price-logs', authMiddleware, priceLogsRouter);

// Global error handler
app.use((err, req, res, next) => {
  // Penolakan CORS bukan kesalahan server — balas 403 dengan pesan jelas
  // agar mudah didiagnosis (bukan 500 "Internal server error" generik)
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      error: `Akses dari origin ini tidak diizinkan (${req.headers.origin || 'tanpa origin'}).`,
    });
  }
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`✅ Server berjalan di port ${PORT}`);
    console.log(`📡 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
  });
}

module.exports = app;
