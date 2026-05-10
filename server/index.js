require('dotenv').config();
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

const app = express();

app.use(helmet());
app.use(compression());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json());

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

// Global error handler
app.use((err, req, res, next) => {
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
