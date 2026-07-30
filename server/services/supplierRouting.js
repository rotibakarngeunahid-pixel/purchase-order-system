const supabase = require('./supabase');
const { buildConfigKey } = require('./purchaseConfig');

// Konfigurasi pembelian per (outlet, bahan) — dipakai calculator.calculatePOs
// untuk menentukan supplier, satuan beli, faktor konversi, harga, minimum, dan
// kelipatan pembelian sesuai outlet pemesan (mis. cabang yang lebih dekat ke
// supplier tertentu, atau supplier yang menjual kemasan berbeda).
//
// Tabel/kolom mungkin belum ada jika migration belum dijalankan — pada kasus
// itu jatuh ke perilaku lama (semua aturan pembelian dari master bahan).
const CONFIG_COLUMNS =
  'id, outlet_id, material_id, supplier_id, is_active, purchase_unit, package_qty, ' +
  'package_unit, price_per_purchase_unit, min_order_qty, order_multiple, request_basis';
// brand dipisah dari CONFIG_COLUMNS karena migration-nya (migration_outlet_material_supplier_brand.sql)
// ditambahkan belakangan — instalasi yang belum menjalankannya harus tetap bisa fallback tanpa kolom ini.
const FULL_COLUMNS = `${CONFIG_COLUMNS}, brand`;
const LEGACY_COLUMNS = 'id, outlet_id, material_id, supplier_id, is_active';

const CONFIG_ONLY_COLUMNS = [
  'purchase_unit',
  'package_qty',
  'package_unit',
  'price_per_purchase_unit',
  'min_order_qty',
  'order_multiple',
  'request_basis',
];
const BRAND_ONLY_COLUMNS = ['brand'];

function isMissingRelationError(error, relation) {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes(relation.toLowerCase()) &&
    (message.includes('relation') ||
      message.includes('schema cache') ||
      message.includes('could not find'))
  );
}

function isMissingColumnError(error, columns) {
  const message = String(error?.message || '').toLowerCase();
  return (
    columns.some((column) => message.includes(column.toLowerCase())) &&
    (message.includes('column') ||
      message.includes('schema cache') ||
      message.includes('could not find'))
  );
}

// Ambil baris mapping, turun bertahap agar tetap jalan di instalasi yang
// migration-nya belum lengkap: kolom brand → kolom konfigurasi → kolom lama → tabel belum ada.
async function fetchMappingRows() {
  let result = await supabase
    .from('outlet_material_suppliers')
    .select(FULL_COLUMNS)
    .eq('is_active', true);

  if (!result.error) return result.data || [];

  if (isMissingColumnError(result.error, BRAND_ONLY_COLUMNS)) {
    console.warn(
      'Kolom brand belum ada di outlet_material_suppliers. Jalankan ' +
        'supabase/migration_outlet_material_supplier_brand.sql agar merk per outlet+supplier aktif. ' +
        'Sementara ini merk mengikuti default bahan.'
    );
    result = await supabase
      .from('outlet_material_suppliers')
      .select(CONFIG_COLUMNS)
      .eq('is_active', true);
    if (!result.error) return result.data || [];
  }

  if (isMissingColumnError(result.error, CONFIG_ONLY_COLUMNS)) {
    console.warn(
      'Kolom konfigurasi pembelian belum ada di outlet_material_suppliers. ' +
        'Jalankan supabase/migration_outlet_material_purchase_config.sql agar ' +
        'satuan/harga/minimum per outlet aktif. Sementara ini hanya supplier yang dialihkan.'
    );
    result = await supabase
      .from('outlet_material_suppliers')
      .select(LEGACY_COLUMNS)
      .eq('is_active', true);
    if (!result.error) return result.data || [];
  }

  if (isMissingRelationError(result.error, 'outlet_material_suppliers')) return [];

  throw result.error;
}

async function loadSupplierRouting() {
  const [mappingRows, suppliersRes, outletsRes] = await Promise.all([
    fetchMappingRows(),
    supabase.from('suppliers').select('id, name, wa_number, gives_roti_tawar_bonus'),
    supabase.from('outlets').select('id, name'),
  ]);

  if (suppliersRes.error) {
    if (!isMissingColumnError(suppliersRes.error, ['gives_roti_tawar_bonus'])) {
      throw suppliersRes.error;
    }

    // Migration kolom bonus belum dijalankan — ambil tanpa kolom itu, default ke true di bawah
    const retry = await supabase.from('suppliers').select('id, name, wa_number');
    if (retry.error) throw retry.error;
    suppliersRes.data = retry.data;
  }
  if (outletsRes.error) throw outletsRes.error;

  // purchaseConfigs = baris mapping mentah; supplierOverrides dipertahankan
  // agar pemanggil lama (yang hanya butuh routing supplier) tetap bekerja.
  const purchaseConfigs = {};
  const supplierOverrides = {};
  mappingRows.forEach((row) => {
    const key = buildConfigKey(row.outlet_id, row.material_id);
    purchaseConfigs[key] = row;
    if (row.supplier_id) supplierOverrides[key] = row.supplier_id;
  });

  const suppliersById = {};
  (suppliersRes.data || []).forEach((s) => {
    // Default true bila kolom belum ada / belum diisi — pertahankan perilaku lama
    // (bonus otomatis berlaku) sampai admin menonaktifkannya secara eksplisit.
    suppliersById[s.id] = { ...s, gives_roti_tawar_bonus: s.gives_roti_tawar_bonus !== false };
  });

  const outletsById = {};
  (outletsRes.data || []).forEach((o) => { outletsById[o.id] = o; });

  return { supplierOverrides, purchaseConfigs, suppliersById, outletsById };
}

module.exports = { loadSupplierRouting };
