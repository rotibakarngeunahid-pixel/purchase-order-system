import api from '../lib/api';

// List hari libur dengan filter opsional
export const getHolidays = ({ outlet_id, from, to, is_active } = {}) => {
  const params = new URLSearchParams();
  if (outlet_id) params.set('outlet_id', outlet_id);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (is_active !== undefined) params.set('is_active', String(is_active));
  const qs = params.toString();
  return api.get(`/api/holidays${qs ? `?${qs}` : ''}`).then((r) => r.data);
};

// Cek semua outlet untuk tanggal tertentu (order_date + 1 hari)
// Returns { date, holidays: { [outlet_id]: holidayRecord } }
export const checkHolidaysBulk = (date) =>
  api.get(`/api/holidays/check-bulk?date=${date}`).then((r) => r.data);

// Buat hari libur baru
export const createHoliday = ({ outlet_id, holiday_date, holiday_name, note }) =>
  api.post('/api/holidays', { outlet_id, holiday_date, holiday_name, note }).then((r) => r.data);

// Update hari libur
export const updateHoliday = (id, updates) =>
  api.put(`/api/holidays/${id}`, updates).then((r) => r.data);

// Hapus (soft delete) hari libur
export const deleteHoliday = (id) =>
  api.delete(`/api/holidays/${id}`).then((r) => r.data);

// Simpan metadata holiday bulk per outlet per sesi
export const saveHolidayMetadataBulk = (session_id, records) =>
  api.post('/api/holidays/metadata/bulk', { session_id, records }).then((r) => r.data);

// Hitung tanggal besok dari order_date (string YYYY-MM-DD)
export function getNextDate(orderDate) {
  const d = new Date(`${orderDate}T00:00:00+08:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}
