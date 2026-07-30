'use strict';

// Regresi untuk bug: mapping supplier per outlet (mis. Dalung Permai + Selai
// Blueberry -> supplier UD Trisna, merk Tropicana) muncul benar di Master Data
// (select('*')) tapi merk-nya jatuh ke default bahan di Review Order/Generate PO
// karena loadSupplierRouting() tidak pernah men-select kolom `brand`.
//
// Test ini mem-mock modul supabase (lewat require.cache) supaya bisa memeriksa
// baik kolom yang di-SELECT maupun hasil akhir yang dikembalikan ke pemanggil,
// tanpa butuh koneksi database sungguhan.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const supabasePath = require.resolve('../services/supabase');
const supplierRoutingPath = require.resolve('../services/supplierRouting');

function installFakeSupabase({ mappingRows, onSelectMappingColumns }) {
  const fake = {
    from(table) {
      if (table === 'outlet_material_suppliers') {
        return {
          select(columns) {
            if (onSelectMappingColumns) onSelectMappingColumns(columns);
            return {
              eq() {
                return Promise.resolve({ data: mappingRows, error: null });
              },
            };
          },
        };
      }
      if (table === 'suppliers') {
        return {
          select() {
            return Promise.resolve({
              data: [{ id: 'sup-ud-trisna', name: 'UD Trisna', wa_number: '0800', gives_roti_tawar_bonus: true }],
              error: null,
            });
          },
        };
      }
      if (table === 'outlets') {
        return {
          select() {
            return Promise.resolve({ data: [{ id: 'outlet-dalung', name: 'Dalung Permai' }], error: null });
          },
        };
      }
      throw new Error(`Tabel tak terduga dalam fake supabase: ${table}`);
    },
  };

  delete require.cache[supplierRoutingPath];
  require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };
}

function restoreSupabase() {
  delete require.cache[supabasePath];
  delete require.cache[supplierRoutingPath];
}

test('loadSupplierRouting menyertakan kolom brand saat select mapping', async () => {
  let selectedColumns = null;
  installFakeSupabase({
    mappingRows: [
      {
        id: 'map-1',
        outlet_id: 'outlet-dalung',
        material_id: 'mat-selai-blueberry',
        supplier_id: 'sup-ud-trisna',
        is_active: true,
        brand: 'Tropicana',
      },
    ],
    onSelectMappingColumns: (columns) => {
      selectedColumns = columns;
    },
  });

  try {
    const { loadSupplierRouting } = require(supplierRoutingPath);
    const routing = await loadSupplierRouting();

    assert.ok(
      String(selectedColumns).includes('brand'),
      `query outlet_material_suppliers harus men-select kolom brand, dapat: ${selectedColumns}`
    );

    const config = routing.purchaseConfigs['outlet-dalung:mat-selai-blueberry'];
    assert.ok(config, 'mapping outlet+bahan harus ditemukan');
    assert.equal(config.brand, 'Tropicana', 'brand hasil mapping outlet harus ikut terbawa, bukan hilang jadi undefined');
    assert.equal(config.supplier_id, 'sup-ud-trisna');
  } finally {
    restoreSupabase();
  }
});

test('loadSupplierRouting tetap jalan (fallback) bila kolom brand belum ada (migration belum dijalankan)', async () => {
  let attempt = 0;
  const fake = {
    from(table) {
      if (table === 'outlet_material_suppliers') {
        return {
          select(columns) {
            attempt += 1;
            return {
              eq() {
                if (columns.includes('brand')) {
                  return Promise.resolve({
                    data: null,
                    error: { message: 'column outlet_material_suppliers.brand does not exist (schema cache)' },
                  });
                }
                return Promise.resolve({
                  data: [
                    {
                      id: 'map-1',
                      outlet_id: 'outlet-dalung',
                      material_id: 'mat-selai-blueberry',
                      supplier_id: 'sup-ud-trisna',
                      is_active: true,
                    },
                  ],
                  error: null,
                });
              },
            };
          },
        };
      }
      if (table === 'suppliers') {
        return { select: () => Promise.resolve({ data: [], error: null }) };
      }
      if (table === 'outlets') {
        return { select: () => Promise.resolve({ data: [], error: null }) };
      }
      throw new Error(`Tabel tak terduga: ${table}`);
    },
  };

  delete require.cache[supplierRoutingPath];
  require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

  try {
    const { loadSupplierRouting } = require(supplierRoutingPath);
    const routing = await loadSupplierRouting();
    const config = routing.purchaseConfigs['outlet-dalung:mat-selai-blueberry'];
    assert.ok(config, 'harus tetap fallback ke kolom tanpa brand, bukan melempar error');
    assert.equal(config.supplier_id, 'sup-ud-trisna');
    assert.equal(attempt, 2, 'harus mencoba select brand dulu baru fallback tanpa brand');
  } finally {
    restoreSupabase();
  }
});
