'use strict';

// Regresi untuk fitur "Hapus Data": filter cabang + jenis data harus divalidasi
// dengan benar, RPC transaksional (reset_data_preview/reset_data_execute) harus
// dipanggil dengan parameter yang tepat, key internal (_distribution_photo_files)
// tidak boleh bocor ke response client, dan file foto di Storage harus ikut
// dibersihkan setelah eksekusi berhasil.
//
// Modul supabase & photoCleanup di-mock lewat require.cache (pola yang sama
// dipakai supplierRouting.test.js) supaya tidak butuh koneksi database sungguhan.

const test = require('node:test');
const assert = require('node:assert/strict');

const supabasePath = require.resolve('../services/supabase');
const photoCleanupPath = require.resolve('../services/photoCleanup');
const dataDeletionPath = require.resolve('../routes/dataDeletion');

function installFakeSupabase({ rpcImpl, removeImpl } = {}) {
  const calls = { rpc: [], remove: [] };

  const fake = {
    rpc(name, params) {
      calls.rpc.push({ name, params });
      return Promise.resolve(rpcImpl ? rpcImpl(name, params) : { data: {}, error: null });
    },
    storage: {
      from(bucket) {
        return {
          remove(paths) {
            calls.remove.push({ bucket, paths });
            return Promise.resolve(removeImpl ? removeImpl(paths) : { error: null });
          },
        };
      },
    },
  };

  delete require.cache[photoCleanupPath];
  delete require.cache[dataDeletionPath];
  require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

  return calls;
}

function restoreSupabase() {
  delete require.cache[supabasePath];
  delete require.cache[photoCleanupPath];
  delete require.cache[dataDeletionPath];
}

function getHandler(router, method, path) {
  const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method]);
  if (!layer) throw new Error(`Handler tidak ditemukan: ${method.toUpperCase()} ${path}`);
  return layer.route.stack[0].handle;
}

function fakeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

// ─── parseFilters (validasi murni, tanpa mock) ───────────────────────────────

test('parseFilters: menolak jika data_types kosong', () => {
  const { parseFilters } = require('../routes/dataDeletion');
  const result = parseFilters({ data_types: [] });
  assert.match(result.error, /minimal satu jenis data/);
});

test('parseFilters: menolak jenis data yang tidak dikenal', () => {
  const { parseFilters } = require('../routes/dataDeletion');
  const result = parseFilters({ data_types: ['tidak_ada_ginian'] });
  assert.match(result.error, /tidak dikenal/);
});

test('parseFilters: menolak outlet_ids yang bukan array', () => {
  const { parseFilters } = require('../routes/dataDeletion');
  const result = parseFilters({ outlet_ids: 'outlet-a', data_types: ['order'] });
  assert.match(result.error, /harus berupa array/);
});

test('parseFilters: menolak date_from > date_to', () => {
  const { parseFilters } = require('../routes/dataDeletion');
  const result = parseFilters({ data_types: ['order'], date_from: '2026-02-01', date_to: '2026-01-01' });
  assert.match(result.error, /Tanggal mulai/);
});

test('parseFilters: outlet_ids kosong -> outletIds null (berarti semua cabang)', () => {
  const { parseFilters } = require('../routes/dataDeletion');
  const result = parseFilters({ outlet_ids: [], data_types: ['order'] });
  assert.equal(result.outletIds, null);
  assert.deepEqual(result.dataTypes, ['order']);
  assert.equal(result.dateFrom, null);
  assert.equal(result.dateTo, null);
});

test('parseFilters: outlet_ids terisi tetap dipertahankan', () => {
  const { parseFilters } = require('../routes/dataDeletion');
  const result = parseFilters({ outlet_ids: ['outlet-a', 'outlet-b'], data_types: ['order', 'purchase_order'] });
  assert.deepEqual(result.outletIds, ['outlet-a', 'outlet-b']);
  assert.deepEqual(result.dataTypes, ['order', 'purchase_order']);
});

// ─── POST /preview ────────────────────────────────────────────────────────────

test('POST /preview: memanggil reset_data_preview dengan parameter yang benar & tidak bocorkan key internal', async () => {
  const calls = installFakeSupabase({
    rpcImpl: (name) => {
      assert.equal(name, 'reset_data_preview');
      return {
        data: {
          order_sessions: 2,
          order_request_items: 5,
          _distribution_photo_files: [[{ url: 'https://x/should-not-leak.webp' }]],
        },
        error: null,
      };
    },
  });

  try {
    const router = require('../routes/dataDeletion');
    const handler = getHandler(router, 'post', '/preview');

    const req = { body: { outlet_ids: ['outlet-a'], data_types: ['order'], date_from: '2026-01-01', date_to: '2026-01-31' } };
    const res = fakeRes();
    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.preview, { order_sessions: 2, order_request_items: 5 });
    assert.equal(res.body.preview._distribution_photo_files, undefined);
    assert.equal(res.body.total, 7);

    assert.equal(calls.rpc.length, 1);
    assert.deepEqual(calls.rpc[0].params, {
      p_outlet_ids: ['outlet-a'],
      p_data_types: ['order'],
      p_date_from: '2026-01-01',
      p_date_to: '2026-01-31',
    });
  } finally {
    restoreSupabase();
  }
});

test('POST /preview: outlet_ids kosong dikirim sebagai null (semua cabang) ke RPC', async () => {
  const calls = installFakeSupabase({
    rpcImpl: () => ({ data: { order_sessions: 0 }, error: null }),
  });

  try {
    const router = require('../routes/dataDeletion');
    const handler = getHandler(router, 'post', '/preview');

    const req = { body: { outlet_ids: [], data_types: ['order'] } };
    const res = fakeRes();
    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(calls.rpc[0].params.p_outlet_ids, null);
  } finally {
    restoreSupabase();
  }
});

test('POST /preview: validasi gagal -> 400, RPC tidak pernah dipanggil', async () => {
  const calls = installFakeSupabase();

  try {
    const router = require('../routes/dataDeletion');
    const handler = getHandler(router, 'post', '/preview');

    const req = { body: { data_types: [] } };
    const res = fakeRes();
    await handler(req, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /minimal satu jenis data/);
    assert.equal(calls.rpc.length, 0);
  } finally {
    restoreSupabase();
  }
});

test('POST /preview: error dari RPC diteruskan sebagai 500', async () => {
  installFakeSupabase({
    rpcImpl: () => ({ data: null, error: { message: 'koneksi database gagal' } }),
  });

  try {
    const router = require('../routes/dataDeletion');
    const handler = getHandler(router, 'post', '/preview');

    const req = { body: { data_types: ['order'] } };
    const res = fakeRes();
    await handler(req, res);

    assert.equal(res.statusCode, 500);
    assert.match(res.body.error, /koneksi database gagal/);
  } finally {
    restoreSupabase();
  }
});

// ─── POST /execute ────────────────────────────────────────────────────────────

test('POST /execute: tanpa confirm=true -> 400, RPC tidak pernah dipanggil', async () => {
  const calls = installFakeSupabase();

  try {
    const router = require('../routes/dataDeletion');
    const handler = getHandler(router, 'post', '/execute');

    const req = { body: { data_types: ['order'] } };
    const res = fakeRes();
    await handler(req, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /Konfirmasi wajib/);
    assert.equal(calls.rpc.length, 0);
  } finally {
    restoreSupabase();
  }
});

test('POST /execute: sukses menghapus & membersihkan file foto distribusi di Storage', async () => {
  const calls = installFakeSupabase({
    rpcImpl: (name) => {
      assert.equal(name, 'reset_data_execute');
      return {
        data: {
          distribution_photos: 2,
          _distribution_photo_files: [
            [{ url: 'https://proj.supabase.co/storage/v1/object/public/distribusi/2026-01-01/a.webp' }],
            [{ url: 'https://proj.supabase.co/storage/v1/object/public/distribusi/2026-01-02/b.webp' }],
          ],
        },
        error: null,
      };
    },
    removeImpl: (paths) => {
      assert.deepEqual(paths, ['2026-01-01/a.webp', '2026-01-02/b.webp']);
      return { error: null };
    },
  });

  try {
    const router = require('../routes/dataDeletion');
    const handler = getHandler(router, 'post', '/execute');

    const req = { body: { outlet_ids: [], data_types: ['distribution_photo'], confirm: true }, user: { role: 'admin' } };
    const res = fakeRes();
    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.deepEqual(res.body.deleted, { distribution_photos: 2 });
    assert.equal(res.body.deleted._distribution_photo_files, undefined);
    assert.equal(res.body.total_deleted, 2);
    assert.equal(res.body.files_deleted, 2);

    assert.equal(calls.remove.length, 1);
    assert.equal(calls.remove[0].bucket, 'distribusi');
  } finally {
    restoreSupabase();
  }
});

test('POST /execute: kegagalan hapus file storage tidak membatalkan hasil penghapusan data (best-effort)', async () => {
  installFakeSupabase({
    rpcImpl: () => ({
      data: {
        distribution_photos: 1,
        _distribution_photo_files: [[{ url: 'https://proj.supabase.co/storage/v1/object/public/distribusi/a.webp' }]],
      },
      error: null,
    }),
    removeImpl: () => ({ error: { message: 'storage down' } }),
  });

  try {
    const router = require('../routes/dataDeletion');
    const handler = getHandler(router, 'post', '/execute');

    const req = { body: { data_types: ['distribution_photo'], confirm: true } };
    const res = fakeRes();
    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.deleted.distribution_photos, 1);
    assert.equal(res.body.files_deleted, 0);
  } finally {
    restoreSupabase();
  }
});

test('POST /execute: error dari RPC (mis. tengah transaksi gagal & rollback) -> 500, tidak ada file yang dibersihkan', async () => {
  const calls = installFakeSupabase({
    rpcImpl: () => ({ data: null, error: { message: 'transaksi dibatalkan (rollback)' } }),
  });

  try {
    const router = require('../routes/dataDeletion');
    const handler = getHandler(router, 'post', '/execute');

    const req = { body: { data_types: ['order'], confirm: true } };
    const res = fakeRes();
    await handler(req, res);

    assert.equal(res.statusCode, 500);
    assert.match(res.body.error, /rollback/);
    assert.equal(calls.remove.length, 0);
  } finally {
    restoreSupabase();
  }
});

test('POST /execute: memanggil reset_data_execute (bukan preview) dengan parameter yang benar', async () => {
  const calls = installFakeSupabase({
    rpcImpl: () => ({ data: { order_sessions: 1 }, error: null }),
  });

  try {
    const router = require('../routes/dataDeletion');
    const handler = getHandler(router, 'post', '/execute');

    const req = { body: { outlet_ids: ['outlet-a'], data_types: ['order'], confirm: true } };
    const res = fakeRes();
    await handler(req, res);

    assert.equal(calls.rpc[0].name, 'reset_data_execute');
    assert.deepEqual(calls.rpc[0].params, {
      p_outlet_ids: ['outlet-a'],
      p_data_types: ['order'],
      p_date_from: null,
      p_date_to: null,
    });
  } finally {
    restoreSupabase();
  }
});
