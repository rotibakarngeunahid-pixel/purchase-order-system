import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, LineChart, TrendingDown, TrendingUp } from 'lucide-react';
import api, { formatRupiah, toInputDate } from '../lib/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SOURCE_LABEL = {
  po_receive: 'Penerimaan PO',
  manual: 'Edit Manual',
  initial: 'Harga Awal',
};

const SOURCE_BADGE_CLASS = {
  po_receive: 'bg-blue-100 text-blue-700',
  manual: 'bg-purple-100 text-purple-700',
  initial: 'bg-gray-100 text-gray-600',
};

const CHART_COLORS = ['#dc2626', '#2563eb', '#16a34a', '#d97706', '#9333ea', '#0891b2'];

function daysAgoInput(days) {
  return toInputDate(new Date(Date.now() - days * 24 * 3600 * 1000));
}

function formatDateTimeWITA(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return (
    date.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Makassar',
    }) +
    ' ' +
    date.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Makassar',
    })
  );
}

function logBrand(log) {
  // Prioritas snapshot merk di log — varian bisa saja sudah dihapus
  return log.brand || log.variant?.brand || log.material?.brand || null;
}

// ─── PriceTrendChart ──────────────────────────────────────────────────────────
// Grafik garis SVG sederhana (tanpa library) — satu garis per merk/varian.

function PriceTrendChart({ logs }) {
  const { series, minPrice, maxPrice, minTime, maxTime } = useMemo(() => {
    const byVariant = new Map();
    const sorted = [...logs].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    sorted.forEach((log) => {
      const key = log.variant_id || 'default';
      if (!byVariant.has(key)) {
        byVariant.set(key, { label: logBrand(log) || 'Default', points: [] });
      }
      byVariant.get(key).points.push({
        time: new Date(log.created_at).getTime(),
        price: log.new_price,
      });
    });
    const allPoints = [...byVariant.values()].flatMap((s) => s.points);
    const prices = allPoints.map((p) => p.price);
    const times = allPoints.map((p) => p.time);
    return {
      series: [...byVariant.values()],
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      minTime: Math.min(...times),
      maxTime: Math.max(...times),
    };
  }, [logs]);

  if (logs.length === 0) return null;

  const W = 640;
  const H = 220;
  const PAD = { top: 16, right: 16, bottom: 28, left: 76 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const priceSpan = maxPrice - minPrice || maxPrice || 1;
  const timeSpan = maxTime - minTime || 1;

  const xOf = (time) => PAD.left + ((time - minTime) / timeSpan) * innerW;
  const yOf = (price) => PAD.top + (1 - (price - minPrice) / priceSpan) * innerH;

  const yTicks = [minPrice, (minPrice + maxPrice) / 2, maxPrice];

  return (
    <div className="card p-4 mb-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-1 flex items-center gap-2">
        <LineChart className="w-4 h-4 text-brand-red" />
        Trend Harga
      </h3>
      <p className="text-xs text-gray-400 mb-3">
        Pergerakan harga per satuan beli pada periode terpilih
      </p>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[480px]" role="img">
          {/* Grid + label sumbu Y */}
          {yTicks.map((tick, i) => (
            <g key={i}>
              <line
                x1={PAD.left}
                y1={yOf(tick)}
                x2={W - PAD.right}
                y2={yOf(tick)}
                stroke="#f3f4f6"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 8}
                y={yOf(tick) + 4}
                textAnchor="end"
                fontSize="11"
                fill="#9ca3af"
              >
                {formatRupiah(tick)}
              </text>
            </g>
          ))}
          {/* Label sumbu X: tanggal awal & akhir */}
          <text x={PAD.left} y={H - 8} fontSize="11" fill="#9ca3af">
            {new Date(minTime).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
          </text>
          <text x={W - PAD.right} y={H - 8} textAnchor="end" fontSize="11" fill="#9ca3af">
            {new Date(maxTime).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
          </text>
          {/* Garis per merk/varian */}
          {series.map((s, idx) => {
            const color = CHART_COLORS[idx % CHART_COLORS.length];
            const pointsAttr = s.points
              .map((p) => `${xOf(p.time)},${yOf(p.price)}`)
              .join(' ');
            return (
              <g key={idx}>
                {s.points.length > 1 && (
                  <polyline
                    points={pointsAttr}
                    fill="none"
                    stroke={color}
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                )}
                {s.points.map((p, pi) => (
                  <circle key={pi} cx={xOf(p.time)} cy={yOf(p.price)} r="3.5" fill={color} />
                ))}
              </g>
            );
          })}
        </svg>
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {series.map((s, idx) => (
          <span key={idx} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
            />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── PriceLogs (halaman utama) ────────────────────────────────────────────────

export default function PriceLogs() {
  const [logs, setLogs] = useState([]);
  const [missingMigration, setMissingMigration] = useState(false);
  const [materials, setMaterials] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [materialId, setMaterialId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [direction, setDirection] = useState('');
  const [source, setSource] = useState('');
  const [dateFrom, setDateFrom] = useState(daysAgoInput(30));
  const [dateTo, setDateTo] = useState(toInputDate());

  // Load master data untuk filter (sekali)
  useEffect(() => {
    Promise.all([
      api.get('/api/materials').then((r) => r.data || []),
      api.get('/api/suppliers').then((r) => r.data || []),
    ])
      .then(([mats, sups]) => {
        setMaterials(mats);
        setSuppliers(sups);
      })
      .catch(console.error);
  }, []);

  // Load logs setiap filter berubah
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    if (materialId) params.set('material_id', materialId);
    if (supplierId) params.set('supplier_id', supplierId);
    if (direction) params.set('direction', direction);
    if (source) params.set('source', source);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);

    api
      .get(`/api/price-logs?${params.toString()}`)
      .then((res) => {
        if (cancelled) return;
        setLogs(res.data.logs || []);
        setMissingMigration(Boolean(res.data.missing_migration));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.response?.data?.error || 'Gagal memuat log harga');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [materialId, supplierId, direction, source, dateFrom, dateTo]);

  const applyPreset = (days) => {
    setDateFrom(daysAgoInput(days));
    setDateTo(toInputDate());
  };

  // ── Ringkasan analisa dari log terfilter ──
  const summary = useMemo(() => {
    const ups = logs.filter((l) => l.direction === 'up');
    const downs = logs.filter((l) => l.direction === 'down');
    const avgPct = (rows) => {
      const withPct = rows.filter((l) => l.change_pct !== null);
      if (withPct.length === 0) return null;
      return (
        Math.round(
          (withPct.reduce((s, l) => s + Math.abs(l.change_pct), 0) / withPct.length) * 10
        ) / 10
      );
    };
    // Bahan dengan kenaikan kumulatif terbesar pada periode
    const upByMaterial = new Map();
    ups.forEach((l) => {
      const key = l.material?.name || l.material_id;
      upByMaterial.set(key, (upByMaterial.get(key) || 0) + l.change_amount);
    });
    const topRiser = [...upByMaterial.entries()].sort((a, b) => b[1] - a[1])[0] || null;

    return {
      total: ups.length + downs.length,
      upCount: ups.length,
      downCount: downs.length,
      avgUpPct: avgPct(ups),
      avgDownPct: avgPct(downs),
      materialCount: new Set(logs.map((l) => l.material_id)).size,
      topRiser,
    };
  }, [logs]);

  const activeMaterial = materials.find((m) => m.id === materialId);

  return (
    <div className="page-shell">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Log Harga Bahan</h1>
          <p className="page-subtitle">
            Riwayat perubahan harga bahan baku — terisi otomatis dari penerimaan PO &amp; edit
            manual
          </p>
        </div>
      </div>

      {missingMigration && (
        <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg text-orange-700 text-sm">
          Tabel log harga belum dibuat. Jalankan{' '}
          <code className="font-mono text-xs bg-orange-100 px-1 py-0.5 rounded">
            supabase/migration_price_logs.sql
          </code>{' '}
          di Supabase Dashboard &gt; SQL Editor untuk mengaktifkan fitur ini.
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Ringkasan analisa */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-6">
        <div className="stat-card">
          <p className="text-xs font-semibold text-gray-500">Total Perubahan</p>
          <div>
            <p className="text-2xl font-bold text-gray-800">{summary.total}</p>
            <p className="text-xs text-gray-400">{summary.materialCount} bahan terdampak</p>
          </div>
        </div>
        <div className="stat-card">
          <p className="text-xs font-semibold text-gray-500 flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5 text-red-500" /> Kenaikan
          </p>
          <div>
            <p className="text-2xl font-bold text-red-600">{summary.upCount}</p>
            <p className="text-xs text-gray-400">
              {summary.avgUpPct !== null ? `rata-rata +${summary.avgUpPct}%` : '—'}
            </p>
          </div>
        </div>
        <div className="stat-card">
          <p className="text-xs font-semibold text-gray-500 flex items-center gap-1">
            <TrendingDown className="w-3.5 h-3.5 text-green-500" /> Penurunan
          </p>
          <div>
            <p className="text-2xl font-bold text-green-600">{summary.downCount}</p>
            <p className="text-xs text-gray-400">
              {summary.avgDownPct !== null ? `rata-rata -${summary.avgDownPct}%` : '—'}
            </p>
          </div>
        </div>
        <div className="stat-card">
          <p className="text-xs font-semibold text-gray-500">Kenaikan Terbesar</p>
          <div>
            {summary.topRiser ? (
              <>
                <p
                  className="text-sm font-bold text-gray-800 leading-snug truncate"
                  title={summary.topRiser[0]}
                >
                  {summary.topRiser[0]}
                </p>
                <p className="text-xs text-red-600 font-semibold">
                  +{formatRupiah(summary.topRiser[1])} kumulatif
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-400">Tidak ada kenaikan</p>
            )}
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="filter-card">
        <div className="filter-field">
          <label className="filter-label">Bahan</label>
          <select
            value={materialId}
            onChange={(e) => setMaterialId(e.target.value)}
            className="input"
          >
            <option value="">Semua Bahan</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-field">
          <label className="filter-label">Supplier</label>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="input"
          >
            <option value="">Semua Supplier</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-field">
          <label className="filter-label">Arah Perubahan</label>
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            className="input"
          >
            <option value="">Semua</option>
            <option value="up">Naik</option>
            <option value="down">Turun</option>
          </select>
        </div>
        <div className="filter-field">
          <label className="filter-label">Sumber</label>
          <select value={source} onChange={(e) => setSource(e.target.value)} className="input">
            <option value="">Semua Sumber</option>
            <option value="po_receive">Penerimaan PO</option>
            <option value="manual">Edit Manual</option>
            <option value="initial">Harga Awal</option>
          </select>
        </div>
        <div className="filter-field">
          <label className="filter-label">Dari Tanggal</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="input"
          />
        </div>
        <div className="filter-field">
          <label className="filter-label">Sampai</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="input"
          />
        </div>
        <div className="filter-field sm:col-span-2">
          <label className="filter-label">Periode Cepat</label>
          <div className="flex gap-2">
            {[7, 30, 90].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => applyPreset(days)}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  dateFrom === daysAgoInput(days) && dateTo === toInputDate()
                    ? 'border-brand-red bg-red-50 text-brand-red'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {days} hari
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grafik trend — tampil saat satu bahan dipilih */}
      {materialId && !loading && logs.length > 0 && <PriceTrendChart logs={logs} />}

      {/* Tabel log */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
        </div>
      ) : logs.length === 0 ? (
        <div className="card p-10 text-center text-gray-400">
          <p className="font-medium">Belum ada log perubahan harga</p>
          <p className="text-sm mt-1">
            Log terisi otomatis saat harga aktual penerimaan berbeda dari harga master, atau saat
            harga diubah manual di Master Data
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-4 py-3 text-left text-gray-600 font-medium">Waktu</th>
                <th className="px-4 py-3 text-left text-gray-600 font-medium">Bahan</th>
                <th className="px-4 py-3 text-left text-gray-600 font-medium">Supplier</th>
                <th className="px-4 py-3 text-right text-gray-600 font-medium">Harga Lama</th>
                <th className="px-4 py-3 text-center text-gray-600 font-medium" />
                <th className="px-4 py-3 text-right text-gray-600 font-medium">Harga Baru</th>
                <th className="px-4 py-3 text-right text-gray-600 font-medium">Perubahan</th>
                <th className="px-4 py-3 text-center text-gray-600 font-medium">Sumber</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {logs.map((log) => {
                const isUp = log.direction === 'up';
                const isDown = log.direction === 'down';
                const brand = logBrand(log);
                return (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {formatDateTimeWITA(log.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{log.material?.name || '—'}</p>
                      <p className="text-xs text-gray-400">
                        {brand ? `Merk: ${brand}` : 'Tanpa merk'}
                        {log.material?.purchase_unit && ` · per ${log.material.purchase_unit}`}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{log.supplier?.name || '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-500">
                      {log.old_price === null ? (
                        <span className="text-xs text-gray-300">—</span>
                      ) : (
                        formatRupiah(log.old_price)
                      )}
                    </td>
                    <td className="px-2 py-3 text-center text-gray-300">
                      <ArrowRight className="w-3.5 h-3.5 inline" />
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800">
                      {formatRupiah(log.new_price)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {isUp || isDown ? (
                        <span
                          className={`inline-flex items-center gap-1 font-semibold ${
                            isUp ? 'text-red-600' : 'text-green-600'
                          }`}
                        >
                          {isUp ? (
                            <TrendingUp className="w-3.5 h-3.5" />
                          ) : (
                            <TrendingDown className="w-3.5 h-3.5" />
                          )}
                          {isUp ? '+' : ''}
                          {formatRupiah(log.change_amount)}
                          {log.change_pct !== null && (
                            <span className="text-xs font-normal">
                              ({isUp ? '+' : ''}
                              {log.change_pct}%)
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">baseline</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          SOURCE_BADGE_CLASS[log.source] || 'bg-gray-100 text-gray-600'
                        }`}
                        title={log.note || ''}
                      >
                        {SOURCE_LABEL[log.source] || log.source}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {logs.length >= 500 && (
            <p className="px-4 py-3 text-xs text-gray-400 border-t">
              Menampilkan 500 log terbaru. Persempit rentang tanggal atau filter untuk melihat
              data lebih spesifik.
            </p>
          )}
        </div>
      )}

      {activeMaterial && !loading && (
        <p className="mt-3 text-xs text-gray-400">
          Harga master saat ini untuk <strong>{activeMaterial.name}</strong> (tanpa merk):{' '}
          {formatRupiah(activeMaterial.price_per_purchase_unit)} per{' '}
          {activeMaterial.purchase_unit}
        </p>
      )}
    </div>
  );
}
