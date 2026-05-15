// Tanggal pelaporan WITA (UTC+8), cutoff pukul 03:00 — sebelum 03:00 dianggap hari sebelumnya
function getReportingDate(offsetHours = 8) {
  const now = new Date();
  const local = new Date(now.getTime() + offsetHours * 3600 * 1000);
  if (local.getUTCHours() < 3) {
    local.setUTCDate(local.getUTCDate() - 1);
  }
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, '0');
  const d = String(local.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getOperationalTomorrow(offsetHours = 8) {
  const now = new Date();
  const local = new Date(now.getTime() + offsetHours * 3600 * 1000);
  if (local.getUTCHours() < 3) {
    local.setUTCDate(local.getUTCDate() - 1);
  }
  local.setUTCDate(local.getUTCDate() + 1);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, '0');
  const d = String(local.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Jika orderDate > hari operasional saat ini, gunakan hari ini sebagai referensi stok.
// Jika orderDate <= hari ini (hari ini atau lampau), gunakan orderDate itu sendiri.
function resolveRotiReferenceDate(orderDate) {
  const today = getReportingDate();
  return orderDate > today ? today : orderDate;
}

module.exports = { getReportingDate, getOperationalTomorrow, resolveRotiReferenceDate };
