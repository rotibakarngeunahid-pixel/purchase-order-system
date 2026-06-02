import { useEffect, useState } from 'react';
import api, { formatRupiah, formatDateID } from '../lib/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveItemSupplierId(item, defaultSupplierId = '') {
  return (
    item.supplier_id ||
    item.item_supplier?.id ||
    item.variant?.supplier_id ||
    item.material?.supplier_id ||
    defaultSupplierId ||
    ''
  );
}

function buildInitialOrderedItems(poItems, defaultSupplierId = '') {
  return (poItems || [])
    .filter((item) => (item.source || 'ordered') === 'ordered')
    .map((item) => ({
      ...item,
      qty_received: item.qty_received ?? item.qty_ordered,
      price_actual:
        item.price_actual ??
        item.variant?.price_per_purchase_unit ??
        item.material?.price_per_purchase_unit ??
        0,
      variant_id: item.variant_id ?? null,
      supplier_id: resolveItemSupplierId(item, defaultSupplierId),
    }));
}

function buildInitialAdjustmentItems(poItems, defaultSupplierId = '') {
  return (poItems || [])
    .filter((item) => item.source === 'adjustment')
    .map((item) => ({
      ...item,
      qty_received: item.qty_received ?? 0,
      price_actual: item.price_actual ?? 0,
      variant_id: item.variant_id ?? null,
      supplier_id: resolveItemSupplierId(item, defaultSupplierId),
      adjustment_note: item.adjustment_note ?? '',
      _tempId: item.id,
    }));
}

function newAdjustmentRow(defaultSupplierId = '') {
  return {
    id: null,
    material_id: '',
    variant_id: null,
    supplier_id: defaultSupplierId,
    qty_received: '',
    price_actual: '',
    adjustment_note: '',
    _tempId: `new-${Date.now()}-${Math.random()}`,
  };
}

// ─── QuickAddVariantModal ─────────────────────────────────────────────────────

function QuickAddVariantModal({ materialId, materialName, defaultSupplierId, suppliers, onSaved, onCancel }) {
  const [brand, setBrand] = useState('');
  const [price, setPrice] = useState('');
  const [supplierId, setSupplierId] = useState(defaultSupplierId || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!brand.trim()) return setError('Nama merk wajib diisi');
    setSaving(true);
    setError('');
    try {
      const res = await api.post(`/api/materials/${materialId}/variants`, {
        brand: brand.trim(),
        supplier_id: supplierId || null,
        price_per_purchase_unit: Number(price) || 0,
      });
      onSaved(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="font-semibold text-gray-900 mb-1">Tambah Merk Baru</h3>
        <p className="text-sm text-gray-500 mb-4">Untuk bahan: <strong>{materialName}</strong></p>
        {error && (
          <div className="mb-3 p-2 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>
        )}
        <div className="space-y-3">
          <div>
            <label className="label">
              Nama Merk <span className="text-red-500">*</span>
            </label>
            <input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="input"
              placeholder="Contoh: Indofood"
              autoFocus
            />
          </div>
          <div>
            <label className="label">Harga per Satuan Beli (Rp)</label>
            <input
              type="number"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="input"
              placeholder="0"
            />
          </div>
          <div>
            <label className="label">Supplier</label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="input"
            >
              <option value="">— Tidak dipilih —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onCancel} className="btn-outline text-sm">Batal</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
            {saving ? 'Menyimpan...' : 'Simpan Merk'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── QuickAddMaterialModal ────────────────────────────────────────────────────

function QuickAddMaterialModal({ defaultSupplierId, suppliers, onSaved, onCancel }) {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const [form, setForm] = useState({
    code: `ADJ-${today}-001`,
    name: '',
    brand: '',
    supplier_id: defaultSupplierId || '',
    package_qty: '1',
    package_unit: 'Pcs',
    purchase_unit: 'Pcs',
    price_per_purchase_unit: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    if (!form.code || !form.name || !form.package_qty || !form.package_unit || !form.purchase_unit) {
      return setError('Kode, nama, isi kemasan, satuan kemasan, dan satuan beli wajib diisi');
    }
    setSaving(true);
    setError('');
    try {
      const res = await api.post('/api/materials', {
        code: form.code.trim(),
        name: form.name.trim(),
        brand: form.brand.trim() || undefined,
        supplier_id: form.supplier_id || null,
        package_qty: Number(form.package_qty) || 1,
        package_unit: form.package_unit.trim(),
        purchase_unit: form.purchase_unit.trim(),
        price_per_purchase_unit: Number(form.price_per_purchase_unit) || 0,
      });
      onSaved(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="font-semibold text-gray-900 mb-4">Tambah Bahan Baru</h3>
        {error && (
          <div className="mb-3 p-2 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>
        )}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">
                Kode Bahan <span className="text-red-500">*</span>
              </label>
              <input
                value={form.code}
                onChange={(e) => set('code', e.target.value)}
                className="input"
                placeholder="ADJ-YYYYMMDD-001"
                autoFocus
              />
            </div>
            <div>
              <label className="label">
                Nama Bahan <span className="text-red-500">*</span>
              </label>
              <input
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                className="input"
                placeholder="Contoh: Selai Coklat"
              />
            </div>
          </div>
          <div>
            <label className="label">Merk Default (opsional)</label>
            <input
              value={form.brand}
              onChange={(e) => set('brand', e.target.value)}
              className="input"
              placeholder="Contoh: Indofood"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">
                Isi Kemasan <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0.01"
                value={form.package_qty}
                onChange={(e) => set('package_qty', e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label">
                Satuan Kemasan <span className="text-red-500">*</span>
              </label>
              <input
                value={form.package_unit}
                onChange={(e) => set('package_unit', e.target.value)}
                className="input"
                placeholder="Kg"
              />
            </div>
            <div>
              <label className="label">
                Satuan Beli <span className="text-red-500">*</span>
              </label>
              <input
                value={form.purchase_unit}
                onChange={(e) => set('purchase_unit', e.target.value)}
                className="input"
                placeholder="Kg"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Harga per Satuan Beli (Rp)</label>
              <input
                type="number"
                min="0"
                value={form.price_per_purchase_unit}
                onChange={(e) => set('price_per_purchase_unit', e.target.value)}
                className="input"
                placeholder="0"
              />
            </div>
            <div>
              <label className="label">Supplier</label>
              <select
                value={form.supplier_id}
                onChange={(e) => set('supplier_id', e.target.value)}
                className="input"
              >
                <option value="">— Tidak dipilih —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onCancel} className="btn-outline text-sm">Batal</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
            {saving ? 'Menyimpan...' : 'Simpan Bahan'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ReceiveModal ─────────────────────────────────────────────────────────────

function ReceiveModal({ po, onClose, onSaved }) {
  const defaultSupplierId = po.supplier_id || po.supplier?.id || '';
  const [orderedItems, setOrderedItems] = useState(() => buildInitialOrderedItems(po.items, defaultSupplierId));
  const [adjustmentItems, setAdjustmentItems] = useState(() => buildInitialAdjustmentItems(po.items, defaultSupplierId));
  const [deletedAdjustmentItemIds, setDeletedAdjustmentItemIds] = useState([]);
  const [notes, setNotes] = useState(po.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [rowErrors, setRowErrors] = useState({});
  const [variantsMap, setVariantsMap] = useState({});
  const [materials, setMaterials] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [quickAddVariantFor, setQuickAddVariantFor] = useState(null);
  const [quickAddMaterialForRowId, setQuickAddMaterialForRowId] = useState(null);
  const [outlets, setOutlets] = useState([]);
  // branchDistributions: { [po_item_id | _tempId]: { [outlet_id]: qty_string } }
  // Digunakan untuk ORDERED items (keyed by po_item_id) dan ADJ items (keyed by _tempId/id)
  const [branchDistributions, setBranchDistributions] = useState(() => {
    const map = {};
    (po.items || [])
      .filter((item) => item.branch_distributions?.length > 0)
      .forEach((item) => {
        map[item.id] = {};
        (item.branch_distributions || []).forEach((d) => {
          map[item.id][d.outlet_id] = String(d.qty);
        });
      });
    return map;
  });
  // Data order per outlet per material dari sesi order awal (untuk auto-populate distribusi)
  const [sessionOrders, setSessionOrders] = useState({});

  // Load master data
  useEffect(() => {
    Promise.all([
      api.get('/api/materials').then((r) => r.data.filter((m) => m.is_active)),
      api.get('/api/suppliers').then((r) => r.data || []),
      api.get('/api/outlets').then((r) => r.data.filter((o) => o.is_active)),
    ])
      .then(([mats, sups, outs]) => {
        setMaterials(mats);
        setSuppliers(sups);
        setOutlets(outs);
      })
      .catch(console.error);
  }, []);

  // Load data order per outlet dari sesi awal untuk auto-populate distribusi semua bahan
  useEffect(() => {
    const sessionId = po.session?.id;
    if (!sessionId) return;
    api.get(`/api/orders/session/${sessionId}`)
      .then((res) => {
        // Buat map: material_id → { outlet_id: qty } untuk semua bahan
        const byMaterial = {};
        (res.data.items || []).forEach((item) => {
          if (!item.material_id || !item.outlet_id || !Number(item.qty)) return;
          if (!byMaterial[item.material_id]) byMaterial[item.material_id] = {};
          byMaterial[item.material_id][item.outlet_id] = Number(item.qty);
        });
        setSessionOrders(byMaterial);
      })
      .catch(() => {}); // non-fatal
  }, [po.session?.id]);

  // Auto-populate branchDistributions dari data order sesi untuk semua ordered items
  // Hanya mengisi jika belum ada distribusi tersimpan sebelumnya
  useEffect(() => {
    if (Object.keys(sessionOrders).length === 0) return;
    setBranchDistributions((prev) => {
      let changed = false;
      const next = { ...prev };
      (po.items || [])
        .filter((item) => (item.source || 'ordered') === 'ordered')
        .forEach((item) => {
          const existingDist = next[item.id];
          const hasExisting =
            existingDist && Object.values(existingDist).some((v) => Number(v) > 0);
          if (hasExisting) return; // jangan timpa data yang sudah tersimpan
          const orderMap = sessionOrders[item.material_id];
          if (!orderMap || Object.keys(orderMap).length === 0) return;
          next[item.id] = Object.fromEntries(
            Object.entries(orderMap).map(([outletId, qty]) => [outletId, String(qty)])
          );
          changed = true;
        });
      return changed ? next : prev;
    });
  }, [sessionOrders, po.items]);

  // Load variants untuk semua bahan di PO (ordered + adjustment existing)
  useEffect(() => {
    const materialIds = [...new Set((po.items || []).map((i) => i.material_id).filter(Boolean))];
    if (materialIds.length === 0) return;
    Promise.all(
      materialIds.map((mid) =>
        api.get(`/api/materials/${mid}/variants`).then((r) => ({ mid, variants: r.data || [] }))
      )
    )
      .then((results) => {
        const map = {};
        results.forEach(({ mid, variants }) => {
          map[mid] = variants.filter((v) => v.is_active);
        });
        setVariantsMap(map);
      })
      .catch(console.error);
  }, [po.id]);

  const loadVariantsForMaterial = async (materialId) => {
    if (variantsMap[materialId] !== undefined) return;
    try {
      const res = await api.get(`/api/materials/${materialId}/variants`);
      setVariantsMap((prev) => ({
        ...prev,
        [materialId]: (res.data || []).filter((v) => v.is_active),
      }));
    } catch (e) {
      console.error(e);
    }
  };

  // ── Ordered items ──

  const updateOrdered = (idx, field, value) => {
    setOrderedItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const handleSelectOrderedVariant = (idx, variantId) => {
    const item = orderedItems[idx];
    const variants = variantsMap[item.material_id] || [];
    const chosen = variants.find((v) => v.id === variantId);
    setOrderedItems((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        variant_id: variantId || null,
        supplier_id:
          chosen?.supplier_id ||
          item.supplier_id ||
          item.material?.supplier_id ||
          defaultSupplierId,
        price_actual: chosen
          ? chosen.price_per_purchase_unit
          : item.material?.price_per_purchase_unit ?? 0,
      };
      return next;
    });
  };

  // ── Adjustment items ──

  const addAdjustmentRow = () => {
    setAdjustmentItems((prev) => [...prev, newAdjustmentRow(defaultSupplierId)]);
  };

  const updateBranchDist = (itemId, outletId, qty) => {
    setBranchDistributions((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || {}), [outletId]: qty },
    }));
  };

  const removeAdjustmentRow = (tempId) => {
    const item = adjustmentItems.find((i) => i._tempId === tempId);
    if (item?.id) {
      setDeletedAdjustmentItemIds((prev) => [...prev, item.id]);
    }
    setAdjustmentItems((prev) => prev.filter((i) => i._tempId !== tempId));
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[tempId];
      return next;
    });
  };

  const updateAdjustment = (tempId, field, value) => {
    setAdjustmentItems((prev) =>
      prev.map((item) => (item._tempId === tempId ? { ...item, [field]: value } : item))
    );
    if (rowErrors[tempId]) {
      setRowErrors((prev) => {
        const next = { ...prev };
        delete next[tempId];
        return next;
      });
    }
  };

  const checkDuplicateWarning = (tempId, materialId, variantId) => {
    if (!materialId) return;
    const isDuplicate = orderedItems.some(
      (oi) =>
        oi.material_id === materialId &&
        (oi.variant_id || null) === (variantId || null)
    );
    if (isDuplicate) {
      setRowErrors((prev) => ({
        ...prev,
        [tempId]:
          'Bahan ini sudah ada di Item PO. Pertimbangkan untuk menaikkan qty diterima pada baris existing.',
      }));
    }
  };

  const handleSelectAdjustmentMaterial = async (tempId, materialId) => {
    if (materialId === '__add_new__') {
      setQuickAddMaterialForRowId(tempId);
      return;
    }
    const material = materials.find((m) => m.id === materialId);
    const currentItem = adjustmentItems.find((item) => item._tempId === tempId);
    const nextSupplierId = material?.supplier_id || currentItem?.supplier_id || defaultSupplierId;
    setAdjustmentItems((prev) =>
      prev.map((item) =>
        item._tempId === tempId
          ? {
              ...item,
              material_id: materialId,
              variant_id: null,
              supplier_id: nextSupplierId,
              price_actual: material?.price_per_purchase_unit ?? '',
            }
          : item
      )
    );
    if (materialId) await loadVariantsForMaterial(materialId);

    // Reset error lama dan cek baru
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[tempId];
      return next;
    });
    checkDuplicateWarning(tempId, materialId, null);
  };

  const handleSelectAdjustmentVariant = (tempId, variantId, materialId) => {
    if (variantId === '__add_new__') {
      const material = materials.find((m) => m.id === materialId);
      const row = adjustmentItems.find((item) => item._tempId === tempId);
      setQuickAddVariantFor({
        materialId,
        materialName: material?.name || '',
        rowTempId: tempId,
        defaultSupplierId: row?.supplier_id || material?.supplier_id || defaultSupplierId,
      });
      return;
    }
    const variants = variantsMap[materialId] || [];
    const chosen = variants.find((v) => v.id === variantId);
    const material = materials.find((m) => m.id === materialId);
    setAdjustmentItems((prev) =>
      prev.map((item) =>
        item._tempId === tempId
          ? {
              ...item,
              variant_id: variantId || null,
              supplier_id:
                chosen?.supplier_id ||
                item.supplier_id ||
                material?.supplier_id ||
                defaultSupplierId,
              price_actual: chosen
                ? chosen.price_per_purchase_unit
                : material?.price_per_purchase_unit ?? '',
            }
          : item
      )
    );
    checkDuplicateWarning(tempId, materialId, variantId);
  };

  // ── Quick add handlers ──

  const handleVariantSaved = async (newVariant) => {
    const { rowTempId } = quickAddVariantFor;
    const materialId = newVariant.material_id;
    try {
      const res = await api.get(`/api/materials/${materialId}/variants`);
      const activeVariants = (res.data || []).filter((v) => v.is_active);
      setVariantsMap((prev) => ({ ...prev, [materialId]: activeVariants }));
      setAdjustmentItems((prev) =>
        prev.map((item) =>
          item._tempId === rowTempId
            ? {
                ...item,
                variant_id: newVariant.id,
                supplier_id: newVariant.supplier_id || item.supplier_id || defaultSupplierId,
                price_actual: newVariant.price_per_purchase_unit ?? item.price_actual,
              }
            : item
        )
      );
    } catch (e) {
      console.error(e);
    }
    setQuickAddVariantFor(null);
  };

  const handleMaterialSaved = async (newMaterial) => {
    const rowTempId = quickAddMaterialForRowId;
    try {
      const res = await api.get('/api/materials');
      setMaterials((res.data || []).filter((m) => m.is_active));
      setVariantsMap((prev) => ({ ...prev, [newMaterial.id]: [] }));
      setAdjustmentItems((prev) =>
        prev.map((item) =>
          item._tempId === rowTempId
            ? {
                ...item,
                material_id: newMaterial.id,
                variant_id: null,
                supplier_id: newMaterial.supplier_id || item.supplier_id || defaultSupplierId,
                price_actual: newMaterial.price_per_purchase_unit ?? '',
              }
            : item
        )
      );
    } catch (e) {
      console.error(e);
    }
    setQuickAddMaterialForRowId(null);
  };

  // ── Derived values ──

  const orderedActualTotal = orderedItems.reduce(
    (sum, item) => sum + Number(item.qty_received || 0) * Number(item.price_actual || 0),
    0
  );
  const adjustmentTotal = adjustmentItems.reduce(
    (sum, item) => sum + Number(item.qty_received || 0) * Number(item.price_actual || 0),
    0
  );
  const totalActual = orderedActualTotal + adjustmentTotal;

  // ── Actions ──

  const handleResetForm = () => {
    setOrderedItems(buildInitialOrderedItems(po.items, defaultSupplierId));
    setAdjustmentItems(buildInitialAdjustmentItems(po.items, defaultSupplierId));
    setDeletedAdjustmentItemIds([]);
    setNotes(po.notes || '');
    setError('');
    setRowErrors({});
    // Reset branchDistributions: kembali ke data tersimpan + re-apply auto-populate dari sesi
    setBranchDistributions(() => {
      const base = {};
      (po.items || [])
        .filter((item) => item.branch_distributions?.length > 0)
        .forEach((item) => {
          base[item.id] = {};
          (item.branch_distributions || []).forEach((d) => {
            base[item.id][d.outlet_id] = String(d.qty);
          });
        });
      // Terapkan auto-populate dari sesi untuk semua ordered items tanpa distribusi tersimpan
      (po.items || [])
        .filter((item) => (item.source || 'ordered') === 'ordered')
        .forEach((item) => {
          const hasExisting = base[item.id] &&
            Object.values(base[item.id]).some((v) => Number(v) > 0);
          if (hasExisting) return;
          const orderMap = sessionOrders[item.material_id];
          if (!orderMap || Object.keys(orderMap).length === 0) return;
          base[item.id] = Object.fromEntries(
            Object.entries(orderMap).map(([outletId, qty]) => [outletId, String(qty)])
          );
        });
      return base;
    });
  };

  const handleSave = async () => {
    if (orderedItems.some((item) => !item.supplier_id)) {
      setError('Pilih supplier untuk semua item PO');
      return;
    }

    // Validasi baris adjustment
    const errors = {};
    let hasErrors = false;
    for (const adj of adjustmentItems) {
      if (!adj.material_id) {
        errors[adj._tempId] = 'Pilih bahan terlebih dahulu';
        hasErrors = true;
      } else if (!adj.qty_received || Number(adj.qty_received) <= 0) {
        errors[adj._tempId] = 'Qty diterima harus lebih dari 0';
        hasErrors = true;
      } else if (!adj.supplier_id) {
        errors[adj._tempId] = 'Pilih supplier terlebih dahulu';
        hasErrors = true;
      }
    }
    if (hasErrors) {
      setRowErrors(errors);
      return;
    }

    // Peringatan harga 0
    const adjZeroPrice = adjustmentItems.filter((adj) => !Number(adj.price_actual));
    if (adjZeroPrice.length > 0) {
      const ok = window.confirm(
        `${adjZeroPrice.length} item tambahan memiliki harga Rp 0. Lanjutkan menyimpan?`
      );
      if (!ok) return;
    }

    setSaving(true);
    setError('');
    try {
      // Bangun array distribusi cabang untuk ordered items dan adj items yang sudah punya ID
      const branch_distributions = [];
      orderedItems.forEach((item) => {
        const distMap = branchDistributions[item.id] || {};
        Object.entries(distMap).forEach(([outletId, qty]) => {
          branch_distributions.push({
            po_item_id: item.id,
            outlet_id: outletId,
            qty: Number(qty) || 0,
          });
        });
      });
      // Adj items yang sudah punya ID real (bukan baru) juga masuk branch_distributions biasa
      adjustmentItems.filter((adj) => adj.id).forEach((item) => {
        const distMap = branchDistributions[item.id] || {};
        Object.entries(distMap).forEach(([outletId, qty]) => {
          branch_distributions.push({
            po_item_id: item.id,
            outlet_id: outletId,
            qty: Number(qty) || 0,
          });
        });
      });

      const res = await api.put(`/api/purchase/${po.id}/receive`, {
        items: [
          ...orderedItems.map((item) => ({
            id: item.id,
            source: 'ordered',
            qty_received: Number(item.qty_received || 0),
            price_actual: Number(item.price_actual || 0),
            variant_id: item.variant_id || null,
            supplier_id: item.supplier_id || null,
          })),
          ...adjustmentItems.map((item) => {
            // Item adjustment baru (belum punya ID) → kirim inline_branch_distributions
            const inlineDist = !item.id
              ? Object.entries(branchDistributions[item._tempId] || {})
                  .filter(([, qty]) => Number(qty) > 0)
                  .map(([outletId, qty]) => ({ outlet_id: outletId, qty: Number(qty) || 0 }))
              : undefined;
            return {
              ...(item.id ? { id: item.id } : {}),
              source: 'adjustment',
              material_id: item.material_id,
              variant_id: item.variant_id || null,
              supplier_id: item.supplier_id || null,
              qty_received: Number(item.qty_received || 0),
              price_actual: Number(item.price_actual || 0),
              adjustment_note: item.adjustment_note || null,
              ...(inlineDist !== undefined ? { inline_branch_distributions: inlineDist } : {}),
            };
          }),
        ],
        deleted_adjustment_item_ids: deletedAdjustmentItemIds,
        notes,
        branch_distributions,
      });

      // Periksa hasil sinkronisasi stok POS
      const posSync = res.data?.pos_sync;
      let syncWarning = '';
      if (posSync && !posSync.ok) {
        syncWarning = `Penerimaan tersimpan, tapi sinkronisasi stok POS gagal: ${posSync.error || 'Error tidak diketahui'}. Buka Admin → Sync PO → Stok untuk retry.`;
      } else if (posSync?.result?.summary) {
        const { errors = 0, skipped = 0 } = posSync.result.summary;
        const needsAction = errors + skipped;
        if (needsAction > 0) {
          const needsMappingItems = (posSync.result?.results || [])
            .filter((r) => r.status === 'butuh_mapping_admin')
            .map((r) => r.error?.match(/Bahan '([^']+)'/)?.[1])
            .filter(Boolean);
          const noOutletItems = (posSync.result?.results || [])
            .filter((r) => r.status === 'butuh_alokasi_cabang')
            .length;
          const parts = [];
          if (needsMappingItems.length > 0)
            parts.push(`${needsMappingItems.length} bahan perlu pemetaan di Admin (${needsMappingItems.join(', ')})`);
          if (noOutletItems > 0)
            parts.push(`${noOutletItems} item tidak punya alokasi cabang`);
          syncWarning = `Penerimaan disimpan. ${parts.join('; ')}. Buka Admin → Sync PO → Stok untuk konfigurasi.`;
        }
      }

      onSaved(syncWarning);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  const poSupplier = po.supplier;
  const activeSupplierOptions = suppliers.filter((s) => s.is_active);
  const getSupplierOptions = (selectedId) => {
    if (!selectedId || activeSupplierOptions.some((s) => s.id === selectedId)) {
      return activeSupplierOptions;
    }
    const selected = suppliers.find((s) => s.id === selectedId);
    return selected ? [selected, ...activeSupplierOptions] : activeSupplierOptions;
  };
  const quickAddMaterialSupplierId =
    adjustmentItems.find((item) => item._tempId === quickAddMaterialForRowId)?.supplier_id ||
    defaultSupplierId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      {/* Quick add modals */}
      {quickAddVariantFor && (
        <QuickAddVariantModal
          materialId={quickAddVariantFor.materialId}
          materialName={quickAddVariantFor.materialName}
          defaultSupplierId={quickAddVariantFor.defaultSupplierId || defaultSupplierId}
          suppliers={getSupplierOptions(quickAddVariantFor.defaultSupplierId)}
          onSaved={handleVariantSaved}
          onCancel={() => setQuickAddVariantFor(null)}
        />
      )}
      {quickAddMaterialForRowId && (
        <QuickAddMaterialModal
          defaultSupplierId={quickAddMaterialSupplierId}
          suppliers={getSupplierOptions(quickAddMaterialSupplierId)}
          onSaved={handleMaterialSaved}
          onCancel={() => setQuickAddMaterialForRowId(null)}
        />
      )}

      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-brand-red px-6 py-4 flex items-center justify-between flex-shrink-0 rounded-t-2xl">
          <div>
            <h3 className="text-white font-semibold text-lg">Catat Penerimaan</h3>
            <p className="text-red-200 text-sm">PO awal: {poSupplier?.name}</p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-red-200 text-2xl leading-none w-8 h-8 flex items-center justify-center"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* ── Item PO ── */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Item PO</h4>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="px-3 py-2 text-left text-gray-600 font-medium">Bahan</th>
                    <th className="px-3 py-2 text-left text-gray-600 font-medium min-w-[220px]">Merk</th>
                    <th className="px-3 py-2 text-left text-gray-600 font-medium min-w-[190px]">Supplier</th>
                    <th className="px-3 py-2 text-center text-gray-600 font-medium">Dipesan</th>
                    <th className="px-3 py-2 text-center text-gray-600 font-medium">Diterima</th>
                    <th className="px-3 py-2 text-center text-gray-600 font-medium">Harga/Sat (Rp)</th>
                    <th className="px-3 py-2 text-right text-gray-600 font-medium">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {orderedItems.map((item, idx) => {
                    const hasGap =
                      Number(item.qty_received ?? item.qty_ordered) < Number(item.qty_ordered);
                    const variants = variantsMap[item.material_id] || [];
                    return (
                      <tr key={item.id} className={hasGap ? 'bg-orange-50' : 'hover:bg-gray-50'}>
                        <td className="px-3 py-2.5 font-medium text-gray-800">
                          {item.material?.name}
                          <span className="text-xs text-gray-400 ml-1">
                            {item.material?.purchase_unit}
                          </span>
                          {hasGap && (
                            <span className="ml-2 text-xs text-orange-600 font-semibold">
                              Selisih
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {variants.length > 0 ? (
                            <select
                              value={item.variant_id || ''}
                              onChange={(e) => handleSelectOrderedVariant(idx, e.target.value)}
                              title={item.material?.brand || 'Default'}
                              className="border border-gray-300 rounded-md pl-2 pr-8 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-red w-full min-w-[200px] max-w-[240px]"
                            >
                              <option value="">
                                {item.material?.brand || 'Default'}
                              </option>
                              {variants.map((v) => (
                                <option key={v.id} value={v.id}>{v.brand}</option>
                              ))}
                            </select>
                          ) : (
                            <span
                              className="inline-block max-w-[220px] text-xs text-gray-500 leading-snug"
                              title={item.material?.brand || '-'}
                            >
                              {item.material?.brand || '-'}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <select
                            value={item.supplier_id || ''}
                            onChange={(e) => updateOrdered(idx, 'supplier_id', e.target.value)}
                            className="border border-gray-300 rounded-md pl-2 pr-8 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-red w-full min-w-[170px] max-w-[210px]"
                          >
                            <option value="">Pilih supplier</option>
                            {getSupplierOptions(item.supplier_id).map((supplier) => (
                              <option key={supplier.id} value={supplier.id}>
                                {supplier.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2.5 text-center text-gray-500">
                          {item.qty_ordered}
                        </td>
                        <td className="px-3 py-2.5">
                          <input
                            type="number"
                            min="0"
                            value={item.qty_received}
                            onChange={(e) => updateOrdered(idx, 'qty_received', e.target.value)}
                            className={`w-20 text-center border rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-red ${
                              hasGap ? 'border-orange-400 bg-orange-50' : 'border-gray-300'
                            }`}
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <input
                            type="number"
                            min="0"
                            value={item.price_actual}
                            onChange={(e) => updateOrdered(idx, 'price_actual', e.target.value)}
                            className="w-28 text-right border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-red"
                          />
                        </td>
                        <td className="px-3 py-2.5 text-right font-medium text-gray-800">
                          {formatRupiah(
                            Number(item.qty_received || 0) * Number(item.price_actual || 0)
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Distribusi Bahan ke Cabang (Ordered) ── */}
          {(() => {
            const itemsToDistribute = orderedItems.filter(
              (item) => Number(item.qty_received) > 0
            );
            if (itemsToDistribute.length === 0 || outlets.length === 0) return null;
            return (
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-1">
                  Distribusi Bahan ke Cabang
                </h4>
                <p className="text-xs text-gray-400 mb-3">
                  Tentukan berapa banyak setiap bahan yang diterima oleh masing-masing cabang. Auto-terisi dari order awal jika tersedia.
                </p>
                <div className="space-y-4">
                  {itemsToDistribute.map((item) => {
                    const distMap = branchDistributions[item.id] || {};
                    const totalDist = Object.values(distMap).reduce(
                      (s, q) => s + (Number(q) || 0), 0
                    );
                    const received = Number(item.qty_received) || 0;
                    const remaining = received - totalDist;
                    const isBalanced = remaining === 0;
                    const isOver = remaining < 0;
                    // Cek apakah distribusi ini auto-filled dari session order
                    const sessionOrderMap = sessionOrders[item.material_id];
                    const isAutoFilled = sessionOrderMap &&
                      !item.branch_distributions?.length &&
                      Object.keys(distMap).length > 0;
                    return (
                      <div key={item.id} className="border border-orange-200 rounded-xl p-4 bg-orange-50/50">
                        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-gray-800">
                              {item.material?.name}
                              <span className="text-xs text-gray-400 ml-1 font-normal">
                                ({item.material?.purchase_unit})
                              </span>
                            </span>
                            {isAutoFilled && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-green-100 text-green-700 border border-green-200">
                                Otomatis dari order
                              </span>
                            )}
                          </div>
                          <div className="text-xs">
                            <span className="text-gray-500">Diterima: </span>
                            <span className="font-semibold text-gray-700">{received}</span>
                            <span className="mx-2 text-gray-300">|</span>
                            <span className="text-gray-500">Terdistribusi: </span>
                            <span className={`font-semibold ${isBalanced ? 'text-green-600' : isOver ? 'text-red-600' : 'text-brand-orange'}`}>
                              {totalDist}
                            </span>
                            {!isBalanced && (
                              <span className={`ml-1 ${isOver ? 'text-red-600' : 'text-brand-orange'}`}>
                                ({isOver ? `melebihi ${Math.abs(remaining)}` : `sisa ${remaining}`})
                              </span>
                            )}
                            {isBalanced && totalDist > 0 && (
                              <span className="ml-1 text-green-600">✓</span>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
                          {outlets.map((outlet) => (
                            <div key={outlet.id} className="flex items-center gap-2">
                              <span className="text-xs text-gray-600 flex-1 truncate" title={outlet.name}>
                                {outlet.name}
                              </span>
                              <input
                                type="number"
                                min="0"
                                value={distMap[outlet.id] || ''}
                                onChange={(e) => updateBranchDist(item.id, outlet.id, e.target.value)}
                                className="w-16 text-center border border-gray-300 rounded-md px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-red bg-white"
                                placeholder="0"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* ── Distribusi Bahan Tambahan ke Cabang (Adjustment) ── */}
          {(() => {
            const adjItemsToDistribute = adjustmentItems.filter(
              (item) => item.material_id && Number(item.qty_received) > 0
            );
            if (adjItemsToDistribute.length === 0 || outlets.length === 0) return null;
            return (
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-1">
                  Distribusi Bahan Tambahan ke Cabang
                </h4>
                <p className="text-xs text-gray-400 mb-3">
                  Bahan tambahan di luar order awal — tentukan distribusi ke setiap cabang.
                </p>
                <div className="space-y-4">
                  {adjItemsToDistribute.map((item) => {
                    const key = item.id || item._tempId;
                    const mat = materials.find((m) => m.id === item.material_id);
                    const distMap = branchDistributions[key] || {};
                    const totalDist = Object.values(distMap).reduce(
                      (s, q) => s + (Number(q) || 0), 0
                    );
                    const received = Number(item.qty_received) || 0;
                    const remaining = received - totalDist;
                    const isBalanced = remaining === 0;
                    const isOver = remaining < 0;
                    return (
                      <div key={key} className="border border-blue-200 rounded-xl p-4 bg-blue-50/50">
                        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-800">
                              {mat?.name || '—'}
                              <span className="text-xs text-gray-400 ml-1 font-normal">
                                ({mat?.purchase_unit})
                              </span>
                            </span>
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-blue-100 text-blue-700 border border-blue-200">
                              Tambahan
                            </span>
                          </div>
                          <div className="text-xs">
                            <span className="text-gray-500">Qty Tambahan: </span>
                            <span className="font-semibold text-gray-700">{received}</span>
                            <span className="mx-2 text-gray-300">|</span>
                            <span className="text-gray-500">Terdistribusi: </span>
                            <span className={`font-semibold ${isBalanced ? 'text-green-600' : isOver ? 'text-red-600' : 'text-brand-orange'}`}>
                              {totalDist}
                            </span>
                            {!isBalanced && (
                              <span className={`ml-1 ${isOver ? 'text-red-600' : 'text-brand-orange'}`}>
                                ({isOver ? `melebihi ${Math.abs(remaining)}` : `sisa ${remaining}`})
                              </span>
                            )}
                            {isBalanced && totalDist > 0 && (
                              <span className="ml-1 text-green-600">✓</span>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
                          {outlets.map((outlet) => (
                            <div key={outlet.id} className="flex items-center gap-2">
                              <span className="text-xs text-gray-600 flex-1 truncate" title={outlet.name}>
                                {outlet.name}
                              </span>
                              <input
                                type="number"
                                min="0"
                                value={distMap[outlet.id] || ''}
                                onChange={(e) => updateBranchDist(key, outlet.id, e.target.value)}
                                className="w-16 text-center border border-gray-300 rounded-md px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-red bg-white"
                                placeholder="0"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* ── Adjustment / Tambahan ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-700">
                Tambahan
                {adjustmentItems.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    ({adjustmentItems.length} item)
                  </span>
                )}
              </h4>
              <button
                onClick={addAdjustmentRow}
                className="text-sm text-brand-red border border-brand-red rounded-lg px-3 py-1.5 hover:bg-red-50 font-medium transition-colors"
              >
                + Tambah Bahan
              </button>
            </div>

            {adjustmentItems.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm border border-dashed border-gray-200 rounded-lg">
                Belum ada bahan tambahan.{' '}
                <button
                  onClick={addAdjustmentRow}
                  className="text-brand-red hover:underline font-medium"
                >
                  + Tambah Bahan
                </button>{' '}
                untuk menambahkan bahan di luar PO.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1180px] text-sm">
                  <thead>
                    <tr className="bg-blue-50 border-b border-blue-100">
                      <th className="px-3 py-2 text-left text-gray-600 font-medium">Bahan</th>
                      <th className="px-3 py-2 text-left text-gray-600 font-medium min-w-[220px]">Merk</th>
                      <th className="px-3 py-2 text-left text-gray-600 font-medium min-w-[190px]">Supplier</th>
                      <th className="px-3 py-2 text-center text-gray-600 font-medium">Dipesan</th>
                      <th className="px-3 py-2 text-center text-gray-600 font-medium">Diterima</th>
                      <th className="px-3 py-2 text-center text-gray-600 font-medium">
                        Harga/Sat (Rp)
                      </th>
                      <th className="px-3 py-2 text-left text-gray-600 font-medium">Catatan</th>
                      <th className="px-3 py-2 text-right text-gray-600 font-medium">Subtotal</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-blue-50">
                    {adjustmentItems.map((adj) => {
                      const variants = variantsMap[adj.material_id] || [];
                      const mat = materials.find((m) => m.id === adj.material_id);
                      const rowError = rowErrors[adj._tempId];
                      const isWarning =
                        rowError &&
                        (rowError.startsWith('Bahan ini sudah') ||
                          rowError.startsWith('Peringatan'));
                      return (
                        <tr key={adj._tempId} className="bg-blue-50/40 hover:bg-blue-50">
                          <td className="px-3 py-2.5">
                            <select
                              value={adj.material_id}
                              onChange={(e) =>
                                handleSelectAdjustmentMaterial(adj._tempId, e.target.value)
                              }
                              className={`border rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-red w-44 ${
                                !adj.material_id && rowError && !isWarning
                                  ? 'border-red-400'
                                  : 'border-gray-300'
                              }`}
                            >
                              <option value="">— Pilih Bahan —</option>
                              <option value="__add_new__">+ Tambah Bahan Baru</option>
                              {materials.map((m) => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                              ))}
                            </select>
                            {mat && (
                              <div className="text-xs text-gray-400 mt-0.5">
                                {mat.purchase_unit}
                              </div>
                            )}
                            {rowError && (
                              <div
                                className={`text-xs mt-0.5 ${
                                  isWarning ? 'text-orange-600' : 'text-red-600'
                                }`}
                              >
                                {rowError}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            {adj.material_id ? (
                              <select
                                value={adj.variant_id || ''}
                                onChange={(e) =>
                                  handleSelectAdjustmentVariant(
                                    adj._tempId,
                                    e.target.value,
                                    adj.material_id
                                  )
                                }
                                title={mat?.brand || 'Tanpa merk'}
                                className="border border-gray-300 rounded-md pl-2 pr-8 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-red w-full min-w-[200px] max-w-[240px]"
                              >
                                <option value="">
                                  {mat?.brand || 'Tanpa merk'}
                                </option>
                                <option value="__add_new__">+ Tambah Merk Baru</option>
                                {variants.map((v) => (
                                  <option key={v.id} value={v.id}>{v.brand}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <select
                              value={adj.supplier_id || ''}
                              onChange={(e) =>
                                updateAdjustment(adj._tempId, 'supplier_id', e.target.value)
                              }
                              className={`border rounded-md pl-2 pr-8 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-red w-full min-w-[170px] max-w-[210px] ${
                                !adj.supplier_id && rowError && !isWarning
                                  ? 'border-red-400'
                                  : 'border-gray-300'
                              }`}
                            >
                              <option value="">Pilih supplier</option>
                              {getSupplierOptions(adj.supplier_id).map((supplier) => (
                                <option key={supplier.id} value={supplier.id}>
                                  {supplier.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                              Tambahan
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <input
                              type="number"
                              min="0"
                              value={adj.qty_received}
                              onChange={(e) =>
                                updateAdjustment(adj._tempId, 'qty_received', e.target.value)
                              }
                              className={`w-20 text-center border rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-red ${
                                adj.material_id &&
                                (!adj.qty_received || Number(adj.qty_received) <= 0) &&
                                rowError &&
                                !isWarning
                                  ? 'border-red-400'
                                  : 'border-gray-300'
                              }`}
                              placeholder="0"
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <input
                              type="number"
                              min="0"
                              value={adj.price_actual}
                              onChange={(e) =>
                                updateAdjustment(adj._tempId, 'price_actual', e.target.value)
                              }
                              className="w-28 text-right border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-red"
                              placeholder="0"
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <input
                              type="text"
                              value={adj.adjustment_note || ''}
                              onChange={(e) =>
                                updateAdjustment(adj._tempId, 'adjustment_note', e.target.value)
                              }
                              className="w-32 border border-gray-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-red"
                              placeholder="Opsional..."
                            />
                          </td>
                          <td className="px-3 py-2.5 text-right font-medium text-gray-800">
                            {formatRupiah(
                              Number(adj.qty_received || 0) * Number(adj.price_actual || 0)
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <button
                              onClick={() => removeAdjustmentRow(adj._tempId)}
                              title="Hapus baris"
                              className="text-gray-400 hover:text-red-500 text-xl leading-none w-6 h-6 flex items-center justify-center"
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Catatan PO */}
          <div>
            <label className="label">Catatan (opsional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="input resize-none"
              placeholder="Catatan penerimaan barang..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-between flex-shrink-0 flex-wrap gap-3">
          <div className="text-sm text-gray-500 space-y-0.5">
            <div>
              Est:{' '}
              <span className="font-medium text-gray-700">{formatRupiah(po.total_estimated)}</span>
            </div>
            <div>
              Item PO:{' '}
              <span className="font-medium text-gray-700">{formatRupiah(orderedActualTotal)}</span>
            </div>
            {adjustmentItems.length > 0 && (
              <div>
                Tambahan:{' '}
                <span className="font-medium text-blue-600">{formatRupiah(adjustmentTotal)}</span>
              </div>
            )}
            <div>
              Aktual:{' '}
              <span className="font-bold text-brand-red">{formatRupiah(totalActual)}</span>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleResetForm}
              title="Reset form ke nilai awal"
              className="px-3 py-2 rounded-lg text-sm font-medium text-gray-600 border border-gray-300 hover:bg-gray-50"
            >
              Reset Form
            </button>
            <button onClick={onClose} className="btn-outline text-sm">
              Batal
            </button>
            <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
              {saving ? 'Menyimpan...' : 'Simpan Penerimaan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PurchaseRecord (halaman utama) ──────────────────────────────────────────

export default function PurchaseRecord() {
  const [pos, setPos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPO, setSelectedPO] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [confirmReset, setConfirmReset] = useState(null);
  const [resetting, setResetting] = useState(false);
  const [openingPOId, setOpeningPOId] = useState(null);
  const [actionError, setActionError] = useState('');
  const [syncWarning, setSyncWarning] = useState('');

  useEffect(() => {
    loadPOs();
  }, [statusFilter]);

  async function loadPOs() {
    setLoading(true);
    try {
      const params = statusFilter ? `?status=${statusFilter}` : '';
      const res = await api.get(`/api/purchase${params}`);
      setPos(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const openModal = async (po) => {
    setOpeningPOId(po.id);
    setActionError('');
    try {
      const res = await api.get(`/api/purchase/${po.id}`);
      setSelectedPO(res.data);
    } catch (err) {
      console.error(err);
      setActionError(err.response?.data?.error || 'Gagal membuka detail PO');
    } finally {
      setOpeningPOId(null);
    }
  };

  const handleResetPO = async (po) => {
    setResetting(true);
    try {
      if (po.status === 'pending' || po.status === 'confirmed') {
        await api.delete(`/api/purchase/${po.id}`);
      } else {
        await api.put(`/api/purchase/${po.id}/reset`);
      }
      setConfirmReset(null);
      loadPOs();
    } catch (err) {
      alert(err.response?.data?.error || 'Gagal mereset PO');
    } finally {
      setResetting(false);
    }
  };

  const statusLabel = {
    pending: 'Pending',
    confirmed: 'Dikonfirmasi',
    received: 'Diterima',
    received_partial: 'Diterima Sebagian',
  };
  const statusClass = {
    pending: 'badge-pending',
    confirmed: 'badge-sent',
    received: 'badge-received',
    received_partial: 'badge-pending',
  };

  return (
    <div className="page-shell">
      {selectedPO && (
        <ReceiveModal
          po={selectedPO}
          onClose={() => setSelectedPO(null)}
          onSaved={(warning) => {
            loadPOs();
            setSyncWarning(warning || '');
            setActionError('');
          }}
        />
      )}

      {/* Modal konfirmasi reset */}
      {confirmReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            {confirmReset.status === 'pending' || confirmReset.status === 'confirmed' ? (
              <>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Hapus PO ini?</h3>
                <p className="text-sm text-gray-500 mb-1">
                  PO <strong>{confirmReset.supplier?.name}</strong> (
                  {formatDateID(confirmReset.session?.order_date)}) akan dihapus dari daftar.
                </p>
                <p className="text-sm text-red-600 mb-6">Tindakan ini tidak dapat dibatalkan.</p>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Reset Data Penerimaan?
                </h3>
                <p className="text-sm text-gray-500 mb-1">
                  PO <strong>{confirmReset.supplier?.name}</strong> akan dikembalikan ke status{' '}
                  <strong>Pending</strong>.
                </p>
                <p className="text-sm text-orange-600 mb-6">
                  Semua data qty diterima, harga aktual, dan bahan tambahan akan dihapus.
                </p>
              </>
            )}
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmReset(null)} className="btn-outline text-sm">
                Batal
              </button>
              <button
                onClick={() => handleResetPO(confirmReset)}
                disabled={resetting}
                className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50"
              >
                {resetting ? 'Memproses...' : 'Ya, Lanjutkan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Catat Penerimaan</h1>
          <p className="page-subtitle">Catat barang yang sudah diterima dari supplier</p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input w-full sm:w-56"
        >
          <option value="">Semua Status</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Dikonfirmasi</option>
          <option value="received">Diterima</option>
          <option value="received_partial">Diterima Sebagian</option>
        </select>
      </div>

      {actionError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {actionError}
        </div>
      )}
      {syncWarning && (
        <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg text-orange-700 text-sm flex items-start justify-between gap-3">
          <span>⚠ {syncWarning}</span>
          <button
            onClick={() => setSyncWarning('')}
            className="text-orange-400 hover:text-orange-600 font-bold leading-none flex-shrink-0"
          >
            ×
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
        </div>
      ) : pos.length === 0 ? (
        <div className="card p-10 text-center text-gray-400">
          <p className="font-medium">Tidak ada Purchase Order</p>
          <p className="text-sm mt-1">PO akan muncul setelah order disubmit dari halaman review</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pos.map((po) => (
            <div
              key={po.id}
              className="card p-4 grid gap-4 lg:grid-cols-[minmax(220px,1fr)_auto] items-center"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center text-xs font-bold text-brand-red">
                  PO
                </div>
                <div>
                  <p className="font-semibold text-gray-800">{po.supplier?.name}</p>
                  <p className="text-sm text-gray-500">
                    Order: {formatDateID(po.session?.order_date)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 flex-wrap lg:justify-end">
                <div className="text-left sm:text-center min-w-28">
                  <p className="text-xs text-gray-500">Est. Total</p>
                  <p className="font-semibold text-gray-800">{formatRupiah(po.total_estimated)}</p>
                </div>
                {po.total_actual ? (
                  <div className="text-left sm:text-center min-w-28">
                    <p className="text-xs text-gray-500">Aktual</p>
                    <p className="font-semibold text-brand-red">{formatRupiah(po.total_actual)}</p>
                  </div>
                ) : null}
                <span className={statusClass[po.status] || 'badge-pending'}>
                  {statusLabel[po.status] || po.status}
                </span>
                {po.status === 'pending' || po.status === 'confirmed' ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => openModal(po)}
                      disabled={openingPOId === po.id}
                      className="btn-primary text-sm"
                    >
                      {openingPOId === po.id ? 'Membuka...' : 'Catat Penerimaan'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmReset(po)}
                      title="Hapus PO ini dari daftar"
                      className="px-3 py-2 rounded-lg text-sm font-medium text-red-500 border border-red-300 hover:bg-red-50"
                    >
                      Reset
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => openModal(po)}
                      disabled={openingPOId === po.id}
                      className="btn-outline text-sm"
                    >
                      {openingPOId === po.id ? 'Membuka...' : 'Edit'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmReset(po)}
                      title="Reset data penerimaan ke Pending"
                      className="px-3 py-2 rounded-lg text-sm font-medium text-orange-600 border border-orange-300 hover:bg-orange-50"
                    >
                      Reset
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
