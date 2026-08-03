// ============================================================
// Price Sync — Auto-update harga master bahan baku + log riwayat
//
// Sumber kebenaran harga terbaru adalah harga aktual yang diinput
// saat Catat Penerimaan. Saat penerimaan disimpan:
//   1. Bandingkan price_actual tiap item dengan harga master
//      (material_variants jika item pakai merk, selain itu materials).
//   2. Jika berbeda → update harga master + tulis material_price_logs.
//   3. Kembalikan daftar perubahan untuk ditampilkan di UI.
//
// Perubahan manual dari Master Data juga dicatat lewat logPriceChange.
// ============================================================

const supabase = require('./supabase');

function isMissingInfraError(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('material_price_logs') ||
    message.includes('schema cache') ||
    message.includes('could not find') ||
    (message.includes('relation') && message.includes('does not exist'))
  );
}

function isMissingColumnError(error, columns) {
  const message = String(error?.message || '').toLowerCase();
  return columns.some((column) => message.includes(column.toLowerCase())) && (
    message.includes('column') ||
    message.includes('schema cache') ||
    message.includes('could not find') ||
    message.includes('relationship')
  );
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function buildChange({ material, variant, brand, supplierId, supplierName, oldPrice, newPrice }) {
  const changeAmount = newPrice - oldPrice;
  return {
    material_id: material?.id || null,
    material_code: material?.code || null,
    material_name: material?.name || '—',
    brand: brand ?? variant?.brand ?? material?.brand ?? null,
    purchase_unit: material?.purchase_unit || '',
    variant_id: variant?.id || null,
    supplier_id: supplierId || null,
    supplier_name: supplierName || null,
    old_price: oldPrice,
    new_price: newPrice,
    change_amount: changeAmount,
    change_pct: oldPrice > 0 ? round2((changeAmount / oldPrice) * 100) : null,
    direction: changeAmount > 0 ? 'up' : 'down',
  };
}

// Tulis satu baris log. Non-fatal: jika tabel belum dimigrasi, hanya warning.
async function insertPriceLog(entry) {
  const { error } = await supabase.from('material_price_logs').insert(entry);
  if (!error) return null;
  if (isMissingInfraError(error)) {
    console.warn(
      'Tabel material_price_logs belum ada. Jalankan supabase/migration_price_logs.sql agar log harga aktif.'
    );
    return null;
  }
  return error;
}

// Log perubahan harga manual / harga awal (dipakai routes/materials.js).
// source: 'manual' | 'initial'
async function logPriceChange({ materialId, variantId, supplierId, brand, oldPrice, newPrice, source, note }) {
  if (!materialId) return null;
  const next = Number(newPrice) || 0;
  const prev = oldPrice === null || oldPrice === undefined ? null : Number(oldPrice) || 0;
  if (prev !== null && prev === next) return null; // tidak ada perubahan
  if (source === 'initial' && next <= 0) return null; // harga awal 0 tidak perlu dicatat

  return insertPriceLog({
    material_id: materialId,
    variant_id: variantId || null,
    supplier_id: supplierId || null,
    brand: brand || null,
    old_price: prev,
    new_price: next,
    source: source || 'manual',
    note: note || null,
  });
}

function resolveItemSupplierId(item) {
  return item.supplier_id || item.variant?.supplier_id || item.material?.supplier_id || null;
}

// Bahan yang di-mapping ke supplier berbeda per outlet (Master Data > Mapping
// Supplier) punya harga sendiri per outlet+bahan+supplier di
// outlet_material_suppliers — INI sumber kebenaran harga untuk kombinasi
// tersebut, bukan harga master bahan (materials.price_per_purchase_unit) yang
// dipakai bersama oleh SEMUA supplier bahan itu. Tanpa fungsi ini, menerima PO
// dari supplier A akan menimpa harga master yang lalu "bocor" jadi harga
// default saat Catat Penerimaan supplier B dibuka (dan sebaliknya), padahal
// keduanya seharusnya independen.
async function findActiveOutletMappings(materialId, supplierId) {
  if (!materialId || !supplierId) return [];
  const { data, error } = await supabase
    .from('outlet_material_suppliers')
    .select('id, price_per_purchase_unit, brand')
    .eq('material_id', materialId)
    .eq('supplier_id', supplierId)
    .eq('is_active', true);
  if (error) return []; // installasi tanpa tabel/kolom mapping -> fallback ke harga master
  return data || [];
}

async function fetchReceivedItems(poId) {
  let result = await supabase
    .from('purchase_order_items')
    .select(`
      id, material_id, variant_id, supplier_id, qty_received, price_actual, created_at,
      material:materials(id, code, name, brand, purchase_unit, price_per_purchase_unit, supplier_id),
      variant:material_variants(id, brand, supplier_id, price_per_purchase_unit)
    `)
    .eq('po_id', poId);

  if (!result.error) return result;
  if (!isMissingColumnError(result.error, ['variant_id', 'supplier_id', 'material_variants'])) {
    return result;
  }

  // Fallback: instalasi tanpa kolom varian/supplier item
  result = await supabase
    .from('purchase_order_items')
    .select(`
      id, material_id, qty_received, price_actual,
      material:materials(id, code, name, brand, purchase_unit, price_per_purchase_unit, supplier_id)
    `)
    .eq('po_id', poId);

  return result;
}

// Sinkronkan harga master dari penerimaan PO.
// Return: { ok, changes: [...], error? }
async function syncPricesFromReceive(poId) {
  try {
    const { data: items, error } = await fetchReceivedItems(poId);
    if (error) return { ok: false, changes: [], error: error.message };

    // Hanya item yang benar-benar diterima dengan harga terisi.
    // Harga 0 dianggap "harga belum diketahui" — jangan menimpa master.
    const received = (items || []).filter(
      (item) =>
        item.material_id &&
        Number(item.qty_received) > 0 &&
        Number(item.price_actual) > 0
    );

    // Satu target harga (varian merk, mapping outlet+supplier, atau material
    // default) hanya di-update sekali per penerimaan — input terakhir yang
    // menang. supplier_id ikut jadi kunci non-varian supaya dua item bahan
    // yang sama dari SUPPLIER BERBEDA (mis. adjustment tambahan) tidak saling
    // menimpa target harganya.
    const byTarget = new Map();
    for (const item of received) {
      const key = item.variant_id
        ? `v:${item.variant_id}`
        : `m:${item.material_id}:${resolveItemSupplierId(item) || ''}`;
      const existing = byTarget.get(key);
      if (!existing || new Date(item.created_at || 0) >= new Date(existing.created_at || 0)) {
        byTarget.set(key, item);
      }
    }

    const changes = [];
    for (const item of byTarget.values()) {
      const isVariant = Boolean(item.variant_id && item.variant);
      const newPrice = Number(item.price_actual);
      const supplierId = resolveItemSupplierId(item);

      if (isVariant) {
        const currentPrice = Number(item.variant.price_per_purchase_unit) || 0;
        if (currentPrice === newPrice) continue;

        const updateResult = await supabase
          .from('material_variants')
          .update({ price_per_purchase_unit: newPrice })
          .eq('id', item.variant_id);
        if (updateResult.error) {
          console.error('Auto-update harga varian gagal:', updateResult.error.message);
          continue;
        }

        const logError = await insertPriceLog({
          material_id: item.material_id,
          variant_id: item.variant_id || null,
          supplier_id: supplierId,
          po_id: poId,
          brand: item.variant?.brand || item.material?.brand || null,
          old_price: currentPrice,
          new_price: newPrice,
          source: 'po_receive',
          note: null,
        });
        if (logError) console.error('Log harga gagal disimpan:', logError.message);

        changes.push(
          buildChange({ material: item.material, variant: item.variant, supplierId, oldPrice: currentPrice, newPrice })
        );
        continue;
      }

      // Non-varian: cek dulu apakah bahan ini punya mapping outlet aktif untuk
      // supplier ini (Master Data > Mapping Supplier). Kalau ada, mapping itu
      // sumber harga yang benar untuk kombinasi bahan+supplier ini — update di
      // sana, JANGAN sentuh harga master bahan supaya harga supplier lain
      // untuk bahan yang sama tetap independen.
      const mappings = await findActiveOutletMappings(item.material_id, supplierId);

      if (mappings.length > 0) {
        const stale = mappings.filter((m) => (Number(m.price_per_purchase_unit) || 0) !== newPrice);
        if (stale.length === 0) continue;

        const { error: updateError } = await supabase
          .from('outlet_material_suppliers')
          .update({ price_per_purchase_unit: newPrice })
          .in('id', stale.map((m) => m.id));
        if (updateError) {
          console.error('Auto-update harga mapping supplier gagal:', updateError.message);
          continue;
        }

        const oldPrice = Number(stale[0].price_per_purchase_unit) || 0;
        const brand = stale[0].brand || item.material?.brand || null;

        const logError = await insertPriceLog({
          material_id: item.material_id,
          variant_id: null,
          supplier_id: supplierId,
          po_id: poId,
          brand,
          old_price: oldPrice,
          new_price: newPrice,
          source: 'po_receive',
          note: null,
        });
        if (logError) console.error('Log harga gagal disimpan:', logError.message);

        changes.push(
          buildChange({ material: item.material, brand, supplierId, oldPrice, newPrice })
        );
        continue;
      }

      // Tidak ada mapping outlet untuk supplier ini — bahan ini dibeli dari
      // satu supplier saja, perilaku lama tetap berlaku: harga master aman
      // untuk disinkronkan.
      const currentPrice = Number(item.material?.price_per_purchase_unit) || 0;
      if (currentPrice === newPrice) continue;

      const updateResult = await supabase
        .from('materials')
        .update({ price_per_purchase_unit: newPrice })
        .eq('id', item.material_id);
      if (updateResult.error) {
        console.error('Auto-update harga gagal:', updateResult.error.message);
        continue;
      }

      const logError = await insertPriceLog({
        material_id: item.material_id,
        variant_id: null,
        supplier_id: supplierId,
        po_id: poId,
        brand: item.material?.brand || null,
        old_price: currentPrice,
        new_price: newPrice,
        source: 'po_receive',
        note: null,
      });
      if (logError) console.error('Log harga gagal disimpan:', logError.message);

      changes.push(
        buildChange({ material: item.material, supplierId, oldPrice: currentPrice, newPrice })
      );
    }

    // Lengkapi nama supplier untuk ditampilkan di notifikasi UI
    const supplierIds = [...new Set(changes.map((c) => c.supplier_id).filter(Boolean))];
    if (supplierIds.length > 0) {
      const { data: suppliers } = await supabase
        .from('suppliers')
        .select('id, name')
        .in('id', supplierIds);
      const nameById = new Map((suppliers || []).map((s) => [s.id, s.name]));
      changes.forEach((c) => {
        c.supplier_name = nameById.get(c.supplier_id) || null;
      });
    }

    return { ok: true, changes };
  } catch (err) {
    console.error('syncPricesFromReceive error:', err);
    return { ok: false, changes: [], error: err.message };
  }
}

module.exports = { syncPricesFromReceive, logPriceChange };
