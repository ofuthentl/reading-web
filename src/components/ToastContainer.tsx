import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import type { ToastItem, ToastType } from '@/hooks/useToast';

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

const STYLE_BY_TYPE: Record<ToastType, { border: string; iconClass: string; Icon: typeof Info }> = {
  success: {
    border: 'border-emerald-500/35 bg-slate-900/95 text-emerald-100',
    iconClass: 'text-emerald-400',
    Icon: CheckCircle2,
  },
  error: {
    border: 'border-rose-500/40 bg-slate-900/95 text-rose-100',
    iconClass: 'text-rose-400',
    Icon: AlertCircle,
  },
  warning: {
    border: 'border-amber-500/40 bg-slate-900/95 text-amber-100',
    iconClass: 'text-amber-400',
    Icon: AlertTriangle,
  },
  info: {
    border: 'border-indigo-500/35 bg-slate-900/95 text-slate-100',
    iconClass: 'text-indigo-400',
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
        const { border, iconClass, Icon } = STYLE_BY_TYPE[toast.type];
        return (
          <div
            key={toast.id}
            role={toast.type === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-3 shadow-xl backdrop-blur fade-in ${border}`}
          >
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconClass}`} />
            <p className="flex-1 text-sm leading-snug break-words">{toast.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Đóng thông báo"
              className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
