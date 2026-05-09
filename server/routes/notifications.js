const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const { calculatePOs } = require('../services/calculator');
const { buildWALink } = require('../services/waLink');
const { sendOrderEmail } = require('../services/mailer');

// POST /api/orders/session/:id/send-wa
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

  // 5. Generate WA links dan buat PO di database
  const posWithLinks = [];
  for (const po of pos) {
    const waLink = buildWALink(po.supplier, po.items, session.order_date, businessName, greetingText);

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

    posWithLinks.push({ ...po, wa_link: waLink, po_id: poRecord.id });
  }

  // 6. Kirim email
  try {
    await sendOrderEmail(posWithLinks, session.order_date);
  } catch (emailErr) {
    // Jika email gagal, tetap update status tapi return warning
    await supabase
      .from('order_sessions')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', id);

    return res.status(207).json({
      success: false,
      warning: 'PO berhasil dibuat tapi email gagal dikirim: ' + emailErr.message,
      po_count: posWithLinks.length,
      wa_links: posWithLinks.map((p) => ({ supplier: p.supplier.name, wa_link: p.wa_link })),
    });
  }

  // 7. Update status sesi
  await supabase
    .from('order_sessions')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', id);

  res.json({
    success: true,
    message: 'Email berhasil dikirim! Cek inbox untuk WA links.',
    po_count: posWithLinks.length,
  });
});

module.exports = router;
