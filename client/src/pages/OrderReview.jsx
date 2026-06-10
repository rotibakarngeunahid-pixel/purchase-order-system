import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { formatRupiah, formatDateID } from '../lib/api';
import Toast from '../components/ui/Toast';
import useToast from '../components/ui/useToast';
import {
  createSupplierOrderImageBlob,
  getSupplierOrderImageFilename,
} from '../lib/orderImage';

function POCard({ po }) {
  return (
    <div className="card overflow-hidden mb-4">
      <div className="bg-brand-red px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-white font-semibold text-base">{po.supplier.name}</h3>
          <p className="text-red-200 text-xs mt-0.5">WA: {po.supplier.wa_number}</p>
        </div>
        <div className="text-right">
          <p className="text-red-200 text-xs">Est. Total</p>
          <p className="text-white font-bold text-lg">{formatRupiah(po.total_estimated)}</p>
        </div>
      </div>
      <div className="table-wrap">
        <table className="data-table table-fixed" style={{ minWidth: '760px' }}>
          <colgroup>
            <col style={{ width: '30%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '12%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Bahan</th>
              <th>Merk</th>
              <th className="center-cell">Qty</th>
              <th className="center-cell">Satuan</th>
              <th className="center-cell">Kemasan</th>
              <th className="num-cell">Harga/Sat</th>
              <th className="num-cell">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {po.items.map((item, i) => (
              <tr key={i}>
                <td>
                  <div className="font-medium text-gray-800">{item.material_name}</div>
                  {item.roti_tawar_bonus && (
                    <div className="mt-1 text-xs bg-orange-50 border border-orange-200 rounded px-2 py-1 inline-flex items-center gap-2 text-orange-700">
                      <span>Dibutuhkan: <strong>{item.roti_tawar_bonus.total_needed}</strong></span>
                      <span className="text-orange-300">|</span>
                      <span>Order ke supplier: <strong>{item.qty_ordered}</strong></span>
                      <span className="text-orange-300">|</span>
                      <span>Bonus: <strong>+{item.roti_tawar_bonus.bonus}</strong></span>
                      <span className="text-orange-300">|</span>
                      <span>Total diterima: <strong>{item.roti_tawar_bonus.fulfilled}</strong></span>
                    </div>
                  )}
                </td>
                <td className="text-gray-600 text-sm">
                  {item.material_brand || <span className="text-gray-300">-</span>}
                </td>
                <td className="center-cell font-semibold text-brand-red">{item.qty_ordered}</td>
                <td className="center-cell text-gray-600">{item.purchase_unit}</td>
                <td className="center-cell text-gray-500 text-xs">
                  {item.package_qty > 1 ? `${item.package_qty} ${item.package_unit}` : '—'}
                </td>
                <td className="num-cell text-gray-600">{formatRupiah(item.price_per_purchase_unit)}</td>
                <td className="num-cell font-medium text-gray-800">{formatRupiah(item.subtotal_estimated)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-orange-50 border-t border-orange-100">
              <td colSpan={6} className="px-4 py-2.5 text-right font-semibold text-gray-700">
                Total Estimasi:
              </td>
              <td className="num-cell font-bold text-brand-red text-base">
                {formatRupiah(po.total_estimated)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function OrderImagePanel({ images, generatingImages, onGenerateImages }) {
  return (
    <div className="card p-4 mb-5 border-green-200 bg-green-50">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="font-semibold text-gray-800">Gambar Order Supplier</p>
          <p className="text-sm text-gray-500">
            Satu file PNG untuk setiap supplier, siap dikirim manual via WhatsApp.
          </p>
        </div>
        <button
          type="button"
          onClick={onGenerateImages}
          disabled={generatingImages}
          className="btn-outline text-sm bg-white"
        >
          {generatingImages ? 'Membuat gambar...' : images.length > 0 ? 'Generate Ulang' : 'Generate Gambar'}
        </button>
      </div>

      {images.length > 0 && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {images.map((image) => (
            <a
              key={image.fileName}
              href={image.url}
              download={image.fileName}
              className="flex items-center justify-between gap-3 rounded-lg border border-green-200 bg-white px-3 py-2 text-sm hover:border-green-400 transition-colors"
            >
              <span className="min-w-0">
                <span className="block font-medium text-gray-800 truncate">{image.supplierName}</span>
                <span className="block text-xs text-gray-400 truncate">{image.fileName}</span>
              </span>
              <span className="flex-shrink-0 font-semibold text-brand-red">Unduh</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrderReview() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [pos, setPos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [generatingImages, setGeneratingImages] = useState(false);
  const [orderImages, setOrderImages] = useState([]);
  const imageUrlsRef = useRef([]);
  const [settings, setSettings] = useState({
    business_name: 'Roti Bakar Ngeunah',
    wa_greeting_text: '',
  });
  const { toast, showToast, hideToast } = useToast(5000);

  useEffect(() => {
    loadData();
  }, [sessionId]);

  useEffect(() => () => {
    imageUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [sessionRes, calcRes, settingsRes] = await Promise.all([
        api.get(`/api/orders/session/${sessionId}`),
        api.post(`/api/orders/session/${sessionId}/calculate`),
        api.get('/api/settings').catch(() => ({ data: settings })),
      ]);
      setSession(sessionRes.data);
      setPos(calcRes.data.pos || []);
      setSettings((prev) => ({ ...prev, ...(settingsRes.data || {}) }));
    } catch (err) {
      console.error(err);
      showToast('Gagal memuat data: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setLoading(false);
    }
  }

  function replaceOrderImages(nextImages) {
    imageUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    imageUrlsRef.current = nextImages.map((image) => image.url);
    setOrderImages(nextImages);
  }

  const generateOrderImages = async (sourcePos = pos, sourceSession = session, sourceSettings = settings) => {
    if (!sourcePos.length || !sourceSession?.order_date) return;
    setGeneratingImages(true);
    try {
      const images = [];
      for (const po of sourcePos) {
        const blob = await createSupplierOrderImageBlob({
          po,
          orderDate: sourceSession.order_date,
          businessName: sourceSettings.business_name || 'Roti Bakar Ngeunah',
          greetingText: sourceSettings.wa_greeting_text || '',
        });
        const url = URL.createObjectURL(blob);
        images.push({
          url,
          fileName: getSupplierOrderImageFilename(po, sourceSession.order_date),
          supplierName: po.supplier?.name || 'Supplier',
        });
      }
      replaceOrderImages(images);
      showToast(`${images.length} gambar order siap diunduh.`);
    } catch (err) {
      showToast('Gagal membuat gambar: ' + err.message, 'error');
    } finally {
      setGeneratingImages(false);
    }
  };

  const handleSubmitOrder = async () => {
    if (session?.status !== 'draft') {
      showToast('Sesi ini sudah disubmit sebelumnya.', 'error');
      return;
    }
    setSending(true);
    try {
      const res = await api.post(`/api/orders/session/${sessionId}/send-wa`);
      const submittedPos = res.data.purchase_orders || pos;
      const nextSettings = {
        ...settings,
        business_name: res.data.business_name || settings.business_name,
        wa_greeting_text: res.data.wa_greeting_text || settings.wa_greeting_text,
      };
      setSettings(nextSettings);
      setPos(submittedPos);
      setSession((prev) => ({ ...prev, status: 'sent' }));
      showToast(res.data.message || 'PO berhasil dibuat. Gambar order siap diunduh.');
      await generateOrderImages(submittedPos, { ...session, status: 'sent' }, nextSettings);
    } catch (err) {
      showToast('Gagal submit order: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setSending(false);
    }
  };

  const grandTotal = pos.reduce((sum, po) => sum + (po.total_estimated || 0), 0);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Menghitung order...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <Toast toast={toast} onClose={hideToast} />

      {/* Header */}
      <div className="page-header">
        <button onClick={() => navigate(`/order?sessionId=${sessionId}`)} className="btn-outline text-sm">
          Kembali
        </button>
        <div className="flex-1">
          <h1 className="page-title">Review Order</h1>
          <p className="page-subtitle">
            {session && formatDateID(session.order_date)}
            {session?.status && session.status !== 'draft' && (
              <span className="ml-2 badge-sent">Sudah Submit</span>
            )}
          </p>
        </div>
      </div>

      {pos.length === 0 ? (
        <div className="card p-10 text-center text-gray-400">
          <p className="font-medium">Tidak ada item untuk dipesan</p>
          <p className="text-sm mt-1">Kembali ke input order dan isi qty untuk bahan yang dibutuhkan</p>
          <button onClick={() => navigate(`/order?sessionId=${sessionId}`)} className="btn-primary text-sm mt-4">
            Kembali ke Input
          </button>
        </div>
      ) : (
        <>
          {/* Summary bar */}
          <div className="card p-4 mb-5 flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-6 flex-wrap">
              <div>
                <p className="text-xs text-gray-500">Jumlah Supplier</p>
                <p className="font-bold text-xl text-gray-800">{pos.length}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Grand Total Estimasi</p>
                <p className="font-bold text-xl text-brand-red">{formatRupiah(grandTotal)}</p>
              </div>
            </div>
            {session?.status === 'draft' ? (
              <button
                onClick={handleSubmitOrder}
                disabled={sending}
                className="btn-primary"
              >
                {sending ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Membuat PO...
                  </span>
                ) : (
                  'Submit & Generate Gambar'
                )}
              </button>
            ) : (
              <div className="flex items-center gap-2 text-green-600 font-medium text-sm">
                PO sudah dibuat
                <button onClick={() => navigate('/purchase')} className="btn-outline text-xs ml-2">
                  Catat Penerimaan
                </button>
              </div>
            )}
          </div>

          {(session?.status !== 'draft' || orderImages.length > 0) && (
            <OrderImagePanel
              images={orderImages}
              generatingImages={generatingImages}
              onGenerateImages={() => generateOrderImages()}
            />
          )}

          {/* PO Cards per supplier */}
          {pos.map((po, i) => (
            <POCard key={i} po={po} />
          ))}

          {/* Grand total footer */}
          <div className="card p-4 mt-2 flex items-center justify-between gap-3 bg-red-50 flex-wrap">
            <span className="font-semibold text-gray-700">Grand Total Semua Supplier</span>
            <span className="font-bold text-xl text-brand-red">{formatRupiah(grandTotal)}</span>
          </div>
        </>
      )}
    </div>
  );
}
