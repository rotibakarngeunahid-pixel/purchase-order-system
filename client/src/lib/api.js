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

// Handle 401 → logout
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('rbn_token');
      window.location.href = '/login';
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
  return date.toISOString().split('T')[0];
}
