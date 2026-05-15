import api from '../lib/api';

export const previewRotiOrder = ({ orderDate, referenceDate } = {}) => {
  const params = new URLSearchParams();
  if (orderDate) params.set('order_date', orderDate);
  if (referenceDate) params.set('reference_date', referenceDate);
  const qs = params.toString();
  return api.get(`/api/roti-tawar/preview${qs ? `?${qs}` : ''}`).then((r) => r.data);
};

export const getMapping = () =>
  api.get('/api/roti-tawar/mapping').then((r) => r.data);

export const saveMapping = (mappings) =>
  api.put('/api/roti-tawar/mapping', { mappings }).then((r) => r.data);

export const getInventoryBranches = () =>
  api.get('/api/roti-tawar/inventory-branches').then((r) => r.data);
