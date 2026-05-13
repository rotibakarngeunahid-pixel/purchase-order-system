import { useEffect, useState } from 'react';
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
      await api.put('/api/settings', settings);
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
      await api.put('/api/settings', settings);
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
          label="Email Tujuan (penerima laporan purchase order)"
          id="admin_email"
          type="email"
          value={settings.admin_email}
          onChange={(e) => set('admin_email', e.target.value)}
          placeholder="rotibakarngeunahid@gmail.com"
          hint="Email ini akan menerima laporan purchase order setiap kali order dikirim."
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
