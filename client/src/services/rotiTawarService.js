import api from '../lib/api';

export const previewRotiOrder = (tanggal) =>
  api.get(`/api/roti-tawar/preview${tanggal ? `?tanggal=${tanggal}` : ''}`).then((r) => r.data);

export const getMapping = () =>
  api.get('/api/roti-tawar/mapping').then((r) => r.data);

export const saveMapping = (mappings) =>
  api.put('/api/roti-tawar/mapping', { mappings }).then((r) => r.data);

export const getInventoryBranches = () =>
  api.get('/api/roti-tawar/inventory-branches').then((r) => r.data);
