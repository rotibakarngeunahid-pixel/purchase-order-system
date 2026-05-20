const express = require('express');
const authMiddleware = require('../middleware/auth');
const {
  ensureFinancePortalConfig,
  updateFinancePortalStatus,
  regenerateFinancePortalApiKey,
  verifyFinanceApiKey,
  getFinanceExpenseSummary,
  writeFinanceAccessLog,
  getFinanceAccessLogs,
} = require('../services/financePortal');

const router = express.Router();

function getDateFromQuery(query) {
  return query.tanggal_mulai || query.date_from || query.tanggal_awal || query.start_date;
}

function getDateToQuery(query) {
  return query.tanggal_akhir || query.date_to || query.end_date;
}

function getOutletIdQuery(query) {
  return query.outlet_id || query.cabang_id || '';
}

function getCabangQuery(query) {
  return query.cabang || query.outlet || '';
}

function getRequestedOutletLabel(query) {
  return getCabangQuery(query) || getOutletIdQuery(query) || null;
}

function extractApiKey(req) {
  const directHeader = req.headers['x-api-key'] || req.headers['x-finance-api-key'];
  if (directHeader) return String(directHeader).trim();

  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7).trim();

  return req.query.api_key ? String(req.query.api_key).trim() : '';
}

function errorResponse(message) {
  return {
    success: false,
    message,
    status_data: 'error',
    data: [],
  };
}

function normalizeConfig(config) {
  return {
    is_enabled: !!config.is_enabled,
    api_key: config.api_key,
    updated_at: config.updated_at,
  };
}

// Endpoint untuk sistem keuangan.
// Gunakan header x-api-key atau Authorization: Bearer <api_key>.
router.get('/data', async (req, res) => {
  const dateFrom = getDateFromQuery(req.query);
  const dateTo = getDateToQuery(req.query);
  const outletId = getOutletIdQuery(req.query);
  const cabang = getCabangQuery(req.query);
  const requestedOutlet = getRequestedOutletLabel(req.query);

  try {
    const apiKeyCheck = await verifyFinanceApiKey(extractApiKey(req));
    if (!apiKeyCheck.ok) {
      await writeFinanceAccessLog({
        req,
        status: 'failed',
        message: apiKeyCheck.message,
        dateFrom,
        dateTo,
        outlet: requestedOutlet ? { name: requestedOutlet } : null,
      });
      return res.status(apiKeyCheck.status).json(errorResponse(apiKeyCheck.message));
    }

    const result = await getFinanceExpenseSummary({ dateFrom, dateTo, outletId, cabang });
    if (result.error) {
      await writeFinanceAccessLog({
        req,
        status: 'failed',
        message: result.error.message,
        dateFrom,
        dateTo,
        outlet: result.outlet || (requestedOutlet ? { name: requestedOutlet } : null),
      });
      return res.status(result.error.status).json(errorResponse(result.error.message));
    }

    await writeFinanceAccessLog({
      req,
      status: 'success',
      message: result.response.message,
      dateFrom,
      dateTo,
      outlet: result.outlet || null,
    });
    return res.json(result.response);
  } catch (error) {
    console.error('Portal Data Keuangan error:', error);
    const message = 'Data pengeluaran bahan baku belum bisa diambil. Coba lagi nanti.';
    await writeFinanceAccessLog({
      req,
      status: 'failed',
      message,
      dateFrom,
      dateTo,
      outlet: requestedOutlet ? { name: requestedOutlet } : null,
    });
    return res.status(500).json(errorResponse(message));
  }
});

// Admin: konfigurasi portal
router.get('/admin/config', authMiddleware, async (req, res) => {
  try {
    const config = await ensureFinancePortalConfig();
    res.json(normalizeConfig(config));
  } catch (error) {
    res.status(500).json({ error: 'Konfigurasi Portal Data Keuangan belum bisa dimuat.' });
  }
});

router.put('/admin/config', authMiddleware, async (req, res) => {
  try {
    const config = await updateFinancePortalStatus(req.body?.is_enabled);
    res.json(normalizeConfig(config));
  } catch (error) {
    res.status(500).json({ error: 'Status Portal Data Keuangan belum bisa disimpan.' });
  }
});

router.post('/admin/regenerate-key', authMiddleware, async (req, res) => {
  try {
    const config = await regenerateFinancePortalApiKey();
    res.json(normalizeConfig(config));
  } catch (error) {
    res.status(500).json({ error: 'API key baru belum bisa dibuat.' });
  }
});

// Admin: preview data tanpa mencatat log akses integrasi.
router.get('/admin/preview', authMiddleware, async (req, res) => {
  try {
    const result = await getFinanceExpenseSummary({
      dateFrom: getDateFromQuery(req.query),
      dateTo: getDateToQuery(req.query),
      outletId: getOutletIdQuery(req.query),
      cabang: getCabangQuery(req.query),
    });

    if (result.error) {
      return res.status(result.error.status).json(errorResponse(result.error.message));
    }
    return res.json(result.response);
  } catch (error) {
    console.error('Preview Portal Data Keuangan error:', error);
    return res.status(500).json(errorResponse('Preview data belum bisa dimuat.'));
  }
});

router.get('/admin/logs', authMiddleware, async (req, res) => {
  try {
    const logs = await getFinanceAccessLogs(req.query.limit);
    res.json(logs.map((log) => ({
      id: log.id,
      waktu_akses: log.accessed_at,
      status: log.status === 'success' ? 'Berhasil' : 'Gagal',
      cabang: log.outlet_name || 'Semua cabang',
      tanggal_mulai: log.date_from,
      tanggal_akhir: log.date_to,
      pesan: log.message || '',
    })));
  } catch (error) {
    res.status(500).json({ error: 'Log akses belum bisa dimuat.' });
  }
});

module.exports = router;
