const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const { calculatePOs } = require('../services/calculator');

// POST /api/orders/session/:id/send-wa
// Nama endpoint dipertahankan untuk kompatibilitas frontend lama.
// Output utama sekarang adalah data PO untuk generate gambar order per supplier.
router.post('/session/:id/send-wa', async (req, res) => {
  const { id } = req.params;

  // 1. Ambil sesi
  const { data: session, error: sessionError } = await supabase
    .from('order_sessions')
    .select('*')
    .eq('id', id)
    .single();

  if (sessionError || !session) return res.status(404).json({ error: 'Sesi tidak ditemukan' });
  if (session.status !== 'draft') return res.status(400).json({ error: 'Sesi sudah dikirim sebelumnya' });

  // 2. Ambil request items + materials
  const { data: items, error: itemsError } = await supabase
    .from('order_request_items')
    .select('*')
    .eq('session_id', id)
    .gt('qty', 0);

  if (itemsError) return res.status(500).json({ error: itemsError.message });
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Tidak ada item permintaan. Isi order terlebih dahulu.' });
  }

  const { data: materials, error: matError } = await supabase
    .from('materials')
    .select('*, supplier:suppliers(id, name, wa_number)')
    .eq('is_active', true);

  if (matError) return res.status(500).json({ error: matError.message });

  // 3. Hitung PO per supplier
  const pos = calculatePOs(items, materials || []);
  if (pos.length === 0) {
    return res.status(400).json({ error: 'Tidak ada PO yang dapat dibuat. Periksa data bahan baku.' });
  }

  // 4. Ambil WA greeting text
  const { data: settingsData } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', ['wa_greeting_text', 'business_name']);

  const settings = {};
  (settingsData || []).forEach((row) => { settings[row.key] = row.value; });
  const businessName = settings.business_name || 'Roti Bakar Ngeunah';
  const greetingText = settings.wa_greeting_text || '';

  // 5. Buat PO di database
  const posWithRecords = [];
  for (const po of pos) {
    // Insert purchase_order
    const { data: poRecord, error: poError } = await supabase
      .from('purchase_orders')
      .insert({
        session_id: id,
        supplier_id: po.supplier_id,
        status: 'pending',
        total_estimated: po.total_estimated,
        wa_sent_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (poError) return res.status(500).json({ error: poError.message });

    // Insert purchase_order_items
    const poItems = po.items.map((item) => ({
      po_id: poRecord.id,
      material_id: item.material_id,
      qty_ordered: item.qty_ordered,
    }));

    const { error: itemsInsertError } = await supabase
      .from('purchase_order_items')
      .insert(poItems);

    if (itemsInsertError) return res.status(500).json({ error: itemsInsertError.message });

    posWithRecords.push({ ...po, po_id: poRecord.id });
  }

  // 6. Update status sesi
  await supabase
    .from('order_sessions')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', id);

  res.json({
    success: true,
    message: 'PO berhasil dibuat. Gambar order supplier siap diunduh.',
    po_count: posWithRecords.length,
    business_name: businessName,
    wa_greeting_text: greetingText,
    purchase_orders: posWithRecords,
  });
});

module.exports = router;
