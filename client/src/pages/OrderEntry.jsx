import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api, { formatDateID, toInputDate } from '../lib/api';
import { previewRotiOrder } from '../services/rotiTawarService';

const statusLabel = { draft: 'Draft', sent: 'Terkirim', completed: 'Selesai' };
const statusClass = { draft: 'badge-draft', sent: 'badge-sent', completed: 'badge-completed' };

export default function OrderEntry() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialSessionId = searchParams.get('sessionId');

  const [orderDate, setOrderDate] = useState(toInputDate());
  const [session, setSession] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [matrix, setMatrix] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [rotiLoading, setRotiLoading] = useState(false);
  const [rotiError, setRotiError] = useState(null);
  const [rotiDetail, setRotiDetail] = useState(null);
  const saveTimers = useRef({});

  // Load session dan master data
  useEffect(() => {
    loadMasterData();
  }, []);

  useEffect(() => {
    if (initialSessionId) {
      loadSession(initialSessionId);
    } else {
      setLoading(false);
    }
  }, [initialSessionId]);

  async function loadMasterData() {
    const [matRes, outRes] = await Promise.all([
      api.get('/api/materials'),
      api.get('/api/outlets'),
    ]);
    setMaterials(matRes.data.filter((m) => m.is_active));
    setOutlets(outRes.data.filter((o) => o.is_active));
  }

  async function loadSession(sessionId) {
    setLoading(true);
    try {
      const res = await api.get(`/api/orders/session/${sessionId}`);
      setSession(res.data);
      setOrderDate(res.data.order_date);
      // Isi matrix dari items yang ada
      const m = {};
      (res.data.items || []).forEach((item) => {
        const key = `${item.outlet_id}_${item.material_id}`;
        m[key] = item.qty;
      });
      setMatrix(m);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const getOrCreateSession = async (date) => {
    const res = await api.post('/api/orders/session', { order_date: date });
    setSession(res.data);
    return res.data;
  };

  const handleDateChange = async (e) => {
    const date = e.target.value;
    setOrderDate(date);
    setMatrix({});
    setLoading(true);
    try {
      const res = await api.post('/api/orders/session', { order_date: date });
      setSession(res.data);
      const m = {};
      (res.data.items || []).forEach((item) => {
        const key = `${item.outlet_id}_${item.material_id}`;
        m[key] = item.qty;
      });
      setMatrix(m);
      // Reload full session with items
      const fullRes = await api.get(`/api/orders/session/${res.data.id}`);
      setSession(fullRes.data);
      const m2 = {};
      (fullRes.data.items || []).forEach((item) => {
        const key = `${item.outlet_id}_${item.material_id}`;
        m2[key] = item.qty;
      });
      setMatrix(m2);
    } finally {
      setLoading(false);
    }
  };

  const handleCellChange = async (outletId, materialId, value) => {
    const key = `${outletId}_${materialId}`;
    const qty = value === '' ? '' : Number(value);
    setMatrix((prev) => ({ ...prev, [key]: qty }));

    // Debounce save
    if (saveTimers.current[key]) clearTimeout(saveTimers.current[key]);
    saveTimers.current[key] = setTimeout(async () => {
      let currentSession = session;
      if (!currentSession) {
        currentSession = await getOrCreateSession(orderDate);
      }
      if (currentSession.status !== 'draft') return;
      try {
        setSaving(true);
        await api.post(`/api/orders/session/${currentSession.id}/request`, {
          outlet_id: outletId,
          material_id: materialId,
          qty: qty || 0,
        });
      } catch (err) {
        console.error('Save error:', err);
      } finally {
        setSaving(false);
      }
    }, 600);
  };

  const handleCalculate = async () => {
    setCalculating(true);
    try {
      let currentSession = session;
      if (!currentSession) {
        currentSession = await getOrCreateSession(orderDate);
      }
      // Save all pending cells first
      Object.keys(saveTimers.current).forEach((k) => {
        if (saveTimers.current[k]) {
          clearTimeout(saveTimers.current[k]);
          delete saveTimers.current[k];
        }
      });
      navigate(`/order/${currentSession.id}/review`);
    } finally {
      setCalculating(false);
    }
  };

  const handleRotiAutoFill = async () => {
    const rotiMaterial = materials.find((m) =>
      m.name.toLowerCase().includes('roti tawar')
    );
    if (!rotiMaterial) {
      setRotiError('Material "Roti Tawar" tidak ditemukan di master data.');
      return;
    }

    setRotiLoading(true);
    setRotiError(null);
    setRotiDetail(null);
    try {
      const result = await previewRotiOrder(orderDate);

      // Isi matrix per outlet berdasarkan need per cabang (Opsi A)
      const newMatrix = { ...matrix };
      const savePromises = [];

      result.branches.forEach((branch) => {
        const outlet = outlets.find(
          (o) => o.name.toLowerCase() === branch.display_name.toLowerCase()
        );
        if (!outlet) return;
        const key = `${outlet.id}_${rotiMaterial.id}`;
        newMatrix[key] = branch.need;

        // Batalkan debounce timer yang mungkin ada
        if (saveTimers.current[key]) {
          clearTimeout(saveTimers.current[key]);
          delete saveTimers.current[key];
        }

        // Simpan langsung ke backend jika sesi sudah ada
        if (session && session.status === 'draft') {
          savePromises.push(
            api.post(`/api/orders/session/${session.id}/request`, {
              outlet_id: outlet.id,
              material_id: rotiMaterial.id,
              qty: branch.need,
            })
          );
        }
      });

      setMatrix(newMatrix);
      setRotiDetail(result);

      if (savePromises.length > 0) {
        setSaving(true);
        await Promise.all(savePromises).finally(() => setSaving(false));
      }
    } catch (e) {
      setRotiError('Gagal mengambil data stok. Coba lagi.');
    } finally {
      setRotiLoading(false);
    }
  };

  const totalPerOutlet = outlets.map((outlet) => {
    const total = materials.reduce((sum, mat) => {
      const key = `${outlet.id}_${mat.id}`;
      return sum + (Number(matrix[key]) || 0);
    }, 0);
    return total;
  });

  const isReadOnly = session?.status && session.status !== 'draft';

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Memuat data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Input Order</h1>
          <p className="text-gray-500 text-sm mt-0.5">Isi permintaan bahan baku per outlet</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {saving && <span className="text-xs text-gray-400 animate-pulse">Menyimpan...</span>}
          {session && (
            <span className={statusClass[session.status] || 'badge-draft'}>
              {statusLabel[session.status] || session.status}
            </span>
          )}
          <input
            type="date"
            value={orderDate}
            onChange={handleDateChange}
            disabled={isReadOnly}
            className="input w-auto text-sm"
          />
          <button
            onClick={handleCalculate}
            disabled={calculating || !session}
            className="btn-primary text-sm"
          >
            {calculating ? 'Memproses...' : '🧮 Hitung & Review →'}
          </button>
        </div>
      </div>

      {isReadOnly && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm">
          ⚠️ Sesi ini sudah dikirim. Tidak dapat mengedit lagi.
          <button
            onClick={() => navigate(`/order/${session.id}/review`)}
            className="ml-2 underline"
          >
            Lihat Review →
          </button>
        </div>
      )}

      {/* Matrix Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="text-sm border-collapse" style={{ minWidth: '600px' }}>
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-brand-red text-white px-4 py-3 text-left font-medium min-w-[180px] border-r border-red-700">
                  Bahan Baku
                </th>
                {outlets.map((outlet) => (
                  <th
                    key={outlet.id}
                    className="bg-brand-red text-white px-3 py-3 text-center font-medium min-w-[90px] border-r border-red-700 whitespace-nowrap"
                  >
                    {outlet.name}
                  </th>
                ))}
                <th className="bg-red-900 text-white px-3 py-3 text-center font-medium min-w-[80px]">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {materials.map((mat, matIdx) => {
                const rowTotal = outlets.reduce((sum, outlet) => {
                  const key = `${outlet.id}_${mat.id}`;
                  return sum + (Number(matrix[key]) || 0);
                }, 0);
                return (
                  <tr key={mat.id} className={matIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="sticky left-0 z-10 px-4 py-2 border-r border-gray-200 font-medium text-gray-800"
                      style={{ backgroundColor: matIdx % 2 === 0 ? '#ffffff' : '#f9fafb' }}>
                      <div className="text-xs text-gray-400 leading-none">{mat.code}</div>
                      <div className="leading-tight">{mat.name}</div>
                      <div className="text-xs text-brand-orange leading-none">{mat.purchase_unit}</div>
                      {mat.name.toLowerCase().includes('roti tawar') && !isReadOnly && (
                        <button
                          type="button"
                          onClick={handleRotiAutoFill}
                          disabled={rotiLoading}
                          className="mt-1 text-xs px-2 py-0.5 rounded border border-brand-red text-brand-red hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                        >
                          {rotiLoading ? 'Menghitung...' : '⚡ Hitung Otomatis'}
                        </button>
                      )}
                    </td>
                    {outlets.map((outlet) => {
                      const key = `${outlet.id}_${mat.id}`;
                      const val = matrix[key];
                      return (
                        <td key={outlet.id} className="px-2 py-1.5 text-center border-r border-gray-100">
                          <input
                            type="number"
                            min="0"
                            value={val === '' ? '' : (val || '')}
                            onChange={(e) => handleCellChange(outlet.id, mat.id, e.target.value)}
                            disabled={isReadOnly}
                            className="w-full text-center border border-gray-200 rounded-md px-1 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-red focus:border-brand-red disabled:bg-gray-100 disabled:text-gray-400"
                            placeholder="0"
                          />
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-center font-semibold text-brand-red bg-red-50">
                      {rowTotal > 0 ? rowTotal : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-orange-50 border-t-2 border-brand-orange">
                <td className="sticky left-0 px-4 py-3 font-semibold text-gray-700 border-r border-gray-200 bg-orange-50">
                  Total per Outlet
                </td>
                {totalPerOutlet.map((total, i) => (
                  <td key={i} className="px-3 py-3 text-center font-semibold text-brand-orange border-r border-gray-100">
                    {total > 0 ? total : <span className="text-gray-300">—</span>}
                  </td>
                ))}
                <td className="px-3 py-3 text-center font-bold text-brand-red">
                  {totalPerOutlet.reduce((a, b) => a + b, 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {rotiError && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          ⚠️ {rotiError}
        </div>
      )}

      {rotiDetail && (
        <div className="mt-3 card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-800 text-sm">Hasil Kalkulasi Roti Tawar</h3>
            <button
              type="button"
              onClick={() => setRotiDetail(null)}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none"
            >
              ×
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Total kebutuhan', value: rotiDetail.total_needed },
              { label: 'Order ke supplier', value: rotiDetail.optimal_order },
              { label: 'Bonus supplier', value: rotiDetail.bonus },
              { label: 'Terpenuhi', value: `${rotiDetail.fulfilled} ✓` },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-500 mb-1">{label}</div>
                <div className="font-bold text-gray-800">{value}</div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-1.5 pr-3 font-medium text-gray-500">Cabang</th>
                  <th className="text-right py-1.5 pr-3 font-medium text-gray-500">Stok Saat Ini</th>
                  <th className="text-right py-1.5 pr-3 font-medium text-gray-500">Min Stok</th>
                  <th className="text-right py-1.5 font-medium text-gray-500">Kebutuhan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rotiDetail.branches.map((b) => (
                  <tr key={b.inv_cabang_id}>
                    <td className="py-1.5 pr-3 text-gray-700">{b.display_name}</td>
                    <td className="py-1.5 pr-3 text-right text-gray-600">{b.current_stock}</td>
                    <td className="py-1.5 pr-3 text-right text-gray-600">{b.min_stock}</td>
                    <td className={`py-1.5 text-right font-semibold ${b.need > 0 ? 'text-brand-red' : 'text-gray-400'}`}>
                      {b.need}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Data stok per tanggal {rotiDetail.tanggal}. Nilai sudah diisi otomatis — Anda bisa mengubahnya secara manual.
          </p>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-3">
        * Kosongkan sel atau isi 0 untuk tidak memesan bahan tersebut dari outlet tersebut. Data tersimpan otomatis.
      </p>
    </div>
  );
}
