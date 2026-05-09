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

module.exports = { getReportingDate };
