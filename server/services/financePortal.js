const crypto = require('crypto');
const supabase = require('./supabase');

const CONFIG_ID = 'default';
const FINAL_RECEIPT_STATUSES = ['received', 'received_partial'];

function generateApiKey() {
  return `rbn_fin_${crypto.randomBytes(24).toString('hex')}`;
}

function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function validatePeriod(dateFrom, dateTo) {
  if (!dateFrom || !dateTo) {
    return 'Tanggal mulai dan tanggal akhir wajib diisi.';
  }
  if (!isValidDateString(dateFrom) || !isValidDateString(dateTo) || dateFrom > dateTo) {
    return 'Tanggal yang dipilih tidak valid.';
  }
  return null;
}

function isWithinDateRange(date, dateFrom, dateTo) {
  if (!date) return false;
  if (dateFrom && date < dateFrom) return false;
  if (dateTo && date > dateTo) return false;
  return true;
}

function makeKey(...parts) {
  return parts.map((part) => part || '').join('|');
}

function getActualSubtotal(row) {
  const subtotal = Number(row.subtotal_actual || 0);
  if (subtotal > 0) return subtotal;
  return Number(row.qty_received || 0) * Number(row.price_actual || 0);
}

function isMissingSchemaError(error, names) {
  const message = String(error?.message || '').toLowerCase();
  return names.some((name) => message.includes(name.toLowerCase())) && (
    message.includes('column') ||
    message.includes('schema cache') ||
    message.includes('could not find') ||
    message.includes('relationship')
  );
}

function safeCompare(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function ensureFinancePortalConfig() {
  const { data, error } = await supabase
    .from('finance_portal_config')
    .select('*')
    .eq('id', CONFIG_ID)
    .maybeSingle();

  if (error) throw error;
  if (data) return data;

  const { data: created, error: createError } = await supabase
    .from('finance_portal_config')
    .insert({ id: CONFIG_ID, api_key: generateApiKey(), is_enabled: false })
    .select('*')
    .single();

  if (createError) throw createError;
  return created;
}

async function updateFinancePortalStatus(isEnabled) {
  const config = await ensureFinancePortalConfig();
  const { data, error } = await supabase
    .from('finance_portal_config')
    .update({ is_enabled: !!isEnabled, updated_at: new Date().toISOString() })
    .eq('id', config.id)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

async function regenerateFinancePortalApiKey() {
  const config = await ensureFinancePortalConfig();
  const { data, error } = await supabase
    .from('finance_portal_config')
    .update({ api_key: generateApiKey(), updated_at: new Date().toISOString() })
    .eq('id', config.id)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

async function verifyFinanceApiKey(apiKey) {
  const config = await ensureFinancePortalConfig();

  if (!apiKey || !safeCompare(apiKey, config.api_key)) {
    return {
      ok: false,
      status: 401,
      message: 'Akses ditolak. Kode akses tidak valid.',
    };
  }

  if (!config.is_enabled) {
    return {
      ok: false,
      status: 403,
      message: 'Akses Portal Data Keuangan belum aktif.',
    };
  }

  return { ok: true, config };
}

async function fetchOutlets() {
  const { data, error } = await supabase
    .from('outlets')
    .select('id, name, is_active')
    .order('name');

  if (error) throw error;
  return data || [];
}

function resolveOutletFilter(outlets, rawOutletId, rawCabang) {
  const raw = String(rawOutletId || rawCabang || '').trim();
  if (!raw) return { outlet: null, error: null };

  const byId = outlets.find((outlet) => String(outlet.id) === raw);
  if (byId) return { outlet: byId, error: null };

  const lower = raw.toLowerCase();
  const exact = outlets.find((outlet) => String(outlet.name || '').toLowerCase() === lower);
  if (exact) return { outlet: exact, error: null };

  const partialMatches = outlets.filter((outlet) =>
    String(outlet.name || '').toLowerCase().includes(lower)
  );
  if (partialMatches.length === 1) return { outlet: partialMatches[0], error: null };

  return { outlet: null, error: 'Cabang/outlet tidak ditemukan.' };
}

function createExpenseAccumulator(outlets, selectedOutletId) {
  const outletMap = new Map(outlets.map((outlet) => [String(outlet.id), outlet]));
  const summary = new Map();

  function add(outletId, amount, transactionKey) {
    const numericAmount = Number(amount || 0);
    if (!outletId || numericAmount <= 0) return;
    if (selectedOutletId && String(outletId) !== String(selectedOutletId)) return;

    const outlet = outletMap.get(String(outletId));
    if (!outlet) return;

    if (!summary.has(String(outletId))) {
      summary.set(String(outletId), {
        outlet_id: outlet.id,
        cabang: outlet.name,
        total: 0,
        transactions: new Set(),
      });
    }

    const row = summary.get(String(outletId));
    row.total += numericAmount;
    if (transactionKey) row.transactions.add(transactionKey);
  }

  return { summary, add };
}

async function getRequestQtyMaps(dateFrom, dateTo) {
  const { data, error } = await supabase
    .from('order_request_items')
    .select(`
      qty, outlet_id, material_id, session_id,
      session:order_sessions(id, order_date)
    `)
    .gt('qty', 0);

  if (error) throw error;

  const totalBySessionMaterial = {};
  const outletQtyBySessionMaterial = {};

  for (const item of data || []) {
    const sessionId = item.session_id || item.session?.id;
    const materialId = item.material_id;
    const orderDate = item.session?.order_date;
    if (!sessionId || !materialId || !isWithinDateRange(orderDate, dateFrom, dateTo)) continue;

    const key = makeKey(sessionId, materialId);
    const qty = Number(item.qty || 0);
    totalBySessionMaterial[key] = (totalBySessionMaterial[key] || 0) + qty;

    if (!outletQtyBySessionMaterial[key]) outletQtyBySessionMaterial[key] = {};
    outletQtyBySessionMaterial[key][item.outlet_id] =
      (outletQtyBySessionMaterial[key][item.outlet_id] || 0) + qty;
  }

  return { totalBySessionMaterial, outletQtyBySessionMaterial };
}

async function fetchPOExpenseRows() {
  const withAllColumns = `
    id, po_id, material_id, qty_ordered, qty_received, price_actual, subtotal_actual, source,
    po:purchase_orders(
      id, status, session_id,
      session:order_sessions(id, order_date)
    ),
    branch_distributions:purchase_item_branch_distribution(outlet_id, qty)
  `;

  let result = await supabase
    .from('purchase_order_items')
    .select(withAllColumns);

  if (!result.error) return (result.data || []).map((row) => row);

  if (!isMissingSchemaError(result.error, ['source', 'purchase_item_branch_distribution'])) {
    throw result.error;
  }

  const withoutDistribution = `
    id, po_id, material_id, qty_ordered, qty_received, price_actual, subtotal_actual, source,
    po:purchase_orders(
      id, status, session_id,
      session:order_sessions(id, order_date)
    )
  `;

  result = await supabase
    .from('purchase_order_items')
    .select(withoutDistribution);

  if (!result.error) {
    return (result.data || []).map((row) => ({ ...row, branch_distributions: [] }));
  }

  if (!isMissingSchemaError(result.error, ['source'])) throw result.error;

  const legacyColumns = `
    id, po_id, material_id, qty_ordered, qty_received, price_actual, subtotal_actual,
    po:purchase_orders(
      id, status, session_id,
      session:order_sessions(id, order_date)
    )
  `;

  result = await supabase
    .from('purchase_order_items')
    .select(legacyColumns);

  if (result.error) throw result.error;
  return (result.data || []).map((row) => ({
    ...row,
    source: 'ordered',
    branch_distributions: [],
  }));
}

async function addPurchaseOrderExpenses({ dateFrom, dateTo, add }) {
  const [rows, requestMaps] = await Promise.all([
    fetchPOExpenseRows(),
    getRequestQtyMaps(dateFrom, dateTo),
  ]);

  for (const row of rows || []) {
    const po = row.po;
    const orderDate = po?.session?.order_date;
    if (!po || !FINAL_RECEIPT_STATUSES.includes(po.status)) continue;
    if (!isWithinDateRange(orderDate, dateFrom, dateTo)) continue;

    const amount = getActualSubtotal(row);
    if (amount <= 0) continue;

    const distributions = (row.branch_distributions || [])
      .filter((dist) => dist.outlet_id && Number(dist.qty || 0) > 0);
    const totalDistributionQty = distributions.reduce((sum, dist) => sum + Number(dist.qty || 0), 0);

    if (totalDistributionQty > 0) {
      for (const dist of distributions) {
        add(dist.outlet_id, amount * (Number(dist.qty || 0) / totalDistributionQty), `po:${po.id}`);
      }
      continue;
    }

    const sessionId = po.session_id || po.session?.id;
    const materialId = row.material_id;
    const key = makeKey(sessionId, materialId);
    const totalRequestQty = requestMaps.totalBySessionMaterial[key] || 0;
    const outletQtys = requestMaps.outletQtyBySessionMaterial[key] || {};
    if (!sessionId || !materialId || totalRequestQty <= 0) continue;

    for (const [outletId, outletQty] of Object.entries(outletQtys)) {
      if (Number(outletQty || 0) <= 0) continue;
      add(outletId, amount * (Number(outletQty) / totalRequestQty), `po:${po.id}`);
    }
  }
}

async function addPurchaseReportExpenses({ dateFrom, dateTo, selectedOutletId, add }) {
  let query = supabase
    .from('purchase_report')
    .select('id, outlet_id, date, qty, price_per_unit, outlet:outlets(id, name)')
    .gte('date', dateFrom)
    .lte('date', dateTo)
    .gt('qty', 0);

  if (selectedOutletId) query = query.eq('outlet_id', selectedOutletId);

  const { data, error } = await query;
  if (error) throw error;

  for (const row of data || []) {
    const amount = Number(row.qty || 0) * Number(row.price_per_unit || 0);
    add(row.outlet_id, amount, `purchase_report:${row.id}`);
  }
}

function buildFinanceResponse({ dateFrom, dateTo, summary }) {
  const data = Array.from(summary.values())
    .filter((row) => row.total > 0)
    .sort((a, b) => a.cabang.localeCompare(b.cabang))
    .map((row) => ({
      cabang: row.cabang,
      total_pengeluaran_bahan_baku: Math.round(row.total),
      jumlah_transaksi: row.transactions.size,
      status_data: 'berhasil',
    }));

  const totalAllBranches = data.reduce(
    (sum, row) => sum + Number(row.total_pengeluaran_bahan_baku || 0),
    0
  );
  const isEmpty = data.length === 0;

  return {
    success: true,
    message: isEmpty
      ? 'Belum ada data pengeluaran bahan baku pada periode ini.'
      : 'Data pengeluaran bahan baku berhasil diambil',
    status_data: isEmpty ? 'kosong' : 'berhasil',
    periode: {
      tanggal_mulai: dateFrom,
      tanggal_akhir: dateTo,
    },
    data,
    ringkasan: {
      total_semua_cabang: totalAllBranches,
      jumlah_cabang: data.length,
    },
  };
}

async function getFinanceExpenseSummary({ dateFrom, dateTo, outletId, cabang }) {
  const periodError = validatePeriod(dateFrom, dateTo);
  if (periodError) {
    return {
      error: {
        status: 400,
        message: periodError,
      },
    };
  }

  const outlets = await fetchOutlets();
  const outletFilter = resolveOutletFilter(outlets, outletId, cabang);
  if (outletFilter.error) {
    return {
      error: {
        status: 400,
        message: outletFilter.error,
      },
    };
  }

  const selectedOutletId = outletFilter.outlet?.id || null;
  const { summary, add } = createExpenseAccumulator(outlets, selectedOutletId);

  await Promise.all([
    addPurchaseOrderExpenses({ dateFrom, dateTo, add }),
    addPurchaseReportExpenses({ dateFrom, dateTo, selectedOutletId, add }),
  ]);

  return {
    response: buildFinanceResponse({ dateFrom, dateTo, summary }),
    outlet: outletFilter.outlet,
  };
}

function getRequesterIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return req.socket?.remoteAddress || null;
}

async function writeFinanceAccessLog({ req, status, message, dateFrom, dateTo, outlet }) {
  try {
    await supabase
      .from('finance_portal_access_logs')
      .insert({
        status,
        message: message || null,
        date_from: isValidDateString(dateFrom) ? dateFrom : null,
        date_to: isValidDateString(dateTo) ? dateTo : null,
        outlet_id: outlet?.id || null,
        outlet_name: outlet?.name || null,
        requester_ip: getRequesterIp(req),
        user_agent: req.headers['user-agent'] || null,
      });
  } catch (error) {
    console.error('Gagal mencatat log Portal Data Keuangan:', error.message);
  }
}

async function getFinanceAccessLogs(limit = 20) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const { data, error } = await supabase
    .from('finance_portal_access_logs')
    .select('id, accessed_at, status, message, date_from, date_to, outlet_name')
    .order('accessed_at', { ascending: false })
    .limit(safeLimit);

  if (error) throw error;
  return data || [];
}

module.exports = {
  ensureFinancePortalConfig,
  updateFinancePortalStatus,
  regenerateFinancePortalApiKey,
  verifyFinanceApiKey,
  getFinanceExpenseSummary,
  writeFinanceAccessLog,
  getFinanceAccessLogs,
  validatePeriod,
};
