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

function buildWALink(supplier, poItems, orderDate, businessName, greetingText) {
  const totalEstimated = poItems.reduce((sum, item) => sum + (item.subtotal_estimated || 0), 0);

  const itemLines = poItems.map((item, i) => {
    let line = `${i + 1}. ${item.material_name} - ${item.qty_ordered} ${item.purchase_unit}`;
    if (item.package_qty && item.package_qty > 1) {
      line += ` (${item.package_qty}${item.package_unit})`;
    }
    return line;
  });

  const lines = [
    `📋 *PURCHASE ORDER*`,
    `📅 Tanggal: ${formatDate(orderDate)}`,
    `🏪 Dari: ${businessName}`,
    ``,
    `*${supplier.name.toUpperCase()}*`,
    `─────────────────`,
    ...itemLines,
    `─────────────────`,
    `💰 Est. Total: Rp ${formatRupiah(totalEstimated)}`,
    ``,
    greetingText || `Mohon konfirmasi ketersediaan. Terima kasih 🙏`,
  ];

  const encoded = encodeURIComponent(lines.join('\n'));
  return `https://wa.me/${supplier.wa_number}?text=${encoded}`;
}

module.exports = { buildWALink, formatDate, formatRupiah };
