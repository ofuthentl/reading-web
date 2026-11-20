import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import type { ToastItem, ToastType } from '@/hooks/useToast';

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

const STYLE_BY_TYPE: Record<ToastType, { container: string; iconClass: string; Icon: typeof Info }> = {
  success: {
    container: 'border-emerald-200 bg-white text-stone-800',
    iconClass: 'text-emerald-600',
    Icon: CheckCircle2,
  },
  error: {
    container: 'border-red-200 bg-white text-stone-800',
    iconClass: 'text-red-600',
    Icon: AlertCircle,
  },
  warning: {
    container: 'border-amber-200 bg-amber-50/95 text-amber-950',
    iconClass: 'text-amber-600',
    Icon: AlertTriangle,
  },
  info: {
    container: 'border-stone-200 bg-white text-stone-800',
    iconClass: 'text-stone-600',
    Icon: Info,
  },
};

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const { container, iconClass, Icon } = STYLE_BY_TYPE[toast.type];
        return (
          <div
            key={toast.id}
            role={toast.type === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-3 shadow-lg fade-in ${container}`}
          >
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconClass}`} />
            <p className="flex-1 text-sm leading-snug break-words">{toast.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Đóng thông báo"
              className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
