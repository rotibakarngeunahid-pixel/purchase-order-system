import { ArrowRight, Loader2 } from 'lucide-react';
import SaveStatus from './SaveStatus';

export default function OrderEntryHeader({
  orderDate,
  onDateChange,
  onTomorrowClick,
  isReadOnly,
  session,
  statusLabel,
  statusClass,
  saveStatus,
  saveError,
  calculating,
  onReview,
}) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">Input Order</h1>
        <p className="page-subtitle">Isi permintaan bahan baku per outlet</p>
      </div>
      <div className="page-actions">
        <SaveStatus status={saveStatus} error={saveError} />
        {session && (
          <span className={statusClass[session.status] || 'badge-draft'}>
            {statusLabel[session.status] || session.status}
          </span>
        )}
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={orderDate}
            onChange={onDateChange}
            disabled={isReadOnly}
            className="input w-auto text-sm"
          />
          {!isReadOnly && (
            <button
              type="button"
              title="Set tanggal ke besok"
              onClick={onTomorrowClick}
              className="px-3 py-2 text-xs font-medium rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-orange-50 hover:border-brand-orange hover:text-brand-orange transition-colors"
            >
              Besok
            </button>
          )}
        </div>
        <button
          onClick={onReview}
          disabled={calculating || !session || saveStatus === 'saving'}
          className="btn-primary text-sm"
        >
          {calculating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Memproses...
            </>
          ) : (
            <>
              <ArrowRight className="w-4 h-4" />
              Review Order
            </>
          )}
        </button>
      </div>
    </div>
  );
}
