import { useState } from 'react';

export default function MitraLogin({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let res;
      try {
        res = await fetch('/api/mitra-auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
      } catch {
        throw new Error('Tidak dapat terhubung ke server. Periksa koneksi internet Anda lalu coba lagi.');
      }
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) throw new Error('Username atau password salah.');
      if (!res.ok) throw new Error(data.error || 'Login gagal. Coba lagi sebentar lagi.');

      localStorage.setItem('rbn_token', data.token);
      localStorage.setItem('rbn_role', 'mitra');
      localStorage.setItem('rbn_mitra', JSON.stringify(data.mitra));
      onLogin();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-brand-red to-brand-orange px-8 py-8 text-center">
            <img
              src="https://staff-portal.rotibakarngeunah.my.id/wp-content/uploads/2026/05/cropped-Untitled-2.png"
              alt="Roti Bakar Ngeunah"
              className="w-20 h-20 mx-auto rounded-2xl object-contain bg-white p-2 shadow-md mb-4"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <h1 className="text-white font-bold text-xl">Roti Bakar Ngeunah</h1>
            <p className="text-red-100 text-sm mt-1">Portal Mitra — Pembelian Bahan Baku</p>
          </div>

          <div className="px-8 py-6">
            <h2 className="text-gray-800 font-semibold text-lg mb-5 text-center">Login Mitra</h2>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="label">Username</label>
                <input
                  type="text"
                  className="input"
                  placeholder="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <div>
                <label className="label">Password</label>
                <input
                  type="password"
                  className="input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-brand-red text-white py-2.5 rounded-lg font-semibold hover:bg-red-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Memuat...
                  </span>
                ) : (
                  'Masuk'
                )}
              </button>
            </form>
            <p className="text-center text-gray-400 text-xs mt-5">
              Belum punya akun? Hubungi Admin untuk didaftarkan.
            </p>
          </div>
        </div>

        <p className="text-center text-gray-400 text-xs mt-6">
          © 2026 Roti Bakar Ngeunah. All rights reserved.
        </p>
      </div>
    </div>
  );
}
