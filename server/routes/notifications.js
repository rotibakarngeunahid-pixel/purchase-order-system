const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const { calculatePOs } = require('../services/calculator');
const { loadSupplierRouting } = require('../services/supplierRouting');

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

  let routing;
  try {
    routing = await loadSupplierRouting();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  // 3. Hitung PO per supplier
  const pos = calculatePOs(items, materials || [], routing);
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

    // Insert purchase_order_items — snapshot satuan beli, faktor konversi,
    // harga estimasi, merk, dan supplier yang dipakai saat PO dibuat (hasil
    // resolvePurchaseConfig, sudah memprioritaskan mapping outlet_material_suppliers
    // di atas default master bahan — lihat calculator.js). Konfigurasi
    // outlet_material_suppliers bisa berubah/dihapus setelahnya; PO yang sudah
    // dibuat harus tetap konsisten dengan apa yang disepakati saat pemesanan,
    // dan Catat Penerimaan harus membaca snapshot ini, bukan master bahan.
    let poItems = po.items.map((item) => ({
      po_id: poRecord.id,
      material_id: item.material_id,
      qty_ordered: item.qty_ordered,
      purchase_unit: item.purchase_unit,
      package_qty: item.package_qty,
      package_unit: item.package_unit,
      price_estimated: item.price_per_purchase_unit,
      brand: item.material_brand,
      supplier_id: po.supplier_id,
    }));

    let itemsInsertResult = await supabase.from('purchase_order_items').insert(poItems);

    if (itemsInsertResult.error) {
      const message = String(itemsInsertResult.error.message || '').toLowerCase();
      const missingSnapshotColumns = ['purchase_unit', 'package_qty', 'package_unit', 'price_estimated', 'brand', 'supplier_id'].some(
        (c) => message.includes(c.toLowerCase())
      ) && (
        message.includes('column') || message.includes('schema cache') || message.includes('could not find')
      );
      if (!missingSnapshotColumns) {
        return res.status(500).json({ error: itemsInsertResult.error.message });
      }
      // Migration brand/supplier belum dijalankan — coba tanpa kolom itu dulu
      // (tetap simpan snapshot satuan/harga yang migration-nya sudah lama ada).
      poItems = poItems.map(({ brand, supplier_id, ...rest }) => rest);
      itemsInsertResult = await supabase.from('purchase_order_items').insert(poItems);

      if (itemsInsertResult.error) {
        const message2 = String(itemsInsertResult.error.message || '').toLowerCase();
        const missingBaseSnapshotColumns = ['purchase_unit', 'package_qty', 'package_unit', 'price_estimated'].some(
          (c) => message2.includes(c.toLowerCase())
        ) && (
          message2.includes('column') || message2.includes('schema cache') || message2.includes('could not find')
        );
        if (!missingBaseSnapshotColumns) {
          return res.status(500).json({ error: itemsInsertResult.error.message });
        }
        // Migration snapshot dasar juga belum dijalankan — insert tanpa kolom snapshot (perilaku lama)
        poItems = poItems.map(({ po_id, material_id, qty_ordered }) => ({ po_id, material_id, qty_ordered }));
        itemsInsertResult = await supabase.from('purchase_order_items').insert(poItems);
        if (itemsInsertResult.error) return res.status(500).json({ error: itemsInsertResult.error.message });
      }
    }

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
