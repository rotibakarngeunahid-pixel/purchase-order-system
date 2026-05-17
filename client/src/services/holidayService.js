import api from '../lib/api';

export const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

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

// Cek order_date+1 dan order_date+2 untuk semua outlet
// Returns { order_date, date1, date2, holidays: { [outlet_id]: { date1_holiday, date2_holiday, calculation_days } } }
export const checkHolidaysBulk = (orderDate) =>
  api.get(`/api/holidays/check-bulk?order_date=${orderDate}`).then((r) => r.data);

// Buat hari libur baru
export const createHoliday = (payload) =>
  api.post('/api/holidays', payload).then((r) => r.data);

// Update hari libur (hanya holiday_name, note, is_active)
export const updateHoliday = (id, updates) =>
  api.put(`/api/holidays/${id}`, updates).then((r) => r.data);

// Hapus (soft delete) hari libur
export const deleteHoliday = (id) =>
  api.delete(`/api/holidays/${id}`).then((r) => r.data);

// Simpan metadata holiday bulk per outlet per sesi
export const saveHolidayMetadataBulk = (session_id, records) =>
  api.post('/api/holidays/metadata/bulk', { session_id, records }).then((r) => r.data);
