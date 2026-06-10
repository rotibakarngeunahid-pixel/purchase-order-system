import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import useModalDismiss from '../components/ui/useModalDismiss';
import api, {
  toInputDate,
  getLocalOperationalDate,
  getLocalOperationalTomorrow,
} from '../lib/api';
import { previewRotiOrder } from '../services/rotiTawarService';
import { checkHolidaysBulk, saveHolidayMetadataBulk } from '../services/holidayService';
import { buildRotiTawarLiveSummary, getMatrixKey } from '../lib/orderHelpers';
import OrderEntryHeader from '../components/order/OrderEntryHeader';
import OrderSummaryBar from '../components/order/OrderSummaryBar';
import OutletControlsPanel from '../components/order/OutletControlsPanel';
import OrderMatrixInput from '../components/order/OrderMatrixInput';
import OutletOrderInput from '../components/order/OutletOrderInput';
import MaterialOrderInput from '../components/order/MaterialOrderInput';
import RotiTawarPanel from '../components/order/RotiTawarPanel';
import OrderItemsSidebar from '../components/order/OrderItemsSidebar';
import RekomendasiPanel from '../components/order/RekomendasiPanel';

const STATUS_LABEL = { draft: 'Draft', sent: 'Terkirim', completed: 'Selesai' };
const STATUS_CLASS = { draft: 'badge-draft', sent: 'badge-sent', completed: 'badge-completed' };

const INPUT_MODES = [
  { id: 'per-outlet', label: 'Per Outlet' },
  { id: 'matrix', label: 'Matrix' },
  { id: 'per-bahan', label: 'Per Bahan' },
];

export default function OrderEntry() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialSessionId = searchParams.get('sessionId');

  // --- State ---
  const [orderDate, setOrderDate] = useState(toInputDate());
  const [rotiReferenceDate, setRotiReferenceDate] = useState(getLocalOperationalDate());
  const [session, setSession] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [matrix, setMatrix] = useState({});
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  const [saveError, setSaveError] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [rotiLoading, setRotiLoading] = useState(false);
  const [rotiError, setRotiError] = useState(null);
  const [rotiDetail, setRotiDetail] = useState(null);
  const [rotiStockMap, setRotiStockMap] = useState({});
  const [outletOpen, setOutletOpen] = useState({});
  const [outletDays, setOutletDays] = useState({});
  // Holiday state
  // holidayMap: { [outlet_id]: { date1_holiday, date2_holiday, calculation_days } } — hanya outlet yang ada libur
  const [holidayMap, setHolidayMap] = useState({});
  const [outletOverride, setOutletOverride] = useState({}); // { [outlet_id]: true/false }
  const [pendingOverrideOutletId, setPendingOverrideOutletId] = useState(null); // untuk confirmation modal
  const [inputMode, setInputMode] = useState('per-outlet');
  // Index outlet yang sedang dipilih di mode per-outlet (lifted state agar sidebar bisa sync)
  const [selectedOutletIdx, setSelectedOutletIdx] = useState(0);
  // Roti distribution modal state
  const [showRotiDistModal, setShowRotiDistModal] = useState(false);
  const [rotiDistQtys, setRotiDistQtys] = useState({});
  const [rekAddedIds, setRekAddedIds] = useState(new Set());

  // Refs for use inside async callbacks
  const saveTimers = useRef({});
  const pendingValues = useRef({});
  const savedTimer = useRef(null);
  const sessionRef = useRef(null);
  const orderDateRef = useRef(orderDate);
  sessionRef.current = session;
  orderDateRef.current = orderDate;

  // --- Holiday helpers ---
  // holidayMap format: { [outlet_id]: { date1_holiday, calculation_days } }
  // overrideSnapshot: pass {} saat tanggal berubah (override di-reset), undefined pakai state saat ini
  const applyHolidayMap = (map, activeOutlets, overrideSnapshot) => {
    const override = overrideSnapshot ?? outletOverride;
    setHolidayMap(map);
    setOutletDays((prev) => {
      const next = { ...prev };
      (activeOutlets || []).forEach((o) => {
        const info = map[o.id]; // { calculation_days: 0|1, ... } atau undefined
        const isOverridden = override[o.id];
        if (!isOverridden) {
          // calculation_days: 0 jika H+1 libur, 1 jika H+1 buka (default)
          next[o.id] = info != null ? info.calculation_days : 1;
        }
      });
      return next;
    });
  };

  const checkHolidays = async (date, activeOutlets, overrideSnapshot) => {
    try {
      const result = await checkHolidaysBulk(date);
      applyHolidayMap(result.holidays || {}, activeOutlets, overrideSnapshot);
    } catch {
      // Jika holiday check gagal, fallback ke default 1 hari
    }
  };

  // --- Effects ---
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

  // --- Helpers ---
  const showSaved = () => {
    setSaveStatus('saved');
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaveStatus('idle'), 2000);
  };

  // --- Data loaders ---
  async function loadMasterData() {
    try {
      const [matRes, outRes] = await Promise.all([
        api.get('/api/materials'),
        api.get('/api/outlets'),
      ]);
      setMaterials(matRes.data.filter((m) => m.is_active));
      const activeOutlets = outRes.data.filter((o) => o.is_active);
      setOutlets(activeOutlets);
      const openMap = {};
      const daysMap = {};
      activeOutlets.forEach((o) => {
        openMap[o.id] = true;
        daysMap[o.id] = 1;
      });
      setOutletOpen(openMap);
      setOutletDays(daysMap);
      // Cek holiday berdasarkan tanggal order saat ini
      await checkHolidays(orderDateRef.current, activeOutlets);
    } catch (err) {
      console.error('loadMasterData error:', err);
    }
  }

  async function loadSession(sessionId) {
    setLoading(true);
    try {
      const res = await api.get(`/api/orders/session/${sessionId}`);
      applySession(res.data);
    } catch (err) {
      console.error('loadSession error:', err);
    } finally {
      setLoading(false);
    }
  }

  function applySession(data) {
    setSession(data);
    setOrderDate(data.order_date);
    const m = {};
    (data.items || []).forEach((item) => {
      m[getMatrixKey(item.outlet_id, item.material_id)] = item.qty;
    });
    setMatrix(m);
  }

  const getOrCreateSession = async (date) => {
    const res = await api.post('/api/orders/session', { order_date: date });
    setSession(res.data);
    return res.data;
  };

  // --- Handlers ---
  const handleDateChange = async (e) => {
    const date = e.target.value;
    const operationalToday = getLocalOperationalDate();
    const newRefDate = date > operationalToday ? operationalToday : date;

    setOrderDate(date);
    setRotiReferenceDate(newRefDate);
    setRotiDetail(null);
    setRotiError(null);
    setRotiStockMap({});
    setMatrix({});
    // Reset override saat tanggal berubah (BR-016: override per transaksi)
    setOutletOverride({});

    // Clear any pending saves for the old session
    Object.keys(saveTimers.current).forEach((k) => {
      clearTimeout(saveTimers.current[k]);
      delete saveTimers.current[k];
    });
    pendingValues.current = {};

    setLoading(true);
    try {
      const [sessionRes] = await Promise.all([
        api.post('/api/orders/session', { order_date: date }),
        // Kirim {} sebagai override karena saat tanggal berubah, semua override di-reset
        checkHolidays(date, outlets, {}),
      ]);
      const fullRes = await api.get(`/api/orders/session/${sessionRes.data.id}`);
      applySession(fullRes.data);
    } catch (err) {
      console.error('handleDateChange error:', err);
      setSaveStatus('error');
      setSaveError('Gagal memuat sesi untuk tanggal tersebut. Coba pilih ulang tanggal.');
    } finally {
      setLoading(false);
    }
  };

  const handleTomorrowClick = () => {
    handleDateChange({ target: { value: getLocalOperationalTomorrow() } });
  };

  const handleCellChange = (outletId, materialId, value) => {
    const key = getMatrixKey(outletId, materialId);
    // Reject negative values
    const raw = value === '' ? '' : Number(value);
    const qty = raw !== '' && raw < 0 ? 0 : raw;
    setMatrix((prev) => ({ ...prev, [key]: qty }));
    pendingValues.current[key] = { outletId, materialId, qty: qty === '' ? 0 : qty || 0 };

    if (saveTimers.current[key]) clearTimeout(saveTimers.current[key]);
    saveTimers.current[key] = setTimeout(async () => {
      delete saveTimers.current[key];
      const currentSession = sessionRef.current;
      let sess = currentSession;
      if (!sess) {
        try {
          sess = await getOrCreateSession(orderDateRef.current);
        } catch (err) {
          setSaveStatus('error');
          setSaveError('Gagal membuat sesi. Coba lagi.');
          return;
        }
      }
      if (sess.status !== 'draft') return;
      const pending = pendingValues.current[key];
      if (!pending) return;
      delete pendingValues.current[key];
      try {
        setSaveStatus('saving');
        await api.post(`/api/orders/session/${sess.id}/request`, {
          outlet_id: pending.outletId,
          material_id: pending.materialId,
          qty: pending.qty,
        });
        showSaved();
      } catch (err) {
        setSaveStatus('error');
        setSaveError('Gagal menyimpan. Coba ketik ulang atau refresh halaman.');
      }
    }, 600);
  };

  const flushPendingSaves = async (sess) => {
    const keysToFlush = Object.keys(saveTimers.current);
    keysToFlush.forEach((k) => {
      clearTimeout(saveTimers.current[k]);
      delete saveTimers.current[k];
    });
    if (!sess || sess.status !== 'draft') return;
    const promises = keysToFlush
      .map((key) => {
        const p = pendingValues.current[key];
        if (!p) return null;
        delete pendingValues.current[key];
        return api.post(`/api/orders/session/${sess.id}/request`, {
          outlet_id: p.outletId,
          material_id: p.materialId,
          qty: p.qty,
        });
      })
      .filter(Boolean);
    if (promises.length > 0) {
      await Promise.all(promises);
    }
  };

  const handleCalculate = async () => {
    setCalculating(true);
    try {
      let sess = sessionRef.current;
      if (!sess) {
        sess = await getOrCreateSession(orderDateRef.current);
      }
      await flushPendingSaves(sess);
      navigate(`/order/${sess.id}/review`);
    } finally {
      setCalculating(false);
    }
  };

  const handleRotiAutoFill = async () => {
    // Hanya block jika sesi sudah dikirim/selesai; izinkan jika sesi belum ada (null = draft baru)
    if (session && session.status !== 'draft') return;
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
      const result = await previewRotiOrder({
        orderDate,
        referenceDate: rotiReferenceDate,
      });

      const newMatrix = { ...matrix };
      const pendingSaves = []; // kumpulkan dulu, baru save setelah session dipastikan ada
      const stockMap = {};

      result.branches.forEach((branch) => {
        const outlet = outlets.find(
          (o) => o.name.toLowerCase() === branch.display_name.toLowerCase()
        );
        if (!outlet) return;

        const key = getMatrixKey(outlet.id, rotiMaterial.id);
        const isOpen = outletOpen[outlet.id] !== false;
        const days = outletDays[outlet.id] ?? 1;
        // days 0 = H+1 libur, 1 = H+1 buka (default)
        const qty = !isOpen || days === 0 ? 0 : branch.need;

        newMatrix[key] = qty;
        stockMap[outlet.id] = {
          current_stock: branch.current_stock,
          min_stock: branch.min_stock,
        };

        // Cancel any pending save for this key
        if (saveTimers.current[key]) {
          clearTimeout(saveTimers.current[key]);
          delete saveTimers.current[key];
        }
        delete pendingValues.current[key];

        pendingSaves.push({ outletId: outlet.id, materialId: rotiMaterial.id, qty });
      });

      setMatrix(newMatrix);
      setRotiDetail(result);
      setRotiStockMap(stockMap);

      if (pendingSaves.length > 0) {
        setSaveStatus('saving');
        try {
          // Buat session jika belum ada (user langsung klik Hitung Otomatis tanpa input apapun)
          let sess = sessionRef.current;
          if (!sess) {
            sess = await getOrCreateSession(orderDateRef.current);
          }
          if (sess.status === 'draft') {
            await Promise.all(
              pendingSaves.map((s) =>
                api.post(`/api/orders/session/${sess.id}/request`, {
                  outlet_id: s.outletId,
                  material_id: s.materialId,
                  qty: s.qty,
                })
              )
            );
            showSaved();
          }
        } catch (err) {
          setSaveStatus('error');
          setSaveError('Gagal menyimpan hasil kalkulasi Roti Tawar.');
        }
      }

      // Simpan metadata holiday per outlet per sesi
      const currentSess = sessionRef.current;
      if (currentSess?.id) {
        const metaRecords = outlets.map((o) => {
          const info = holidayMap[o.id] || null;
          const isOverridden = outletOverride[o.id] || false;
          const calcDays = outletDays[o.id] ?? 1;
          const primaryHol = info?.date1_holiday || null;
          return {
            outlet_id: o.id,
            holiday_detected: !!info,
            override_holiday: isOverridden,
            calculation_days: calcDays,
            holiday_date_detected: primaryHol?.holiday_date || null,
            holiday_name_detected: primaryHol?.holiday_name || null,
            holiday_id_detected: primaryHol?.id || null,
          };
        });
        try {
          await saveHolidayMetadataBulk(currentSess.id, metaRecords);
        } catch {
          // Metadata save failure tidak blokir alur utama
        }
      }
    } catch (e) {
      const msg = e.response?.data?.error;
      setRotiError(msg || 'Gagal mengambil data stok. Coba lagi.');
    } finally {
      setRotiLoading(false);
    }
  };

  const handleAddRekToOrder = (materialId, rekomendasiId) => {
    // Tambahkan qty=1 ke outlet aktif pertama (atau pertahankan jika sudah lebih besar)
    const activeOutlet = outlets.find((o) => outletOpen[o.id] !== false);
    if (!activeOutlet) return;
    const key = getMatrixKey(activeOutlet.id, materialId);
    const currentQty = Number(matrix[key]) || 0;
    const newQty = Math.max(currentQty, 1);
    handleCellChange(activeOutlet.id, materialId, newQty);
    setRekAddedIds((prev) => new Set([...prev, rekomendasiId]));
  };

  const handleToggleOpen = (id) =>
    setOutletOpen((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleToggleDays = (id) =>
    setOutletDays((prev) => ({ ...prev, [id]: prev[id] === 0 ? 1 : 0 }));

  // Override: tampilkan confirmation modal
  const handleRequestOverride = (outletId) => {
    setPendingOverrideOutletId(outletId);
  };

  // Override dikonfirmasi: set override aktif, hitung 1 hari meski libur
  const handleConfirmOverride = () => {
    const id = pendingOverrideOutletId;
    if (!id) return;
    setOutletOverride((prev) => ({ ...prev, [id]: true }));
    setOutletDays((prev) => ({ ...prev, [id]: 1 }));
    setPendingOverrideOutletId(null);
  };

  // Batalkan override: kembali ke calculation_days dari server
  const handleCancelOverride = (outletId) => {
    const autoCalcDays = holidayMap[outletId]?.calculation_days ?? 1;
    setOutletOverride((prev) => ({ ...prev, [outletId]: false }));
    setOutletDays((prev) => ({ ...prev, [outletId]: autoCalcDays }));
  };

  // Handler distribusi roti tambahan (fase order)
  const handleRotiDistribute = async () => {
    const rotiMaterial = materials.find((m) => m.name.toLowerCase().includes('roti tawar'));
    if (!rotiMaterial) {
      setRotiError('Material "Roti Tawar" tidak ditemukan di master data.');
      return;
    }
    setRotiDistQtys({});
    setShowRotiDistModal(true);
  };

  const handleRotiDistConfirm = async (perOutletQtys) => {
    const rotiMaterial = materials.find((m) => m.name.toLowerCase().includes('roti tawar'));
    if (!rotiMaterial) return;

    const newMatrix = { ...matrix };
    const pendingSaves = [];

    Object.entries(perOutletQtys).forEach(([outletId, extraQty]) => {
      const qty = Number(extraQty) || 0;
      if (qty <= 0) return;
      const key = getMatrixKey(outletId, rotiMaterial.id);
      newMatrix[key] = (Number(newMatrix[key]) || 0) + qty;
      pendingSaves.push({ outletId, materialId: rotiMaterial.id, qty: newMatrix[key] });
    });

    setMatrix(newMatrix);
    setShowRotiDistModal(false);
    setRotiDistQtys({});

    if (pendingSaves.length > 0 && (!session || session.status === 'draft')) {
      setSaveStatus('saving');
      try {
        let sess = sessionRef.current;
        if (!sess) {
          sess = await getOrCreateSession(orderDateRef.current);
        }
        if (sess.status === 'draft') {
          await Promise.all(
            pendingSaves.map((s) =>
              api.post(`/api/orders/session/${sess.id}/request`, {
                outlet_id: s.outletId,
                material_id: s.materialId,
                qty: s.qty,
              })
            )
          );
          showSaved();
        }
      } catch {
        setSaveStatus('error');
        setSaveError('Gagal menyimpan distribusi roti.');
      }
    }
  };

  // Escape + kunci scroll untuk modal distribusi roti & override hari libur
  const closeRotiDistModal = useCallback(() => {
    setShowRotiDistModal(false);
    setRotiDistQtys({});
  }, []);
  useModalDismiss(closeRotiDistModal, { active: showRotiDistModal });
  const closeOverrideModal = useCallback(() => setPendingOverrideOutletId(null), []);
  useModalDismiss(closeOverrideModal, { active: !!pendingOverrideOutletId });

  // --- Derived ---
  const isReadOnly = !!(session?.status && session.status !== 'draft');
  const rotiLiveSummary = useMemo(
    () => buildRotiTawarLiveSummary({ materials, outlets, matrix, rotiDetail }),
    [materials, outlets, matrix, rotiDetail]
  );

  // --- Loading screen ---
  // Full-screen hanya untuk muat pertama; saat ganti tanggal cukup overlay tipis
  // agar halaman tidak "berkedip" kosong.
  if (loading && outlets.length === 0) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Memuat data...</p>
        </div>
      </div>
    );
  }

  // Shared props for all input mode components
  const inputSharedProps = {
    materials,
    outlets,
    matrix,
    onCellChange: handleCellChange,
    outletOpen,
    isReadOnly,
    rotiStockMap,
  };

  // Shared props for sidebar panels
  const outletControlProps = {
    outlets,
    outletOpen,
    outletDays,
    onToggleOpen: handleToggleOpen,
    onToggleDays: handleToggleDays,
    materials,
    matrix,
    isReadOnly,
    holidayMap,
    outletOverride,
    onRequestOverride: handleRequestOverride,
    onCancelOverride: handleCancelOverride,
  };

  const rotiPanelProps = {
    rotiLoading,
    rotiError,
    rotiDetail,
    rotiLiveSummary,
    onRotiAutoFill: handleRotiAutoFill,
    onRotiDist: isReadOnly ? undefined : handleRotiDistribute,
    onDismissDetail: () => setRotiDetail(null),
    rotiReferenceDate,
    onRefDateChange: setRotiReferenceDate,
    isReadOnly,
  };

  return (
    <div className="page-shell-wide">
      {/* Overlay saat memuat sesi (ganti tanggal) — halaman tetap terlihat */}
      {loading && (
        <div className="fixed inset-0 z-40 bg-white/60 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-lg border border-gray-100 px-5 py-4 flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-brand-red border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-600">Memuat sesi...</span>
          </div>
        </div>
      )}

      {/* Modal distribusi roti tambahan */}
      {showRotiDistModal && (() => {
        const rotiMaterial = materials.find((m) => m.name.toLowerCase().includes('roti tawar'));
        const totalDist = Object.values(rotiDistQtys).reduce((s, q) => s + (Number(q) || 0), 0);
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={closeRotiDistModal}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-semibold text-gray-900 mb-1">Distribusi Roti Tambahan</h3>
              <p className="text-xs text-gray-400 mb-4">
                Masukkan jumlah roti tambahan per cabang. Nilai akan ditambahkan ke order saat ini.
              </p>
              <div className="space-y-2 mb-4">
                {outlets.filter((o) => outletOpen[o.id] !== false).map((outlet) => {
                  const key = rotiMaterial ? getMatrixKey(outlet.id, rotiMaterial.id) : null;
                  const current = key ? (Number(matrix[key]) || 0) : 0;
                  return (
                    <div key={outlet.id} className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="text-sm text-gray-700">{outlet.name}</div>
                        {current > 0 && (
                          <div className="text-xs text-gray-400">Sudah: {current} roti</div>
                        )}
                      </div>
                      <input
                        type="number"
                        min="0"
                        value={rotiDistQtys[outlet.id] || ''}
                        onChange={(e) =>
                          setRotiDistQtys((prev) => ({ ...prev, [outlet.id]: e.target.value }))
                        }
                        className="w-20 text-center border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-red"
                        placeholder="0"
                      />
                    </div>
                  );
                })}
              </div>
              {totalDist > 0 && (
                <div className="mb-4 text-sm font-semibold text-brand-red">
                  Total tambahan: {totalDist} roti
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setShowRotiDistModal(false); setRotiDistQtys({}); }}
                  className="btn-outline text-sm"
                >
                  Batal
                </button>
                <button
                  onClick={() => handleRotiDistConfirm(rotiDistQtys)}
                  disabled={totalDist === 0}
                  className="btn-primary text-sm"
                >
                  Terapkan
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Header */}
      <OrderEntryHeader
        orderDate={orderDate}
        onDateChange={handleDateChange}
        onTomorrowClick={handleTomorrowClick}
        isReadOnly={isReadOnly}
        session={session}
        statusLabel={STATUS_LABEL}
        statusClass={STATUS_CLASS}
        saveStatus={saveStatus}
        saveError={saveError}
        calculating={calculating}
        onReview={handleCalculate}
      />

      {/* Read-only banner */}
      {isReadOnly && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm flex items-center justify-between gap-2">
          <span>
            Sesi ini sudah <strong>{STATUS_LABEL[session.status] || session.status}</strong>.
            Tidak dapat mengedit.
          </span>
          <button
            onClick={() => navigate(`/order/${session.id}/review`)}
            className="underline font-medium whitespace-nowrap"
          >
            Lihat Review
          </button>
        </div>
      )}

      {/* Save error banner */}
      {saveStatus === 'error' && saveError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center justify-between gap-2">
          <span>{saveError}</span>
          <button
            onClick={() => { setSaveStatus('idle'); setSaveError(null); }}
            className="underline font-medium whitespace-nowrap"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Summary bar */}
      <OrderSummaryBar
        outlets={outlets}
        materials={materials}
        matrix={matrix}
        outletOpen={outletOpen}
      />

      {/* Input mode tabs */}
      <div className="segmented-tabs">
        {INPUT_MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            onClick={() => setInputMode(mode.id)}
            className={`segmented-tab ${inputMode === mode.id ? 'segmented-tab-active' : ''}`}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {/* Main layout: 2-col on desktop */}
      <div className="flex gap-4 items-start">
        {/* Left: input area */}
        <div className="flex-1 min-w-0">
          {inputMode === 'matrix' && <OrderMatrixInput {...inputSharedProps} />}
          {inputMode === 'per-outlet' && (
            <OutletOrderInput
              {...inputSharedProps}
              outletDays={outletDays}
              onToggleOpen={handleToggleOpen}
              onToggleDays={handleToggleDays}
              holidayMap={holidayMap}
              outletOverride={outletOverride}
              onRequestOverride={handleRequestOverride}
              onCancelOverride={handleCancelOverride}
              selectedOutletIdx={selectedOutletIdx}
              onSelectOutletIdx={setSelectedOutletIdx}
            />
          )}
          {inputMode === 'per-bahan' && (
            <MaterialOrderInput
              {...inputSharedProps}
              rotiLoading={rotiLoading}
              onRotiAutoFill={handleRotiAutoFill}
            />
          )}
        </div>

        {/* Right sidebar — desktop only */}
        <div className="w-72 flex-shrink-0 hidden lg:flex flex-col gap-4">
          {/* Sidebar per-outlet: tampilkan ringkasan bahan per cabang yang sedang dipilih */}
          {inputMode === 'per-outlet' && (
            <OrderItemsSidebar
              outlet={outlets[Math.min(selectedOutletIdx, outlets.length - 1)] || null}
              materials={materials}
              matrix={matrix}
            />
          )}
          {/* Mode matrix/per-bahan: tampilkan OutletControlsPanel (OutletControls sudah di panel kiri di per-outlet) */}
          {inputMode !== 'per-outlet' && <OutletControlsPanel {...outletControlProps} />}
          <RekomendasiPanel
            materials={materials}
            onAddToOrder={handleAddRekToOrder}
            addedIds={rekAddedIds}
          />
          <RotiTawarPanel {...rotiPanelProps} />
        </div>
      </div>

      {/* Mobile/tablet: panels below input */}
      <div className="lg:hidden mt-4 flex flex-col gap-4">
        {inputMode === 'per-outlet' && (
          <OrderItemsSidebar
            outlet={outlets[Math.min(selectedOutletIdx, outlets.length - 1)] || null}
            materials={materials}
            matrix={matrix}
          />
        )}
        {inputMode !== 'per-outlet' && <OutletControlsPanel {...outletControlProps} />}
        <RekomendasiPanel
          materials={materials}
          onAddToOrder={handleAddRekToOrder}
          addedIds={rekAddedIds}
        />
        <RotiTawarPanel {...rotiPanelProps} />
      </div>

      <p className="text-xs text-gray-400 mt-4">
        * Kosongkan atau isi 0 untuk tidak memesan bahan tersebut. Data tersimpan otomatis.
      </p>

      {/* Override Confirmation Modal */}
      {pendingOverrideOutletId && (() => {
        const outlet = outlets.find((o) => o.id === pendingOverrideOutletId);
        const info = holidayMap[pendingOverrideOutletId];
        const fmtDate = (h) => {
          if (!h) return null;
          if (h.recurrence_type === 'weekly') return null; // hari berulang tidak perlu tanggal spesifik
          return new Date(`${h.holiday_date}T00:00:00`).toLocaleDateString('id-ID', {
            day: 'numeric', month: 'long', year: 'numeric',
          });
        };
        const holidays = [info?.date1_holiday].filter(Boolean);
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={closeOverrideModal}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-semibold text-gray-800 text-lg mb-2">Override Hari Libur?</h3>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 text-sm space-y-1.5">
                <p className="font-medium text-yellow-800">{outlet?.name}</p>
                {holidays.map((h, i) => (
                  <div key={i} className="text-yellow-700">
                    {h.recurrence_type === 'weekly'
                      ? `Setiap ${['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'][h.day_of_week]}${h.holiday_name ? ` — ${h.holiday_name}` : ''}`
                      : `${fmtDate(h)}${h.holiday_name ? ` — ${h.holiday_name}` : ''}`
                    }
                  </div>
                ))}
              </div>
              <p className="text-sm text-gray-600 mb-1">Dengan mengaktifkan override:</p>
              <ul className="text-sm text-gray-600 list-disc list-inside mb-4 space-y-0.5">
                <li>Order roti cabang ini dihitung untuk <strong>1 hari</strong>.</li>
                <li>Data kalender hari libur <strong>tidak berubah</strong>.</li>
                <li>Override hanya berlaku untuk order ini.</li>
              </ul>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setPendingOverrideOutletId(null)} className="btn-outline text-sm">
                  Batal
                </button>
                <button onClick={handleConfirmOverride} className="btn-primary text-sm">
                  Ya, Override 1 Hari
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
