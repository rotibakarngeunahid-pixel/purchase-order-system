import { useEffect } from 'react';

// Perilaku standar modal: tombol Escape menutup (opsional) + kunci scroll body.
// - closeOnEscape=false untuk modal entri data besar agar ketikan user tidak
//   hilang karena tidak sengaja menekan Escape.
// - active=false untuk modal yang dirender inline/kondisional di dalam halaman
//   (hook tetap dipanggil di top level, efeknya hanya aktif saat modal tampil).
export default function useModalDismiss(onClose, { closeOnEscape = true, active = true } = {}) {
  useEffect(() => {
    if (!active) return undefined;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handler = (e) => {
      if (closeOnEscape && e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handler);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handler);
    };
  }, [onClose, closeOnEscape, active]);
}
