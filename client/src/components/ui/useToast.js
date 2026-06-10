import { useCallback, useEffect, useRef, useState } from 'react';

// Toast dengan timer yang benar: toast baru me-reset timer toast lama,
// sehingga tidak tertutup lebih cepat oleh timer sebelumnya.
export default function useToast(duration = 4000) {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  const hideToast = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setToast(null);
  }, []);

  const showToast = useCallback((msg, type = 'success') => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ msg, type });
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setToast(null);
    }, duration);
  }, [duration]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return { toast, showToast, hideToast };
}
