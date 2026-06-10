import useModalDismiss from './useModalDismiss';

/**
 * Dialog konfirmasi pengganti window.confirm().
 *
 * Props:
 * - title, children (isi pesan)
 * - confirmLabel  (default "Ya, Lanjutkan")
 * - cancelLabel   (default "Batal")
 * - danger        (true = tombol merah untuk aksi destruktif)
 * - loading       (true = tombol konfirmasi menampilkan teks proses & disabled)
 * - loadingLabel  (default "Memproses...")
 * - onConfirm, onCancel
 */
export default function ConfirmDialog({
  title,
  children,
  confirmLabel = 'Ya, Lanjutkan',
  cancelLabel = 'Batal',
  danger = false,
  loading = false,
  loadingLabel = 'Memproses...',
  onConfirm,
  onCancel,
}) {
  useModalDismiss(loading ? undefined : onCancel);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={() => !loading && onCancel?.()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
        <div className="text-sm text-gray-500 mb-6">{children}</div>
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onCancel} disabled={loading} className="btn-outline text-sm">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            autoFocus
            className={`px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-500 hover:bg-orange-600'
            }`}
          >
            {loading ? loadingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
