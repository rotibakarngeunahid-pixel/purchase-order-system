const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const { syncPurchaseReportToInventory } = require('../services/posStockSync');
const { fetchAllRows } = require('../services/fetchAll');

// GET semua variants aktif (untuk preload di frontend)
router.get('/variants', async (req, res) => {
  const { data, error } = await supabase
    .from('material_variants')
    .select('id, material_id, brand, supplier_id, price_per_purchase_unit, supplier:suppliers(id, name)')
    .eq('is_active', true)
    .order('brand');

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// GET list dengan join lengkap
router.get('/', async (req, res) => {
  const { outlet_id, date_from, date_to, supplier_id } = req.query;

  const buildQuery = () => {
    let query = supabase
      .from('purchase_report')
      .select(`
        *,
        outlet:outlets(id, name),
        material:materials(id, code, name, purchase_unit),
        variant:material_variants(id, brand),
        supplier:suppliers(id, name)
      `)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id');

    if (outlet_id) query = query.eq('outlet_id', outlet_id);
    if (date_from) query = query.gte('date', date_from);
    if (date_to) query = query.lte('date', date_to);
    if (supplier_id) query = query.eq('supplier_id', supplier_id);
    return query;
  };

  const { data, error } = await fetchAllRows(buildQuery);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// POST bulk — { outlet_id, date, items: [{material_id, variant_id, supplier_id, qty, unit, price_per_unit, notes}] }
router.post('/', async (req, res) => {
  const { outlet_id, date, items } = req.body;

  if (!outlet_id || !date || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'outlet_id, date, dan items wajib diisi' });
  }

  const rows = items.map((item) => ({
    outlet_id,
    date,
    material_id: item.material_id,
    variant_id: item.variant_id || null,
    supplier_id: item.supplier_id || null,
    qty: Number(item.qty),
    unit: item.unit,
    price_per_unit: Number(item.price_per_unit) || 0,
    notes: item.notes?.trim() || null,
  }));

  for (const row of rows) {
    if (!row.material_id || !row.qty || row.qty <= 0 || !row.unit) {
      return res.status(400).json({ error: 'Setiap item wajib punya material_id, qty > 0, dan unit' });
    }
  }

  const { data, error } = await supabase
    .from('purchase_report')
    .insert(rows)
    .select(`
      *,
      outlet:outlets(id, name),
      material:materials(id, code, name, purchase_unit),
      variant:material_variants(id, brand),
      supplier:suppliers(id, name)
    `);

  if (error) return res.status(500).json({ error: error.message });

  // Fire-and-forget: sync ke stok POS
  const outletName = (data && data[0]?.outlet?.name) || '';
  syncPurchaseReportToInventory(data, outlet_id, outletName)
    .then((r) => { if (!r.ok) console.error('[POS Sync] Purchase report sync gagal:', r.error); })
    .catch((err) => console.error('[POS Sync] Purchase report sync error:', err?.message));

  res.status(201).json(data);
});

// PUT /:id — edit item + re-sync ke POS
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const allowed = ['variant_id', 'supplier_id', 'qty', 'unit', 'price_per_unit', 'notes'];
  const updates = {};
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  });

  if (updates.qty !== undefined) updates.qty = Number(updates.qty);
  if (updates.price_per_unit !== undefined) updates.price_per_unit = Number(updates.price_per_unit) || 0;
  if (updates.notes !== undefined) updates.notes = updates.notes?.trim() || null;
  if (updates.variant_id === '') updates.variant_id = null;
  if (updates.supplier_id === '') updates.supplier_id = null;

  if (updates.qty !== undefined && !(updates.qty > 0)) {
    return res.status(400).json({ error: 'qty harus lebih dari 0' });
  }

  const { data, error } = await supabase
    .from('purchase_report')
    .update(updates)
    .eq('id', id)
    .select(`
      *,
      outlet:outlets(id, name),
      material:materials(id, code, name, purchase_unit),
      variant:material_variants(id, brand),
      supplier:suppliers(id, name)
    `)
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Fire-and-forget: re-sync ke POS dengan qty terbaru
  const outletName = data.outlet?.name || '';
  syncPurchaseReportToInventory([data], data.outlet_id, outletName)
    .then((r) => { if (!r.ok) console.error('[POS Sync] Edit sync gagal:', r.error); })
    .catch((err) => console.error('[POS Sync] Edit sync error:', err?.message));

  res.json(data);
});

// DELETE single item
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase
    .from('purchase_report')
    .delete()
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
