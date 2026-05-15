import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export default function SaveStatus({ status, error }) {
  if (status === 'idle') return null;

  if (status === 'saving') return (
    <span className="flex items-center gap-1.5 text-xs text-gray-400 animate-pulse">
      <Loader2 className="w-3 h-3 animate-spin" />
      Menyimpan...
    </span>
  );

  if (status === 'saved') return (
    <span className="flex items-center gap-1.5 text-xs text-green-600">
      <CheckCircle2 className="w-3 h-3" />
      Tersimpan
    </span>
  );

  if (status === 'error') return (
    <span className="flex items-center gap-1.5 text-xs text-red-600" title={error}>
      <AlertCircle className="w-3 h-3" />
      Gagal menyimpan
    </span>
  );

  return null;
}
