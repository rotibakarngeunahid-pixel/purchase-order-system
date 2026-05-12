import { useEffect, useState, useRef } from 'react';
import api, { formatRupiah, formatDateID, toInputDate } from '../lib/api';

function getFirstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

let _rowCounter = 0;
function newRow() {
  return {
    _id: ++_rowCounter,
    material_id: '',
    material: null,
    variant_id: '',
    variants: [],       // lazy-loaded when material is picked
    supplier_id: '',
    qty: '',
    unit: '',
    price_per_unit: '',
    notes: '',
  };
}

export default function PurchaseReport() {
  // Master data
  const [outlets, setOutlets] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [suppliers, setSuppliers] = useState([]);

  // Form
  const [outletId, setOutletId] = useState('');
  const [date, setDate] = useState(toInputDate());
  const [rows, setRows] = useState([newRow()]);
  const [submitting, setSubmitting] = useState(false);

  // History
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState(getFirstOfMonth());
  const [dateTo, setDateTo] = useState(toInputDate());
  const [filterOutletId, setFilterOutletId] = useState('');

  const [toast, setToast] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadMasterData();
    loadRecords();
  }, []);

  async function loadMasterData() {
    try {
      const [outRes, matRes, supRes] = await Promise.all([
        api.get('/api/outlets'),
        api.get('/api/materials'),
        api.get('/api/suppliers'),
      ]);
      setOutlets(outRes.data.filter((o) => o.is_active));
      setMaterials(matRes.data.filter((m) => m.is_active));
      setSuppliers(supRes.data.filter((s) => s.is_active));
    } catch {
      showToast('Gagal memuat master data', 'error');
    }
  }

  async function loadRecords() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      if (filterOutletId) params.set('outlet_id', filterOutletId);
      const res = await api.get(`/api/purchase-report?${params}`);
      setRecords(res.data);
    } catch {
      showToast('Gagal memuat histori', 'error');
    } finally {
      setLoading(false);
    }
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  function updateRow(idx, patch) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  async function onSelectMaterial(idx, materialId) {
    const mat = materials.find((m) => m.id === materialId) || null;

    // Fetch variants for this material on-demand
    let variants = [];
    if (materialId) {
      try {
        const res = await api.get(`/api/materials/${materialId}/variants`);
        variants = (res.data || []).filter((v) => v.is_active !== false);
      } catch {}
    }

    updateRow(idx, {
      material_id: materialId,
      material: mat,
      variant_id: '',
      variants,
      unit: mat ? mat.purchase_unit : '',
      price_per_unit: mat ? String(mat.price_per_purchase_unit || '') : '',
      supplier_id: mat?.supplier_id || '',
    });
  }

  function onSelectVariant(idx, variantId) {
    const row = rows[idx];
    if (!variantId) {
      updateRow(idx, {
        variant_id: '',
        price_per_unit: row.material ? String(row.material.price_per_purchase_unit || '') : '',
        supplier_id: row.material?.supplier_id || '',
      });
      return;
    }
    const variant = (row.variants || []).find((v) => v.id === variantId);
    if (!variant) return;
    updateRow(idx, {
      variant_id: variantId,
      price_per_unit: String(variant.price_per_purchase_unit || ''),
      ...(variant.supplier_id ? { supplier_id: variant.supplier_id } : {}),
    });
  }

  function addRow() {
    setRows((prev) => [...prev, newRow()]);
  }

  function removeRow(idx) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));
  }

  const validRows = rows.filter((r) => r.material_id && Number(r.qty) > 0);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!outletId) { showToast('Pilih outlet terlebih dahulu.', 'error'); return; }
    if (!date) { showToast('Isi tanggal terlebih dahulu.', 'error'); return; }
    if (validRows.length === 0) {
      showToast('Minimal satu bahan harus diisi (pilih bahan & isi qty).', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/api/purchase-report', {
        outlet_id: outletId,
        date,
        items: validRows.map((r) => ({
          material_id: r.material_id,
          variant_id: r.variant_id || null,
          supplier_id: r.supplier_id || null,
          qty: Number(r.qty),
          unit: r.unit,
          price_per_unit: Number(r.price_per_unit) || 0,
          notes: r.notes,
        })),
      });
      showToast(`${validRows.length} item berhasil disimpan!`);
      setRows([newRow()]);
      setOutletId('');
      loadRecords();
    } catch (err) {
      showToast('Gagal menyimpan: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Hapus catatan ini?')) return;
    setDeletingId(id);
    try {
      await api.delete(`/api/purchase-report/${id}`);
      showToast('Catatan dihapus.');
      setRecords((prev) => prev.filter((r) => r.id !== id));
    } catch {
      showToast('Gagal menghapus.', 'error');
    } finally {
      setDeletingId(null);
    }
  }

  // ---- Export template / Import CSV or XLSX ----
  async function exportTemplate() {
    // Create XLSX template with dropdown for cabang/material and a per-row date.
    try {
      const mod = await import('exceljs');
      const ExcelJS = mod.default || mod;
      const wb = new ExcelJS.Workbook();
      wb.creator = 'RotiBakarNgeunah';

      const template = wb.addWorksheet('Template');
      const materialsSheet = wb.addWorksheet('Materials');

      template.columns = [
        { header: 'Date', key: 'date', width: 14 },
        { header: 'Outlet', key: 'cabang_name', width: 30 },
        { header: 'Raw Materials Name', key: 'material_name', width: 40 },
        { header: 'Isi Kemasan', key: 'isi_kemasan', width: 16 },
        { header: 'Satuan Kemasan', key: 'satuan_kemasan', width: 18 },
        { header: 'Kuantiti Beli', key: 'qty', width: 14 },
        { header: 'Satuan Beli', key: 'unit', width: 14 },
        { header: 'Brand', key: 'variant_brand', width: 20 },
        { header: 'Supplier', key: 'supplier_name', width: 30 },
        { header: 'Price/Unit', key: 'price_per_unit', width: 16 },
        { header: 'Total Price', key: 'total_price', width: 16 },
        { header: 'Notes', key: 'notes', width: 30 },
      ];

      const sampleOutlet = (outlets && outlets[0] && outlets[0].name) || 'Outlet A';
      const sampleMaterial = (materials && materials[0] && materials[0].name) || 'Tepung Terigu';
      const sampleUnit = (materials && materials[0] && materials[0].purchase_unit) || 'kg';
      template.addRow([new Date(), sampleOutlet, sampleMaterial, 1, sampleUnit, 10, sampleUnit, 'Merk A', 'Supplier 1', 50000, { formula: 'F2*J2', result: 500000 }, 'contoh']);
      template.getColumn(1).numFmt = 'd-mmm-yy';

      // Populate materials sheet for dropdown source
      materialsSheet.getCell('A1').value = 'name';
      (materials || []).forEach((m, i) => {
        materialsSheet.getCell(`A${i + 2}`).value = m.name;
      });

      // Populate outlets sheet for dropdown source
      const outletsSheet = wb.addWorksheet('Outlets');
      outletsSheet.getCell('A1').value = 'name';
      (outlets || []).forEach((o, i) => {
        outletsSheet.getCell(`A${i + 2}`).value = o.name;
      });

      const lastMatRow = Math.max(2, (materials || []).length + 1);
      const lastOutRow = Math.max(2, (outlets || []).length + 1);
      const formulaMatRange = `=Materials!$A$2:$A$${lastMatRow}`;
      const formulaOutRange = `=Outlets!$A$2:$A$${lastOutRow}`;

      // Add data validation (dropdown) for Outlet and Raw Materials Name columns on many rows
      for (let r = 2; r <= 1000; r++) {
        template.getCell(`B${r}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [formulaOutRange],
          showErrorMessage: true,
          error: 'Pilih cabang dari daftar',
        };
        template.getCell(`C${r}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [formulaMatRange],
          showErrorMessage: true,
          error: 'Pilih material dari daftar',
        };
      }

      template.views = [{ state: 'frozen', ySplit: 1 }];

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'purchase_report_template.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      // Fallback to simple CSV if exceljs fails
      const headers = [
        'Date',
        'Outlet',
        'Raw Materials Name',
        'Isi Kemasan',
        'Satuan Kemasan',
        'Kuantiti Beli',
        'Satuan Beli',
        'Brand',
        'Supplier',
        'Price/Unit',
        'Total Price',
        'Notes',
      ];
      const example = [
        toInputDate(),
        'Outlet A',
        'Tepung Terigu',
        '1',
        'kg',
        '10',
        'kg',
        'Merk A',
        'Supplier 1',
        '50000',
        '500000',
        'contoh',
      ];
      const csv = [headers.join(','), example.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'purchase_report_template.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
  }

  function parseCSV(text) {
    if (!text) return [];
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/^\uFEFF/, '');
    const lines = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
        if (inQuotes && text[i + 1] === '"') { cur += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === '\n' && !inQuotes) {
        lines.push(cur);
        cur = '';
      } else { cur += ch; }
    }
    if (cur !== '') lines.push(cur);
    if (lines.length === 0) return [];
    const rawHeaders = lines[0].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(h => h.trim().replace(/^"|"$/g, ''));
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const cols = lines[i].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(c => c.trim().replace(/^"|"$/g, ''));
      const obj = {};
      for (let j = 0; j < rawHeaders.length; j++) {
        obj[rawHeaders[j]] = cols[j] !== undefined ? cols[j] : '';
      }
      rows.push(obj);
    }
    return rows;
  }

  function normalizeHeader(h) {
    return String(h || '').toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  }

  function normalizeLookupValue(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function readImportCellValue(cell) {
    let val = cell && cell.value != null ? cell.value : '';
    if (val instanceof Date) return val;
    if (val && typeof val === 'object') {
      if (val.richText) return val.richText.map((t) => t.text).join('');
      if (val.result != null) return val.result;
      if (val.text != null) return val.text;
      if (val.hyperlink && val.text) return val.text;
    }
    return val;
  }

  function isImportValueEmpty(value) {
    if (value instanceof Date) return false;
    return String(value ?? '').trim() === '';
  }

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function formatDateParts(year, month, day) {
    if (!year || !month || !day) return '';
    const fullYear = year < 100 ? 2000 + year : year;
    return `${fullYear}-${pad2(month)}-${pad2(day)}`;
  }

  function parseImportDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
    }

    if (typeof value === 'number' && value > 20000 && value < 80000) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const dateValue = new Date(excelEpoch.getTime() + value * 86400000);
      return `${dateValue.getUTCFullYear()}-${pad2(dateValue.getUTCMonth() + 1)}-${pad2(dateValue.getUTCDate())}`;
    }

    const raw = String(value || '').trim();
    if (!raw) return '';

    let match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (match) return formatDateParts(Number(match[1]), Number(match[2]), Number(match[3]));

    const months = {
      jan: 1, january: 1, januari: 1,
      feb: 2, february: 2, februari: 2,
      mar: 3, march: 3, maret: 3,
      apr: 4, april: 4,
      may: 5, mei: 5,
      jun: 6, june: 6, juni: 6,
      jul: 7, july: 7, juli: 7,
      aug: 8, august: 8, agu: 8, agustus: 8,
      sep: 9, sept: 9, september: 9,
      oct: 10, october: 10, okt: 10, oktober: 10,
      nov: 11, november: 11,
      dec: 12, december: 12, des: 12, desember: 12,
    };

    match = raw.match(/^(\d{1,2})[-\s/]([A-Za-z]+)[-\s/](\d{2,4})$/);
    if (match) {
      const month = months[match[2].toLowerCase()];
      if (month) return formatDateParts(Number(match[3]), month, Number(match[1]));
    }

    match = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
    if (match) return formatDateParts(Number(match[3]), Number(match[2]), Number(match[1]));

    return '';
  }

  function parseImportNumber(value) {
    if (typeof value === 'number') return value;
    const raw = String(value || '').trim();
    if (!raw) return 0;

    const cleaned = raw.replace(/[^\d,.-]/g, '');
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    let normalized = cleaned;

    if (lastComma >= 0 && lastDot >= 0) {
      normalized = lastComma > lastDot
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : cleaned.replace(/,/g, '');
    } else if (lastComma >= 0) {
      const parts = cleaned.split(',');
      normalized = parts.length > 1 && parts[parts.length - 1].length === 3
        ? cleaned.replace(/,/g, '')
        : cleaned.replace(',', '.');
    } else if (lastDot >= 0) {
      const parts = cleaned.split('.');
      normalized = parts.length > 1 && parts[parts.length - 1].length === 3
        ? cleaned.replace(/\./g, '')
        : cleaned;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  async function handleFileChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    // detect file type (xlsx preferred)
    const name = file.name || '';
    const ext = name.split('.').pop().toLowerCase();
    let parsed = [];

    try {
      if (ext === 'xlsx' || ext === 'xls') {
        const mod = await import('exceljs');
        const ExcelJS = mod.default || mod;
        const wb = new ExcelJS.Workbook();
        const ab = await file.arrayBuffer();
        await wb.xlsx.load(ab);
        const sheet = wb.worksheets[0];
        if (!sheet) { showToast('File XLSX tidak berisi sheet yang valid.', 'error'); fileInputRef.current.value = ''; return; }

        const headers = [];
        sheet.getRow(1).eachCell((cell) => headers.push(String(cell.value || '').trim()));
        for (let r = 2; r <= sheet.rowCount; r++) {
          const rowObj = {};
          let empty = true;
          for (let c = 0; c < headers.length; c++) {
            const cell = sheet.getRow(r).getCell(c + 1);
            const val = readImportCellValue(cell);
            rowObj[headers[c]] = val;
            if (!isImportValueEmpty(val)) empty = false;
          }
          if (!empty) parsed.push(rowObj);
        }
      } else {
        const text = await file.text();
        parsed = parseCSV(text);
      }
    } catch (err) {
      console.error(err);
      showToast('Gagal membaca file: ' + (err.message || ''), 'error');
      fileInputRef.current.value = '';
      return;
    }

    if (parsed.length === 0) { showToast('File kosong atau tidak valid.', 'error'); fileInputRef.current.value = ''; return; }

    // Normalize headers
    const headerMap = {};
    const sampleHeaders = Object.keys(parsed[0]);
    for (const h of sampleHeaders) {
      headerMap[normalizeHeader(h)] = h;
    }

    const alias = {
      date: ['date','tanggal','tgl'],
      cabang_name: ['cabang_name','nama_cabang','cabang','outlet_name','nama_outlet','outlet','branch_name','branch'],
      material_name: ['material_name','raw_materials_name','raw_material_name','raw material name','raw materials name','name','nama','nama_bahan','material','bahan','bahan_baku'],
      isi_kemasan: ['isi_kemasan','isi kemasan','isi_kemasan','pack_size','isi_pack','isi'],
      satuan_kemasan: ['satuan_kemasan','unit_kemasan','kemasan_unit','pack_unit'],
      variant_brand: ['variant_brand','brand','merk','varian','variant'],
      supplier_name: ['supplier_name','supplier','nama_supplier'],
      qty: ['qty','quantity','jumlah','kuantiti_beli','kuantitas_beli','quantity_beli','jumlah_beli'],
      unit: ['unit','satuan','satuan_beli','unit_beli'],
      price_per_unit: ['price_per_unit','priceunit','price','harga','harga_per_unit','harga_satuan','harga_beli'],
      total_price: ['total_price','total','total_harga','jumlah_harga'],
      notes: ['notes','note','catatan']
    };

    const findHeader = (keys) => {
      for (const k of keys) {
        const n = normalizeHeader(k);
        if (headerMap[n]) return headerMap[n];
      }
      return null;
    };

    const dateHeader = findHeader(alias.date);
    const cabangHeader = findHeader(alias.cabang_name);
    const materialHeader = findHeader(alias.material_name);
    const isiKemasanHeader = findHeader(alias.isi_kemasan);
    const satuanKemasanHeader = findHeader(alias.satuan_kemasan);
    const variantHeader = findHeader(alias.variant_brand);
    const supplierHeader = findHeader(alias.supplier_name);
    const qtyHeader = findHeader(alias.qty);
    const unitHeader = findHeader(alias.unit);
    const priceHeader = findHeader(alias.price_per_unit);
    const totalPriceHeader = findHeader(alias.total_price);
    const notesHeader = findHeader(alias.notes);

    if (!qtyHeader || !materialHeader) {
      showToast('File harus punya kolom material (nama) dan qty.', 'error');
      fileInputRef.current.value = '';
      return;
    }

    if (!outletId && !cabangHeader) {
      showToast('Pilih outlet di form atau isi kolom cabang_name di file import.', 'error');
      fileInputRef.current.value = '';
      return;
    }

    if (!date && !dateHeader) {
      showToast('Isi tanggal di form atau isi kolom Date/Tanggal di file import.', 'error');
      fileInputRef.current.value = '';
      return;
    }

    setImporting(true);
    try {
      // fetch variants list to help matching
      const [variantsRes] = await Promise.all([api.get('/api/purchase-report/variants')]);
      const variants = variantsRes.data || [];

      const itemsByGroup = {};
      let totalImported = 0;
      const errors = [];
      for (let i = 0; i < parsed.length; i++) {
        const row = parsed[i];
        const rowNum = i + 2; // csv/xlsx data row

        const rawDate = dateHeader ? row[dateHeader] : '';
        const parsedDate = dateHeader ? parseImportDate(rawDate) : '';
        if (dateHeader && !isImportValueEmpty(rawDate) && !parsedDate) {
          errors.push(`Baris ${rowNum}: format tanggal tidak valid (${String(rawDate)})`);
          continue;
        }
        const rowDate = parsedDate || date;
        if (!rowDate) { errors.push(`Baris ${rowNum}: tanggal wajib diisi`); continue; }

        const cabangName = cabangHeader ? String(row[cabangHeader] || '').trim() : '';
        let rowOutletId = outletId;
        if (cabangName) {
          const outlet = outlets.find((o) => normalizeLookupValue(o.name) === normalizeLookupValue(cabangName));
          if (!outlet) { errors.push(`Baris ${rowNum}: cabang tidak ditemukan (${cabangName})`); continue; }
          rowOutletId = outlet.id;
        }
        if (!rowOutletId) { errors.push(`Baris ${rowNum}: cabang wajib diisi`); continue; }

        const rawMaterial = (materialHeader ? row[materialHeader] : '') || '';
        const materialKey = String(rawMaterial).trim();
        if (!materialKey) { errors.push(`Baris ${rowNum}: material kosong`); continue; }

        const mat = materials.find((m) => normalizeLookupValue(m.name) === normalizeLookupValue(materialKey));
        if (!mat) { errors.push(`Baris ${rowNum}: material tidak ditemukan (${materialKey})`); continue; }

        const qtyVal = parseImportNumber(qtyHeader ? row[qtyHeader] : '');
        if (!(qtyVal > 0)) { errors.push(`Baris ${rowNum}: qty harus > 0`); continue; }

        const isiKemasanVal = isiKemasanHeader ? String(row[isiKemasanHeader] || '').trim() : '';
        const satuanKemasanVal = satuanKemasanHeader ? String(row[satuanKemasanHeader] || '').trim() : '';
        const kemasanVal = [isiKemasanVal, satuanKemasanVal].filter(Boolean).join(' ');

        let unitVal = (unitHeader ? row[unitHeader] : '') || '';
        unitVal = String(unitVal).trim() || mat.purchase_unit || '';
        if (!unitVal) { errors.push(`Baris ${rowNum}: unit tidak terdeteksi dan material tidak punya purchase_unit`); continue; }

        const priceFromFile = priceHeader ? parseImportNumber(row[priceHeader]) : 0;
        const totalPriceVal = totalPriceHeader ? parseImportNumber(row[totalPriceHeader]) : 0;
        const priceVal = priceFromFile || (totalPriceVal > 0 ? totalPriceVal / qtyVal : 0);

        let variantId = null;
        const variantBrand = variantHeader ? String(row[variantHeader] || '').trim() : '';
        if (variantBrand) {
          const found = variants.find((v) => v.material_id === mat.id && normalizeLookupValue(v.brand) === normalizeLookupValue(variantBrand));
          if (found) variantId = found.id;
        }

        let supplierId = null;
        const supplierName = supplierHeader ? String(row[supplierHeader] || '').trim() : '';
        if (supplierName) {
          const s = suppliers.find((sp) => normalizeLookupValue(sp.name) === normalizeLookupValue(supplierName));
          if (s) supplierId = s.id;
        }

        const notesVal = (notesHeader ? String(row[notesHeader] || '').trim() : '') || '';
        const notesCombined = kemasanVal ? (notesVal ? `${notesVal} | isi_kemasan:${kemasanVal}` : `isi_kemasan:${kemasanVal}`) : notesVal;

        const item = {
          material_id: mat.id,
          variant_id: variantId,
          supplier_id: supplierId,
          qty: qtyVal,
          unit: unitVal,
          price_per_unit: priceVal,
          notes: notesCombined,
        };

        const groupKey = `${rowDate}__${rowOutletId}`;
        if (!itemsByGroup[groupKey]) itemsByGroup[groupKey] = { date: rowDate, outlet_id: rowOutletId, items: [] };
        itemsByGroup[groupKey].items.push(item);
        totalImported++;
      }

      if (errors.length > 0) {
        showToast(`Import gagal: ${errors.length} baris bermasalah. Lihat console untuk detail.`, 'error');
        console.error('Import errors:', errors);
        fileInputRef.current.value = '';
        return;
      }

      const groupEntries = Object.values(itemsByGroup).filter((group) => group.items.length > 0);
      if (groupEntries.length === 0) {
        showToast('Tidak ada baris valid untuk diimpor.', 'error');
        fileInputRef.current.value = '';
        return;
      }

      // Server accepts one date/outlet per request, so group imported rows by tanggal + cabang.
      await Promise.all(groupEntries.map((group) => api.post('/api/purchase-report', {
        outlet_id: group.outlet_id,
        date: group.date,
        items: group.items,
      })));
      showToast(`${totalImported} baris berhasil diimpor${groupEntries.length > 1 ? ` untuk ${groupEntries.length} grup tanggal/cabang` : ''}.`);
      setRows([newRow()]);
      setOutletId('');
      loadRecords();
    } catch (err) {
      console.error(err);
      showToast('Gagal mengimpor: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setImporting(false);
      fileInputRef.current.value = '';
    }
  }

  // Group history by date + outlet
  const grouped = records.reduce((acc, r) => {
    const key = `${r.date}__${r.outlet_id}`;
    if (!acc[key]) acc[key] = { date: r.date, outlet: r.outlet, items: [] };
    acc[key].items.push(r);
    return acc;
  }, {});
  const groupedList = Object.values(grouped).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm max-w-sm ${
          toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Laporan Barang Masuk</h1>
        <p className="text-gray-500 text-sm mt-0.5">Catat penerimaan bahan baku per outlet</p>
      </div>

      {/* ── Form Input ── */}
      <form onSubmit={handleSubmit}>
        <div className="card p-5 mb-6">
          {/* Header row */}
          <div className="flex items-center gap-4 mb-5 flex-wrap">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Outlet</label>
              <select
                value={outletId}
                onChange={(e) => setOutletId(e.target.value)}
                className="input text-sm min-w-40"
                required
              >
                <option value="">— Pilih Outlet —</option>
                {outlets.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Tanggal</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input text-sm"
                required
              />
            </div>
          </div>

          {/* Item table */}
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2.5 text-left font-medium text-gray-500 w-8 text-center">#</th>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-500" style={{ minWidth: 180 }}>Bahan</th>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-500" style={{ minWidth: 150 }}>Merk / Varian</th>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-500 w-24">Qty</th>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-500 w-20">Satuan</th>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-500" style={{ minWidth: 140 }}>Harga/Satuan</th>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-500" style={{ minWidth: 160 }}>Supplier</th>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-500" style={{ minWidth: 130 }}>Catatan</th>
                  <th className="w-9" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row, idx) => {
                  const rowVariants = row.variants || [];
                  const subtotal = Number(row.qty || 0) * Number(row.price_per_unit || 0);
                  return (
                    <tr key={row._id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-400 text-center text-xs">{idx + 1}</td>

                      {/* Bahan */}
                      <td className="px-3 py-2">
                        <select
                          value={row.material_id}
                          onChange={(e) => onSelectMaterial(idx, e.target.value)}
                          className="input text-sm w-full"
                        >
                          <option value="">— Pilih bahan —</option>
                          {materials.map((m) => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                      </td>

                      {/* Varian / Merk */}
                      <td className="px-3 py-2">
                        {rowVariants.length > 0 ? (
                          <select
                            value={row.variant_id}
                            onChange={(e) => onSelectVariant(idx, e.target.value)}
                            className="input text-sm w-full"
                          >
                            <option value="">— Pilih merk —</option>
                            {rowVariants.map((v) => (
                              <option key={v.id} value={v.id}>{v.brand}</option>
                            ))}
                          </select>
                        ) : row.material?.brand ? (
                          <span className="text-sm text-gray-700 px-2 font-medium">
                            {row.material.brand}
                          </span>
                        ) : row.material_id ? (
                          <span className="text-xs text-gray-400 px-2">—</span>
                        ) : (
                          <span className="text-xs text-gray-300 px-2">—</span>
                        )}
                      </td>

                      {/* Qty */}
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0.01"
                          step="any"
                          value={row.qty}
                          onChange={(e) => updateRow(idx, { qty: e.target.value })}
                          placeholder="0"
                          className="input text-sm w-full text-center"
                        />
                      </td>

                      {/* Satuan (read-only, auto-fill) */}
                      <td className="px-3 py-2">
                        <span className={`text-sm font-medium ${row.unit ? 'text-gray-700' : 'text-gray-300'}`}>
                          {row.unit || '—'}
                        </span>
                      </td>

                      {/* Harga */}
                      <td className="px-3 py-2">
                        <div>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={row.price_per_unit}
                            onChange={(e) => updateRow(idx, { price_per_unit: e.target.value })}
                            placeholder="0"
                            className="input text-sm w-full"
                          />
                          {subtotal > 0 && (
                            <p className="text-xs text-gray-400 mt-0.5 text-right">
                              = {formatRupiah(subtotal)}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Supplier */}
                      <td className="px-3 py-2">
                        <select
                          value={row.supplier_id}
                          onChange={(e) => updateRow(idx, { supplier_id: e.target.value })}
                          className="input text-sm w-full"
                        >
                          <option value="">— Pilih —</option>
                          {suppliers.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </td>

                      {/* Catatan */}
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={row.notes}
                          onChange={(e) => updateRow(idx, { notes: e.target.value })}
                          placeholder="opsional"
                          className="input text-sm w-full"
                        />
                      </td>

                      {/* Delete row */}
                      <td className="px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeRow(idx)}
                          disabled={rows.length === 1}
                          className="text-gray-300 hover:text-red-500 transition-colors text-xl leading-none disabled:opacity-30"
                          title="Hapus baris"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Subtotal footer */}
              {validRows.length > 0 && (
                <tfoot>
                  <tr className="bg-orange-50 border-t-2 border-orange-200">
                    <td colSpan={5} className="px-3 py-2.5 text-right text-sm font-semibold text-gray-700">
                      Total ({validRows.length} item):
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-brand-red text-sm">
                      {formatRupiah(
                        validRows.reduce((s, r) => s + Number(r.qty || 0) * Number(r.price_per_unit || 0), 0)
                      )}
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-2">
              <button type="button" onClick={addRow} className="btn-secondary text-sm">
                + Tambah Bahan
              </button>
              <button type="button" onClick={exportTemplate} className="btn-secondary text-sm">
                Export Template
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current && fileInputRef.current.click()}
                className={`btn-secondary text-sm ${importing ? 'opacity-60 pointer-events-none' : ''}`}
              >
                {importing ? 'Mengimpor...' : 'Import Excel/CSV'}
              </button>
              <input ref={fileInputRef} type="file" accept=".csv,.xlsx" onChange={handleFileChange} className="hidden" />
            </div>
            <button
              type="submit"
              disabled={submitting || validRows.length === 0}
              className="btn-primary"
            >
              {submitting
                ? 'Menyimpan...'
                : `Simpan ${validRows.length > 0 ? `(${validRows.length} item)` : ''}`}
            </button>
          </div>
        </div>
      </form>

      {/* ── Histori ── */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center gap-3 flex-wrap">
          <h2 className="font-semibold text-gray-800 flex-1">Histori Barang Masuk</h2>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 whitespace-nowrap">Outlet:</label>
            <select
              value={filterOutletId}
              onChange={(e) => setFilterOutletId(e.target.value)}
              className="input text-sm w-auto"
            >
              <option value="">Semua</option>
              {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 whitespace-nowrap">Dari:</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input text-sm w-auto" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 whitespace-nowrap">Sampai:</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input text-sm w-auto" />
          </div>
          <button onClick={loadRecords} disabled={loading} className="btn-primary text-sm">
            {loading ? 'Memuat...' : 'Terapkan'}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
          </div>
        ) : groupedList.length === 0 ? (
          <div className="p-10 text-center text-gray-400">
            <p className="text-4xl mb-3">📦</p>
            <p>Belum ada catatan dalam rentang tanggal ini</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {groupedList.map((group) => {
              const groupTotal = group.items.reduce(
                (s, r) => s + Number(r.qty || 0) * Number(r.price_per_unit || 0),
                0
              );
              return (
                <div key={`${group.date}__${group.outlet?.id}`}>
                  {/* Group header */}
                  <div className="px-4 py-2.5 bg-gray-50 flex items-center gap-3 flex-wrap">
                    <span className="font-semibold text-sm text-brand-red">{group.outlet?.name}</span>
                    <span className="text-gray-400 text-xs">•</span>
                    <span className="text-gray-600 text-sm">{formatDateID(group.date)}</span>
                    <span className="text-gray-400 text-xs ml-auto">{group.items.length} item</span>
                    {groupTotal > 0 && (
                      <span className="text-sm font-semibold text-gray-700">{formatRupiah(groupTotal)}</span>
                    )}
                  </div>

                  {/* Items */}
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-gray-50">
                      {group.items.map((r) => {
                        const subtotal = Number(r.qty || 0) * Number(r.price_per_unit || 0);
                        return (
                          <tr key={r.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2.5 font-medium text-gray-800">
                              {r.material?.name}
                              {r.variant && (
                                <span className="ml-2 text-xs bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">
                                  {r.variant.brand}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <span className="font-semibold text-brand-red">{r.qty}</span>
                              <span className="text-gray-500 ml-1 text-xs">{r.unit}</span>
                            </td>
                            <td className="px-4 py-2.5 text-right text-gray-500 text-xs">
                              {r.price_per_unit > 0 ? formatRupiah(r.price_per_unit) + '/sat' : '—'}
                            </td>
                            <td className="px-4 py-2.5 text-right font-semibold text-gray-700">
                              {subtotal > 0 ? formatRupiah(subtotal) : '—'}
                            </td>
                            <td className="px-4 py-2.5 text-gray-500 text-xs">{r.supplier?.name || '—'}</td>
                            <td className="px-4 py-2.5 text-gray-400 text-xs max-w-xs truncate">
                              {r.notes || ''}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <button
                                onClick={() => handleDelete(r.id)}
                                disabled={deletingId === r.id}
                                className="text-gray-300 hover:text-red-500 transition-colors text-xl leading-none"
                                title="Hapus"
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
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
