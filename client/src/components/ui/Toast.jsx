export default function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div
      role="status"
      className={`fixed top-4 right-4 z-[70] flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg text-white text-sm max-w-sm ${
        toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'
      }`}
    >
      <span className="flex-1">{toast.msg}</span>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup notifikasi"
          className="flex-shrink-0 -mr-1 font-bold leading-none text-white/80 hover:text-white"
        >
          ×
        </button>
      )}
    </div>
  );
}
