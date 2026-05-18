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

function wrapText(ctx, text, maxWidth) {
  const words = String(text || '-').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';

  words.forEach((word) => {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width <= maxWidth) {
      line = testLine;
      return;
    }
    if (line) lines.push(line);

    let remaining = word;
    while (ctx.measureText(remaining).width > maxWidth && remaining.length > 1) {
      let cut = remaining.length - 1;
      while (cut > 1 && ctx.measureText(`${remaining.slice(0, cut)}-`).width > maxWidth) {
        cut -= 1;
      }
      lines.push(`${remaining.slice(0, cut)}-`);
      remaining = remaining.slice(cut);
    }
    line = remaining;
  });

  if (line) lines.push(line);
  return lines.length ? lines : ['-'];
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
  const lines = wrapText(ctx, text, maxWidth);
  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight);
  });
  return lines.length * lineHeight;
}

function getBrand(item) {
  return item.material_brand || item.brand || '-';
}

function getPackageText(item) {
  if (Number(item.package_qty) > 1 && item.package_unit) {
    return `${item.package_qty} ${item.package_unit}`;
  }
  return '-';
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

  const width = 1080;
  const marginX = 64;
  const tableWidth = width - marginX * 2;
  const scale = Math.max(2, Math.ceil(window.devicePixelRatio || 1));
  const tempCanvas = document.createElement('canvas');
  const measureCtx = tempCanvas.getContext('2d');
  measureCtx.font = '600 30px Arial, sans-serif';

  const measuredRows = (po.items || []).map((item) => {
    const nameLines = wrapText(measureCtx, item.material_name, 390).length;
    const brandLines = wrapText(measureCtx, getBrand(item), 180).length;
    const lineCount = Math.max(nameLines, brandLines, 1);
    const rowHeight = Math.max(82, 34 + lineCount * 34);
    return { item, rowHeight };
  });

  const tableRowsHeight = measuredRows.reduce((sum, row) => sum + row.rowHeight, 0);
  const footerHeight = greetingText ? 120 : 78;
  const height = 320 + 62 + tableRowsHeight + footerHeight;

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.textBaseline = 'top';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#b91c1c';
  ctx.fillRect(0, 0, width, 184);
  ctx.fillStyle = '#f97316';
  ctx.fillRect(0, 170, width, 14);

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 44px Arial, sans-serif';
  ctx.fillText('Pesanan Bahan Baku', marginX, 44);
  ctx.font = '600 26px Arial, sans-serif';
  ctx.fillStyle = '#fee2e2';
  ctx.fillText(businessName, marginX, 100);

  ctx.textAlign = 'right';
  ctx.font = '600 24px Arial, sans-serif';
  ctx.fillText(formatDateID(orderDate), width - marginX, 48);
  ctx.font = '700 30px Arial, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(po.supplier?.name || 'Supplier', width - marginX, 94);
  ctx.textAlign = 'left';

  let y = 222;
  ctx.fillStyle = '#111827';
  ctx.font = '700 30px Arial, sans-serif';
  ctx.fillText('Detail Order Supplier', marginX, y);

  y += 56;
  ctx.fillStyle = '#f3f4f6';
  ctx.fillRect(marginX, y, tableWidth, 54);
  ctx.strokeStyle = '#e5e7eb';
  ctx.strokeRect(marginX, y, tableWidth, 54);

  ctx.fillStyle = '#374151';
  ctx.font = '700 20px Arial, sans-serif';
  ctx.fillText('No', marginX + 18, y + 17);
  ctx.fillText('Bahan', marginX + 78, y + 17);
  ctx.fillText('Merk', marginX + 500, y + 17);
  ctx.fillText('Qty', marginX + 718, y + 17);
  ctx.fillText('Satuan', marginX + 824, y + 17);
  ctx.fillText('Kemasan', marginX + 930, y + 17);

  y += 54;
  measuredRows.forEach(({ item, rowHeight }, index) => {
    ctx.fillStyle = index % 2 === 0 ? '#ffffff' : '#fff7ed';
    ctx.fillRect(marginX, y, tableWidth, rowHeight);
    ctx.strokeStyle = '#f3f4f6';
    ctx.strokeRect(marginX, y, tableWidth, rowHeight);

    ctx.fillStyle = '#6b7280';
    ctx.font = '600 22px Arial, sans-serif';
    ctx.fillText(String(index + 1), marginX + 18, y + 24);

    ctx.fillStyle = '#111827';
    ctx.font = '600 30px Arial, sans-serif';
    drawWrappedText(ctx, item.material_name, marginX + 78, y + 20, 390, 34);

    ctx.fillStyle = '#4b5563';
    ctx.font = '500 26px Arial, sans-serif';
    drawWrappedText(ctx, getBrand(item), marginX + 500, y + 22, 180, 32);

    ctx.fillStyle = '#b91c1c';
    ctx.font = '700 32px Arial, sans-serif';
    ctx.fillText(String(item.qty_ordered), marginX + 718, y + 21);

    ctx.fillStyle = '#111827';
    ctx.font = '600 26px Arial, sans-serif';
    ctx.fillText(item.purchase_unit || '-', marginX + 824, y + 24);

    ctx.fillStyle = '#4b5563';
    ctx.font = '500 24px Arial, sans-serif';
    drawWrappedText(ctx, getPackageText(item), marginX + 930, y + 24, 72, 28);

    if (item.roti_tawar_bonus) {
      ctx.fillStyle = '#ea580c';
      ctx.font = '600 18px Arial, sans-serif';
      ctx.fillText(
        `Kebutuhan ${item.roti_tawar_bonus.total_needed}, bonus +${item.roti_tawar_bonus.bonus}, total terima ${item.roti_tawar_bonus.fulfilled}`,
        marginX + 78,
        y + rowHeight - 24
      );
    }

    y += rowHeight;
  });

  y += 34;
  ctx.strokeStyle = '#e5e7eb';
  ctx.beginPath();
  ctx.moveTo(marginX, y);
  ctx.lineTo(width - marginX, y);
  ctx.stroke();

  y += 24;
  ctx.fillStyle = '#374151';
  ctx.font = '600 24px Arial, sans-serif';
  ctx.fillText(`Total item: ${(po.items || []).length}`, marginX, y);
  ctx.textAlign = 'right';
  ctx.fillText('Mohon konfirmasi ketersediaan.', width - marginX, y);
  ctx.textAlign = 'left';

  if (greetingText) {
    y += 40;
    ctx.fillStyle = '#6b7280';
    ctx.font = '500 22px Arial, sans-serif';
    drawWrappedText(ctx, greetingText, marginX, y, tableWidth, 28);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Gagal membuat gambar order.'));
    }, 'image/png');
  });
}
