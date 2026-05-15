import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api, {
  toInputDate,
  getLocalOperationalDate,
  getLocalOperationalTomorrow,
} from '../lib/api';
import { previewRotiOrder } from '../services/rotiTawarService';
import { getMatrixKey } from '../lib/orderHelpers';
import OrderEntryHeader from '../components/order/OrderEntryHeader';
import OrderSummaryBar from '../components/order/OrderSummaryBar';
import OutletControlsPanel from '../components/order/OutletControlsPanel';
import OrderMatrixInput from '../components/order/OrderMatrixInput';
import OutletOrderInput from '../components/order/OutletOrderInput';
import MaterialOrderInput from '../components/order/MaterialOrderInput';
import RotiTawarPanel from '../components/order/RotiTawarPanel';

const STATUS_LABEL = { draft: 'Draft', sent: 'Terkirim', completed: 'Selesai' };
const STATUS_CLASS = { draft: 'badge-draft', sent: 'badge-sent', completed: 'badge-completed' };

const INPUT_MODES = [
  { id: 'matrix', label: 'Matrix' },
  { id: 'per-outlet', label: 'Per Outlet' },
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
  const [inputMode, setInputMode] = useState(
    () => (typeof window !== 'undefined' && window.innerWidth < 1024 ? 'per-outlet' : 'matrix')
  );

  // Refs for use inside async callbacks
  const saveTimers = useRef({});
  const pendingValues = useRef({});
  const savedTimer = useRef(null);
  const sessionRef = useRef(null);
  const orderDateRef = useRef(orderDate);
  sessionRef.current = session;
  orderDateRef.current = orderDate;

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
        daysMap[o.id] = 2;
      });
      setOutletOpen(openMap);
      setOutletDays(daysMap);
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

    // Clear any pending saves for the old session
    Object.keys(saveTimers.current).forEach((k) => {
      clearTimeout(saveTimers.current[k]);
      delete saveTimers.current[k];
    });
    pendingValues.current = {};

    setLoading(true);
    try {
      const res = await api.post('/api/orders/session', { order_date: date });
      const fullRes = await api.get(`/api/orders/session/${res.data.id}`);
      applySession(fullRes.data);
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
    if (session?.status !== 'draft') return;
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
      const savePromises = [];
      const stockMap = {};

      result.branches.forEach((branch) => {
        const outlet = outlets.find(
          (o) => o.name.toLowerCase() === branch.display_name.toLowerCase()
        );
        if (!outlet) return;

        const key = getMatrixKey(outlet.id, rotiMaterial.id);
        const isOpen = outletOpen[outlet.id] !== false;
        const days = outletDays[outlet.id] ?? 2;
        const qty = !isOpen ? 0 : days === 1 ? Math.ceil(branch.need / 2) : branch.need;

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

        if (session && session.status === 'draft') {
          savePromises.push(
            api.post(`/api/orders/session/${session.id}/request`, {
              outlet_id: outlet.id,
              material_id: rotiMaterial.id,
              qty,
            })
          );
        }
      });

      setMatrix(newMatrix);
      setRotiDetail(result);
      setRotiStockMap(stockMap);

      if (savePromises.length > 0) {
        setSaveStatus('saving');
        try {
          await Promise.all(savePromises);
          showSaved();
        } catch (err) {
          setSaveStatus('error');
          setSaveError('Gagal menyimpan hasil kalkulasi Roti Tawar.');
        }
      }
    } catch (e) {
      const msg = e.response?.data?.error;
      setRotiError(msg || 'Gagal mengambil data stok. Coba lagi.');
    } finally {
      setRotiLoading(false);
    }
  };

  const handleToggleOpen = (id) =>
    setOutletOpen((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleToggleDays = (id) =>
    setOutletDays((prev) => ({ ...prev, [id]: prev[id] === 1 ? 2 : 1 }));

  // --- Derived ---
  const isReadOnly = !!(session?.status && session.status !== 'draft');

  // --- Loading screen ---
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
  };

  const rotiPanelProps = {
    rotiLoading,
    rotiError,
    rotiDetail,
    onRotiAutoFill: handleRotiAutoFill,
    onDismissDetail: () => setRotiDetail(null),
    rotiReferenceDate,
    onRefDateChange: setRotiReferenceDate,
    isReadOnly,
  };

  return (
    <div className="page-shell-wide">
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
          <OutletControlsPanel {...outletControlProps} />
          <RotiTawarPanel {...rotiPanelProps} />
        </div>
      </div>

      {/* Mobile/tablet: panels below input */}
      <div className="lg:hidden mt-4 flex flex-col gap-4">
        <OutletControlsPanel {...outletControlProps} />
        <RotiTawarPanel {...rotiPanelProps} />
      </div>

      <p className="text-xs text-gray-400 mt-4">
        * Kosongkan atau isi 0 untuk tidak memesan bahan tersebut. Data tersimpan otomatis.
      </p>
    </div>
  );
}
