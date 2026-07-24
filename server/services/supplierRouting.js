const supabase = require('./supabase');

// Mapping supplier per (outlet, bahan) — dipakai calculator.calculatePOs untuk
// mengalihkan sebagian/semua qty sebuah bahan ke supplier lain tergantung outlet
// pemesan (mis. cabang yang lebih dekat ke supplier tertentu). Tabel mungkin
// belum ada jika migration belum dijalankan — pada kasus itu jatuh ke perilaku
// lama (supplier default per bahan).
async function loadSupplierRouting() {
  const empty = { supplierOverrides: {}, suppliersById: {}, outletsById: {} };

  const [overridesRes, suppliersRes, outletsRes] = await Promise.all([
    supabase
      .from('outlet_material_suppliers')
      .select('outlet_id, material_id, supplier_id')
      .eq('is_active', true),
    supabase.from('suppliers').select('id, name, wa_number, gives_roti_tawar_bonus'),
    supabase.from('outlets').select('id, name'),
  ]);

  if (overridesRes.error) {
    const message = String(overridesRes.error.message || '').toLowerCase();
    const missingTable = message.includes('outlet_material_suppliers') && (
      message.includes('relation') || message.includes('schema cache') || message.includes('could not find')
    );
    if (!missingTable) throw overridesRes.error;
  }
  if (suppliersRes.error) {
    const message = String(suppliersRes.error.message || '').toLowerCase();
    const missingBonusColumn = message.includes('gives_roti_tawar_bonus') && (
      message.includes('column') || message.includes('schema cache') || message.includes('could not find')
    );
    if (!missingBonusColumn) throw suppliersRes.error;

    // Migration kolom bonus belum dijalankan — ambil tanpa kolom itu, default ke true di bawah
    const retry = await supabase.from('suppliers').select('id, name, wa_number');
    if (retry.error) throw retry.error;
    suppliersRes.data = retry.data;
  }
  if (outletsRes.error) throw outletsRes.error;

  const supplierOverrides = {};
  (overridesRes.data || []).forEach((row) => {
    supplierOverrides[`${row.outlet_id}:${row.material_id}`] = row.supplier_id;
  });

  const suppliersById = {};
  (suppliersRes.data || []).forEach((s) => {
    // Default true bila kolom belum ada / belum diisi — pertahankan perilaku lama
    // (bonus otomatis berlaku) sampai admin menonaktifkannya secara eksplisit.
    suppliersById[s.id] = { ...s, gives_roti_tawar_bonus: s.gives_roti_tawar_bonus !== false };
  });

  const outletsById = {};
  (outletsRes.data || []).forEach((o) => { outletsById[o.id] = o; });

  return { ...empty, supplierOverrides, suppliersById, outletsById };
}

module.exports = { loadSupplierRouting };
