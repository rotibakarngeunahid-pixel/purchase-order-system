function formatDate(dateStr) {
  const date = new Date(dateStr);
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function formatRupiah(amount) {
  return new Intl.NumberFormat('id-ID').format(Math.round(amount));
}

// Hapus semua karakter emoji dari teks
function removeEmoji(text) {
  return text
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')
    .trim();
}

function buildWALink(supplier, poItems, orderDate, businessName, greetingText) {
  const itemLines = poItems.map((item, i) => {
    let line = `${i + 1}. ${item.material_name} : ${item.qty_ordered} ${item.purchase_unit}`;
    if (item.package_qty && item.package_qty > 1) {
      line += ` (${item.package_qty} ${item.package_unit})`;
    }
    return line;
  });

  const cleanGreeting = greetingText
    ? removeEmoji(greetingText)
    : 'Mohon konfirmasi ketersediaan. Terima kasih.';

  const lines = [
    `PESANAN BARU`,
    `Dari        : ${businessName}`,
    `Tanggal     : ${formatDate(orderDate)}`,
    `Supplier    : ${supplier.name.toUpperCase()}`,
    ``,
    `Detail Pesanan:`,
    ...itemLines,
    ``,
    cleanGreeting,
  ];

  const encoded = encodeURIComponent(lines.join('\n'));
  return `https://wa.me/${supplier.wa_number}?text=${encoded}`;
}

module.exports = { buildWALink, formatDate, formatRupiah };
