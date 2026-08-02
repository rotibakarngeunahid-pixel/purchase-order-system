import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '',
  timeout: 30000,
});

// Inject token ke semua request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('rbn_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 → logout (redirect ke login mitra atau admin sesuai sesi yang aktif)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const isMitra = localStorage.getItem('rbn_role') === 'mitra';
      localStorage.removeItem('rbn_token');
      localStorage.removeItem('rbn_role');
      localStorage.removeItem('rbn_mitra');
      window.location.href = isMitra ? '/mitra/login' : '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

export function formatRupiah(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount || 0);
}

export function formatDateID(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function toInputDate(date = new Date()) {
  // Gunakan WITA (UTC+8) agar tanggal konsisten dengan zona waktu operasional
  const wita = new Date(date.getTime() + 8 * 3600 * 1000);
  return wita.toISOString().split('T')[0];
}

// Tanggal operasional hari ini dalam WITA, dengan cutoff 03:00 (sebelum 03:00 = hari sebelumnya)
export function getLocalOperationalDate() {
  const now = new Date();
  const wita = new Date(now.getTime() + 8 * 3600 * 1000);
  if (wita.getUTCHours() < 3) {
    wita.setUTCDate(wita.getUTCDate() - 1);
  }
  return wita.toISOString().split('T')[0];
}

// Tanggal operasional kemarin dalam WITA (H-1 dari getLocalOperationalDate)
export function getLocalOperationalYesterday() {
  const now = new Date();
  const wita = new Date(now.getTime() + 8 * 3600 * 1000);
  if (wita.getUTCHours() < 3) {
    wita.setUTCDate(wita.getUTCDate() - 1);
  }
  wita.setUTCDate(wita.getUTCDate() - 1);
  return wita.toISOString().split('T')[0];
}

// Tanggal operasional besok dalam WITA (H+1 dari getLocalOperationalDate)
export function getLocalOperationalTomorrow() {
  const now = new Date();
  const wita = new Date(now.getTime() + 8 * 3600 * 1000);
  if (wita.getUTCHours() < 3) {
    wita.setUTCDate(wita.getUTCDate() - 1);
  }
  wita.setUTCDate(wita.getUTCDate() + 1);
  return wita.toISOString().split('T')[0];
}
