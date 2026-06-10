import { Component } from 'react';

// Tanpa ini, satu error render React membuat seluruh halaman jadi putih kosong.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Render error:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-sm w-full text-center">
          <p className="text-4xl mb-3">⚠️</p>
          <h1 className="font-bold text-gray-900 text-lg mb-1">Terjadi kesalahan</h1>
          <p className="text-sm text-gray-500 mb-5">
            Halaman gagal ditampilkan. Muat ulang untuk melanjutkan — data yang sudah tersimpan tidak hilang.
          </p>
          <button onClick={() => window.location.reload()} className="btn-primary text-sm w-full">
            Muat Ulang Halaman
          </button>
        </div>
      </div>
    );
  }
}
