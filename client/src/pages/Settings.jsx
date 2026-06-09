import { useEffect, useRef, useState } from 'react';
import api from '../lib/api';
import RotiTawarConfig from '../components/RotiTawarConfig';

function Section({ title, children }) {
  return (
    <div className="card p-6 mb-5">
      <h3 className="font-semibold text-gray-800 mb-4 pb-3 border-b border-gray-100">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, id, type = 'text', value, onChange, placeholder, hint }) {
  return (
    <div className="mb-4">
      <label htmlFor={id} className="label">{label}</label>
      {type === 'textarea' ? (
        <textarea
          id={id}
          className="input resize-none"
          rows={3}
          value={value || ''}
          onChange={onChange}
          placeholder={placeholder}
        />
      ) : (
        <input
          id={id}
          type={type}
          className="input"
          value={value || ''}
          onChange={onChange}
          placeholder={placeholder}
        />
      )}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

// ── Photo Guide Section ──────────────────────────────────────────────────────

function PhotoGuideSection({ showToast }) {
  const [instruction, setInstruction] = useState('');
  const [examplePhotos, setExamplePhotos] = useState([]); // array of URL strings
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    api.get('/api/settings').then((res) => {
      const raw = res.data?.distribution_photo_guide;
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          setInstruction(parsed.instruction || '');
          setExamplePhotos(parsed.example_photos || []);
        } catch {}
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleUploadExample = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (examplePhotos.length >= 3) {
      showToast('Maksimal 3 foto contoh.', 'error');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('photo', file);
      const res = await api.post('/api/settings/upload-guide-photo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setExamplePhotos((prev) => [...prev, res.data.url]);
      showToast('Foto contoh berhasil diunggah!');
    } catch (err) {
      showToast(err.response?.data?.error || err.message, 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveExample = (idx) => {
    setExamplePhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const guideValue = JSON.stringify({ instruction, example_photos: examplePhotos });
      await api.put('/api/settings', { distribution_photo_guide: guideValue });
      showToast('Panduan foto berhasil disimpan!');
    } catch (err) {
      showToast(err.response?.data?.error || err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="h-8 flex items-center"><div className="w-5 h-5 border-2 border-brand-red border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="label">Teks Instruksi</label>
        <textarea
          className="input resize-none"
          rows={3}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Foto harus memperlihatkan semua bahan yang diterima beserta nota/surat jalan di sebelahnya"
        />
        <p className="text-xs text-gray-400 mt-1">
          Ditampilkan kepada staff di halaman Distribution Listing sebagai panduan pengambilan foto.
        </p>
      </div>

      <div>
        <label className="label">Foto Contoh (maks. 3)</label>
        <div className="flex flex-wrap gap-3 mb-3">
          {examplePhotos.map((url, idx) => (
            <div key={idx} className="relative group">
              <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
                <img src={url} alt={`Contoh ${idx + 1}`} className="w-full h-full object-cover" />
              </div>
              <button
                onClick={() => handleRemoveExample(idx)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs font-bold flex items-center justify-center hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                ✕
              </button>
            </div>
          ))}
          {examplePhotos.length < 3 && (
            <label className="cursor-pointer">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={handleUploadExample}
              />
              <div className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center hover:border-brand-red hover:bg-red-50 transition-colors">
                {uploading ? (
                  <div className="w-5 h-5 border-2 border-brand-red border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span className="text-2xl">📷</span>
                    <span className="text-[10px] text-gray-400 mt-1">Tambah</span>
                  </>
                )}
              </div>
            </label>
          )}
        </div>
        <p className="text-xs text-gray-400">
          Foto contoh akan ditampilkan kepada staff sebagai referensi foto yang baik.
        </p>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="btn-primary text-sm"
      >
        {saving ? 'Menyimpan...' : 'Simpan Panduan Foto'}
      </button>
    </div>
  );
}

// ── Main Settings Page ───────────────────────────────────────────────────────

export default function Settings() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    api.get('/api/settings').then((res) => {
      setSettings(res.data);
      setLoading(false);
    });
  }, []);

  const set = (key, val) => setSettings((s) => ({ ...s, [key]: val }));

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      // Exclude distribution_photo_guide from the batch save (saved separately)
      const { distribution_photo_guide: _ignored, ...rest } = settings;
      await api.put('/api/settings', rest);
      showToast('Pengaturan berhasil disimpan!');
    } catch (err) {
      showToast(err.response?.data?.error || err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    setTesting(true);
    try {
      const { distribution_photo_guide: _ignored, ...rest } = settings;
      await api.put('/api/settings', rest);
      const res = await api.post('/api/settings/test-email');
      showToast(res.data.message || 'Email test berhasil dikirim!');
    } catch (err) {
      showToast(err.response?.data?.error || err.message, 'error');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="page-shell max-w-3xl">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm max-w-sm ${
          toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="page-header">
        <div>
          <h1 className="page-title">Pengaturan</h1>
          <p className="page-subtitle">Konfigurasi sistem order bahan baku</p>
        </div>
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? 'Menyimpan...' : 'Simpan Semua'}
        </button>
      </div>

      {/* Info Bisnis */}
      <Section title="Info Bisnis">
        <Field
          label="Nama Usaha"
          id="business_name"
          value={settings.business_name}
          onChange={(e) => set('business_name', e.target.value)}
          placeholder="Roti Bakar Ngeunah"
        />
        <Field
          label="Email Admin"
          id="admin_email"
          type="email"
          value={settings.admin_email}
          onChange={(e) => set('admin_email', e.target.value)}
          placeholder="rotibakarngeunahid@gmail.com"
          hint="Dipakai untuk fitur test email dan kebutuhan administrasi. Submit order supplier sekarang menghasilkan gambar, bukan email."
        />
        <button
          onClick={handleTestEmail}
          disabled={testing}
          className="btn-secondary text-sm"
        >
          {testing ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Mengirim test email...
            </span>
          ) : (
            'Kirim Email Test ke Alamat Ini'
          )}
        </button>
      </Section>

      {/* WhatsApp */}
      <Section title="Konfigurasi WhatsApp">
        <Field
          label="Teks Penutup Pesan WA"
          id="wa_greeting_text"
          type="textarea"
          value={settings.wa_greeting_text}
          onChange={(e) => set('wa_greeting_text', e.target.value)}
          placeholder="Mohon konfirmasi ketersediaan. Terima kasih."
          hint="Teks ini akan ditampilkan di bagian bawah setiap pesan WhatsApp yang dikirim ke supplier."
        />
      </Section>

      {/* Panduan Foto Distribusi */}
      <Section title="Panduan Foto Distribusi">
        <PhotoGuideSection showToast={showToast} />
      </Section>

      <div className="flex justify-end mt-2">
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? 'Menyimpan...' : 'Simpan Semua'}
        </button>
      </div>

      {/* Roti Tawar Auto-Calc Config */}
      <Section title="Konfigurasi Roti Tawar Auto-Calc">
        <RotiTawarConfig />
      </Section>
    </div>
  );
}
