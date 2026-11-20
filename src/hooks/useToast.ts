import { useCallback, useEffect, useRef, useState } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export type ToastItem = {
  id: string;
  type: ToastType;
  message: string;
};

const MAX_TOASTS = 5;

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());

  const dismissToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, type: ToastType = 'info', durationMs?: number) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const timeout = durationMs ?? (type === 'error' ? 6000 : 4000);

      setToasts((prev) => {
        const next = [...prev, { id, type, message }];
        if (next.length > MAX_TOASTS) {
          const removed = next.shift();
          if (removed) {
            const oldTimer = timersRef.current.get(removed.id);
            if (oldTimer !== undefined) {
              window.clearTimeout(oldTimer);
              timersRef.current.delete(removed.id);
            }
          }
        }
        return next;
      });

      if (timeout > 0) {
        const timer = window.setTimeout(() => {
          timersRef.current.delete(id);
          setToasts((prev) => prev.filter((item) => item.id !== id));
        }, timeout);
        timersRef.current.set(id, timer);
      }
    },
    [],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) {
        window.clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  return { toasts, addToast, dismissToast };
}
