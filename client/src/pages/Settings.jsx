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
  const [showSmtpPass, setShowSmtpPass] = useState(false);

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

  const handleTestSMTP = async () => {
    setTesting(true);
    // Save first
    try {
      await api.put('/api/settings', settings);
      const res = await api.post('/api/settings/test-smtp');
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
    <div className="p-6 max-w-2xl mx-auto">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm max-w-sm ${
          toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pengaturan</h1>
          <p className="text-gray-500 text-sm mt-0.5">Konfigurasi sistem order bahan baku</p>
        </div>
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? 'Menyimpan...' : '💾 Simpan Semua'}
        </button>
      </div>

      {/* Info Bisnis */}
      <Section title="📋 Info Bisnis">
        <Field
          label="Nama Usaha"
          id="business_name"
          value={settings.business_name}
          onChange={(e) => set('business_name', e.target.value)}
          placeholder="Roti Bakar Ngeunah"
        />
        <Field
          label="Email Admin (penerima notifikasi)"
          id="admin_email"
          type="email"
          value={settings.admin_email}
          onChange={(e) => set('admin_email', e.target.value)}
          placeholder="admin@rotibakarngeunah.com"
        />
      </Section>

      {/* SMTP */}
      <Section title="📧 Konfigurasi SMTP">
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="SMTP Host"
            id="smtp_host"
            value={settings.smtp_host}
            onChange={(e) => set('smtp_host', e.target.value)}
            placeholder="mail.rotibakarngeunah.my.id"
          />
          <Field
            label="SMTP Port"
            id="smtp_port"
            type="number"
            value={settings.smtp_port}
            onChange={(e) => set('smtp_port', e.target.value)}
            placeholder="587"
          />
        </div>
        <Field
          label="Username SMTP"
          id="smtp_user"
          value={settings.smtp_user}
          onChange={(e) => set('smtp_user', e.target.value)}
          placeholder="noreply@rotibakarngeunah.my.id"
        />
        <div className="mb-4">
          <label htmlFor="smtp_pass" className="label">Password SMTP</label>
          <div className="relative">
            <input
              id="smtp_pass"
              type={showSmtpPass ? 'text' : 'password'}
              className="input pr-16"
              value={settings.smtp_pass || ''}
              onChange={(e) => set('smtp_pass', e.target.value)}
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowSmtpPass(!showSmtpPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
            >
              {showSmtpPass ? 'Sembunyikan' : 'Tampilkan'}
            </button>
          </div>
        </div>
        <Field
          label="Email Pengirim (From)"
          id="smtp_from"
          type="email"
          value={settings.smtp_from}
          onChange={(e) => set('smtp_from', e.target.value)}
          placeholder="noreply@rotibakarngeunah.my.id"
        />
        <button
          onClick={handleTestSMTP}
          disabled={testing}
          className="btn-secondary text-sm mt-2"
        >
          {testing ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Mengirim test email...
            </span>
          ) : (
            '📨 Kirim Email Test'
          )}
        </button>
        <p className="text-xs text-gray-400 mt-2">
          Pastikan semua field SMTP diisi sebelum klik test. Email test akan dikirim ke alamat admin.
        </p>
      </Section>

      {/* WhatsApp */}
      <Section title="💬 Konfigurasi WhatsApp">
        <Field
          label="Teks Penutup Pesan WA"
          id="wa_greeting_text"
          type="textarea"
          value={settings.wa_greeting_text}
          onChange={(e) => set('wa_greeting_text', e.target.value)}
          placeholder="Mohon konfirmasi ketersediaan. Terima kasih 🙏"
          hint="Teks ini akan ditampilkan di bagian bawah setiap pesan WhatsApp yang dikirim ke supplier."
        />
      </Section>

      <div className="flex justify-end mt-2">
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? 'Menyimpan...' : '💾 Simpan Semua'}
        </button>
      </div>

      {/* Roti Tawar Auto-Calc Config */}
      <Section title="🍞 Konfigurasi Roti Tawar Auto-Calc">
        <RotiTawarConfig />
      </Section>
    </div>
  );
}
