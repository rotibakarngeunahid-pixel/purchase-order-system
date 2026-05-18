const CANVAS_WIDTH = 1400;
const SIDE_PADDING = 76;
const HEADER_HEIGHT = 210;
const ACCENT_HEIGHT = 16;
const TABLE_HEADER_HEIGHT = 66;
const TABLE_BORDER = '#e5e7eb';
const ROW_BORDER = '#edf1f5';
const HEADER_RED = '#b91c1c';
const ACCENT_ORANGE = '#f97316';
const TEXT_DARK = '#111827';
const TEXT_MUTED = '#4b5563';
const TEXT_SOFT = '#6b7280';
const FONT_FAMILY = 'Inter, Arial, Helvetica, sans-serif';

const COLUMN_SPECS = [
  { id: 'no', label: 'No', ratio: 0.06, align: 'center', pad: 14 },
  { id: 'material', label: 'Bahan', ratio: 0.34, align: 'left', pad: 24 },
  { id: 'brand', label: 'Merk', ratio: 0.24, align: 'left', pad: 24 },
  { id: 'qty', label: 'Qty', ratio: 0.08, align: 'center', pad: 14 },
  { id: 'unit', label: 'Satuan', ratio: 0.14, align: 'left', pad: 24 },
  { id: 'package', label: 'Kemasan', ratio: 0.14, align: 'left', pad: 24 },
];

function formatDateID(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function slugifyFilename(value) {
  return String(value || 'supplier')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'supplier';
}

function setFont(ctx, weight, size) {
  ctx.font = `${weight} ${size}px ${FONT_FAMILY}`;
}

function normalizeText(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || '-';
}

function ellipsizeToWidth(ctx, text, maxWidth) {
  const ellipsis = '...';
  if (ctx.measureText(text).width <= maxWidth) return text;
  if (ctx.measureText(ellipsis).width > maxWidth) return '';

  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (ctx.measureText(text.slice(0, mid) + ellipsis).width <= maxWidth) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return text.slice(0, low).trimEnd() + ellipsis;
}

function wrapText(ctx, value, maxWidth, maxLines = 2) {
  const text = normalizeText(value);
  const words = text.split(' ');
  const lines = [];
  let current = '';

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      return;
    }

    if (current) {
      lines.push(current);
      current = '';
    }

    if (ctx.measureText(word).width <= maxWidth) {
      current = word;
      return;
    }

    let remaining = word;
    while (remaining && lines.length < maxLines) {
      let cut = remaining.length;
      while (cut > 1 && ctx.measureText(`${remaining.slice(0, cut)}-`).width > maxWidth) {
        cut -= 1;
      }
      const chunk = remaining.slice(0, cut);
      remaining = remaining.slice(cut);
      if (remaining) lines.push(`${chunk}-`);
      else current = chunk;
    }
  });

  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines.length ? lines : ['-'];

  const limited = lines.slice(0, maxLines);
  limited[maxLines - 1] = ellipsizeToWidth(ctx, limited[maxLines - 1], maxWidth);
  return limited;
}

function fitWrappedText(ctx, value, {
  maxWidth,
  maxLines = 2,
  weight = '500',
  baseSize,
  minSize,
  lineHeightRatio = 1.18,
}) {
  const normalized = normalizeText(value);
  for (let size = baseSize; size >= minSize; size -= 1) {
    setFont(ctx, weight, size);
    if (ctx.measureText(normalized).width <= maxWidth) {
      return {
        lines: [normalized],
        size,
        weight,
        lineHeight: Math.ceil(size * lineHeightRatio),
      };
    }

    const lines = wrapText(ctx, normalized, maxWidth, maxLines);
    const hasBrokenWord = lines.some((line) => line.endsWith('-'));
    const fits = !hasBrokenWord &&
      lines.length <= maxLines &&
      lines.every((line) => ctx.measureText(line).width <= maxWidth);
    if (fits) {
      return {
        lines,
        size,
        weight,
        lineHeight: Math.ceil(size * lineHeightRatio),
      };
    }
  }

  setFont(ctx, weight, minSize);
  const lines = wrapText(ctx, value, maxWidth, maxLines);
  return {
    lines,
    size: minSize,
    weight,
    lineHeight: Math.ceil(minSize * lineHeightRatio),
  };
}

function drawLines(ctx, fit, x, y, maxWidth, align = 'left') {
  setFont(ctx, fit.weight, fit.size);
  fit.lines.forEach((line, index) => {
    if (align === 'center') {
      ctx.textAlign = 'center';
      ctx.fillText(line, x + maxWidth / 2, y + index * fit.lineHeight);
      return;
    }
    if (align === 'right') {
      ctx.textAlign = 'right';
      ctx.fillText(line, x + maxWidth, y + index * fit.lineHeight);
      return;
    }
    ctx.textAlign = 'left';
    ctx.fillText(line, x, y + index * fit.lineHeight);
  });
  ctx.textAlign = 'left';
}

function fitSingleLine(ctx, value, {
  maxWidth,
  weight = '700',
  baseSize,
  minSize,
}) {
  const text = normalizeText(value);
  for (let size = baseSize; size >= minSize; size -= 1) {
    setFont(ctx, weight, size);
    if (ctx.measureText(text).width <= maxWidth) {
      return { lines: [text], size, weight, lineHeight: Math.ceil(size * 1.18) };
    }
  }

  setFont(ctx, weight, minSize);
  return {
    lines: [ellipsizeToWidth(ctx, text, maxWidth)],
    size: minSize,
    weight,
    lineHeight: Math.ceil(minSize * 1.18),
  };
}

function getBrand(item) {
  return item.material_brand || item.brand || '-';
}

function getPackageText(item) {
  const qty = Number(item.package_qty);
  const unit = normalizeText(item.package_unit);
  if (qty > 1 && unit !== '-') return `${item.package_qty} ${unit}`;
  return '-';
}

function buildColumns(tableX, tableWidth) {
  let cursor = tableX;
  return COLUMN_SPECS.map((spec, index) => {
    const isLast = index === COLUMN_SPECS.length - 1;
    const width = isLast
      ? tableX + tableWidth - cursor
      : Math.round(tableWidth * spec.ratio);
    const col = {
      ...spec,
      x: cursor,
      width,
      textX: cursor + spec.pad,
      textWidth: Math.max(1, width - spec.pad * 2),
    };
    cursor += width;
    return col;
  });
}

function columnMap(columns) {
  return columns.reduce((map, col) => {
    map[col.id] = col;
    return map;
  }, {});
}

function measureRows(ctx, items, cols) {
  return items.map((item) => {
    const material = fitWrappedText(ctx, item.material_name, {
      maxWidth: cols.material.textWidth,
      maxLines: 2,
      weight: '700',
      baseSize: 34,
      minSize: 26,
    });
    const brand = fitWrappedText(ctx, getBrand(item), {
      maxWidth: cols.brand.textWidth,
      maxLines: 2,
      weight: '500',
      baseSize: 30,
      minSize: 22,
    });
    const unit = fitWrappedText(ctx, item.purchase_unit || '-', {
      maxWidth: cols.unit.textWidth,
      maxLines: 2,
      weight: '700',
      baseSize: 30,
      minSize: 23,
    });
    const packageText = fitWrappedText(ctx, getPackageText(item), {
      maxWidth: cols.package.textWidth,
      maxLines: 2,
      weight: '500',
      baseSize: 28,
      minSize: 22,
    });

    const materialHeight = material.lines.length * material.lineHeight +
      (item.roti_tawar_bonus ? 28 : 0);
    const contentHeight = Math.max(
      materialHeight,
      brand.lines.length * brand.lineHeight,
      unit.lines.length * unit.lineHeight,
      packageText.lines.length * packageText.lineHeight,
      44
    );

    return {
      item,
      fits: { material, brand, unit, packageText },
      rowHeight: Math.ceil(Math.max(94, contentHeight + 46)),
    };
  });
}

function drawTableHeader(ctx, columns, tableX, y, tableWidth) {
  ctx.fillStyle = '#f3f4f6';
  ctx.fillRect(tableX, y, tableWidth, TABLE_HEADER_HEIGHT);
  ctx.strokeStyle = TABLE_BORDER;
  ctx.lineWidth = 1;
  ctx.strokeRect(tableX, y, tableWidth, TABLE_HEADER_HEIGHT);

  columns.forEach((col) => {
    ctx.fillStyle = '#374151';
    setFont(ctx, '700', 24);
    const textY = y + 21;
    if (col.align === 'center') {
      ctx.textAlign = 'center';
      ctx.fillText(col.label, col.x + col.width / 2, textY);
    } else {
      ctx.textAlign = 'left';
      ctx.fillText(col.label, col.textX, textY);
    }
  });
  ctx.textAlign = 'left';
}

function drawTableGrid(ctx, columns, tableX, y, tableWidth, height) {
  ctx.strokeStyle = ROW_BORDER;
  ctx.lineWidth = 1;
  columns.slice(1).forEach((col) => {
    ctx.beginPath();
    ctx.moveTo(col.x, y);
    ctx.lineTo(col.x, y + height);
    ctx.stroke();
  });
  ctx.strokeStyle = TABLE_BORDER;
  ctx.strokeRect(tableX, y, tableWidth, height);
}

function drawOrderRow(ctx, row, columns, cols, index, y, tableX, tableWidth) {
  const { item, fits, rowHeight } = row;
  ctx.fillStyle = index % 2 === 0 ? '#ffffff' : '#fff7ed';
  ctx.fillRect(tableX, y, tableWidth, rowHeight);

  ctx.strokeStyle = ROW_BORDER;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(tableX, y + rowHeight);
  ctx.lineTo(tableX + tableWidth, y + rowHeight);
  ctx.stroke();

  ctx.fillStyle = TEXT_SOFT;
  setFont(ctx, '700', 23);
  ctx.textAlign = 'center';
  ctx.fillText(String(index + 1), cols.no.x + cols.no.width / 2, y + (rowHeight - 28) / 2);

  const materialHeight = fits.material.lines.length * fits.material.lineHeight;
  const materialBlockHeight = materialHeight + (item.roti_tawar_bonus ? 28 : 0);
  let materialY = y + Math.max(24, (rowHeight - materialBlockHeight) / 2);
  ctx.fillStyle = TEXT_DARK;
  drawLines(ctx, fits.material, cols.material.textX, materialY, cols.material.textWidth);

  if (item.roti_tawar_bonus) {
    const bonus = item.roti_tawar_bonus;
    ctx.fillStyle = '#ea580c';
    setFont(ctx, '600', 17);
    ctx.textAlign = 'left';
    ctx.fillText(
      `Kebutuhan ${bonus.total_needed}, bonus +${bonus.bonus}, total terima ${bonus.fulfilled}`,
      cols.material.textX,
      materialY + materialHeight + 9
    );
  }

  ctx.fillStyle = TEXT_MUTED;
  drawLines(
    ctx,
    fits.brand,
    cols.brand.textX,
    y + (rowHeight - fits.brand.lines.length * fits.brand.lineHeight) / 2,
    cols.brand.textWidth
  );

  ctx.fillStyle = HEADER_RED;
  setFont(ctx, '700', 36);
  ctx.textAlign = 'center';
  ctx.fillText(
    normalizeText(item.qty_ordered),
    cols.qty.x + cols.qty.width / 2,
    y + (rowHeight - 43) / 2
  );

  ctx.fillStyle = TEXT_DARK;
  drawLines(
    ctx,
    fits.unit,
    cols.unit.textX,
    y + (rowHeight - fits.unit.lines.length * fits.unit.lineHeight) / 2,
    cols.unit.textWidth
  );

  ctx.fillStyle = TEXT_MUTED;
  drawLines(
    ctx,
    fits.packageText,
    cols.package.textX,
    y + (rowHeight - fits.packageText.lines.length * fits.packageText.lineHeight) / 2,
    cols.package.textWidth
  );
  ctx.textAlign = 'left';
}

function drawHeader(ctx, po, orderDate, businessName, contentWidth) {
  ctx.fillStyle = HEADER_RED;
  ctx.fillRect(0, 0, CANVAS_WIDTH, HEADER_HEIGHT);
  ctx.fillStyle = ACCENT_ORANGE;
  ctx.fillRect(0, HEADER_HEIGHT, CANVAS_WIDTH, ACCENT_HEIGHT);

  const leftX = SIDE_PADDING;
  const rightX = CANVAS_WIDTH - SIDE_PADDING;
  const rightWidth = Math.min(520, contentWidth * 0.42);

  ctx.fillStyle = '#ffffff';
  setFont(ctx, '800', 52);
  ctx.textAlign = 'left';
  ctx.fillText('Pesanan Bahan Baku', leftX, 48);

  ctx.fillStyle = '#fee2e2';
  const businessFit = fitSingleLine(ctx, businessName, {
    maxWidth: contentWidth * 0.5,
    weight: '700',
    baseSize: 30,
    minSize: 24,
  });
  drawLines(ctx, businessFit, leftX, 122, contentWidth * 0.5);

  ctx.fillStyle = '#fee2e2';
  const dateFit = fitSingleLine(ctx, formatDateID(orderDate), {
    maxWidth: rightWidth,
    weight: '700',
    baseSize: 28,
    minSize: 23,
  });
  drawLines(ctx, dateFit, rightX - rightWidth, 50, rightWidth, 'right');

  ctx.fillStyle = '#ffffff';
  const supplierFit = fitWrappedText(ctx, po.supplier?.name || 'Supplier', {
    maxWidth: rightWidth,
    maxLines: 2,
    weight: '800',
    baseSize: 38,
    minSize: 27,
    lineHeightRatio: 1.12,
  });
  drawLines(ctx, supplierFit, rightX - rightWidth, 108, rightWidth, 'right');
}

function measureGreeting(ctx, greetingText, tableWidth) {
  if (!greetingText) return null;
  return fitWrappedText(ctx, greetingText, {
    maxWidth: tableWidth,
    maxLines: 2,
    weight: '500',
    baseSize: 24,
    minSize: 20,
    lineHeightRatio: 1.22,
  });
}

export function getSupplierOrderImageFilename(po, orderDate) {
  return `order-supplier-${slugifyFilename(po?.supplier?.name)}-${orderDate}.png`;
}

export async function createSupplierOrderImageBlob({
  po,
  orderDate,
  businessName = 'Roti Bakar Ngeunah',
  greetingText = '',
}) {
  if (document.fonts?.ready) await document.fonts.ready;

  const scale = Math.max(2, Math.ceil(window.devicePixelRatio || 1));
  const tableX = SIDE_PADDING;
  const tableWidth = CANVAS_WIDTH - SIDE_PADDING * 2;
  const contentWidth = tableWidth;
  const columns = buildColumns(tableX, tableWidth);
  const cols = columnMap(columns);
  const items = po.items || [];

  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');
  const rows = measureRows(measureCtx, items, cols);
  const rowsHeight = rows.reduce((sum, row) => sum + row.rowHeight, 0);
  const greetingFit = measureGreeting(measureCtx, greetingText, tableWidth);
  const greetingHeight = greetingFit ? greetingFit.lines.length * greetingFit.lineHeight + 22 : 0;

  const contentTop = HEADER_HEIGHT + ACCENT_HEIGHT + 56;
  const tableTop = contentTop + 82;
  const tableHeight = TABLE_HEADER_HEIGHT + rowsHeight;
  const footerTop = tableTop + tableHeight + 46;
  const footerHeight = 96 + greetingHeight;
  const canvasHeight = Math.ceil(footerTop + footerHeight + 48);

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH * scale;
  canvas.height = canvasHeight * scale;
  canvas.style.width = `${CANVAS_WIDTH}px`;
  canvas.style.height = `${canvasHeight}px`;

  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CANVAS_WIDTH, canvasHeight);

  drawHeader(ctx, po, orderDate, businessName, contentWidth);

  ctx.fillStyle = TEXT_DARK;
  setFont(ctx, '800', 40);
  ctx.textAlign = 'left';
  ctx.fillText('Detail Order Supplier', SIDE_PADDING, contentTop);

  drawTableHeader(ctx, columns, tableX, tableTop, tableWidth);

  let rowY = tableTop + TABLE_HEADER_HEIGHT;
  rows.forEach((row, index) => {
    drawOrderRow(ctx, row, columns, cols, index, rowY, tableX, tableWidth);
    rowY += row.rowHeight;
  });
  drawTableGrid(ctx, columns, tableX, tableTop, tableWidth, tableHeight);

  ctx.strokeStyle = TABLE_BORDER;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(tableX, footerTop);
  ctx.lineTo(tableX + tableWidth, footerTop);
  ctx.stroke();

  const footerTextY = footerTop + 28;
  ctx.fillStyle = '#374151';
  setFont(ctx, '800', 30);
  ctx.textAlign = 'left';
  ctx.fillText(`Total item: ${items.length}`, tableX, footerTextY);

  ctx.textAlign = 'right';
  ctx.fillText('Mohon konfirmasi ketersediaan.', tableX + tableWidth, footerTextY);
  ctx.textAlign = 'left';

  if (greetingFit) {
    ctx.fillStyle = TEXT_SOFT;
    drawLines(ctx, greetingFit, tableX, footerTextY + 48, tableWidth);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Gagal membuat gambar order.'));
    }, 'image/png');
  });
}
