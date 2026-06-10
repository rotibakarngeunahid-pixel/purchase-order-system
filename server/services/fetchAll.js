'use strict';

const PAGE_SIZE = 1000;

/**
 * Ambil SEMUA baris melewati batas max-rows PostgREST (default 1000 di Supabase).
 * Tanpa ini, query yang hasilnya > 1000 baris terpotong diam-diam dan
 * laporan/analitik menjadi undercount.
 *
 * buildQuery harus mengembalikan query BARU setiap dipanggil (builder Supabase
 * bersifat mutable) dan sudah menyertakan .order(...) agar paginasi deterministik.
 * Return: { data, error } — kompatibel dengan bentuk hasil supabase-js.
 */
async function fetchAllRows(buildQuery) {
  const rows = [];
  let from = 0;

  for (;;) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) return { data: null, error };
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return { data: rows, error: null };
}

module.exports = { fetchAllRows, PAGE_SIZE };
