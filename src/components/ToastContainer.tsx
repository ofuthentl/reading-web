import { createPortal } from 'react-dom';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import type { ToastItem, ToastType } from '@/hooks/useToast';

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

const STYLE_BY_TYPE: Record<
  ToastType,
  { container: string; iconClass: string; Icon: typeof Info }
> = {
  success: {
    container:
      'border-emerald-800/20 bg-surface text-ink dark:border-emerald-400/25',
    iconClass: 'text-emerald-700 dark:text-emerald-400',
    Icon: CheckCircle2,
  },
  error: {
    container:
      'border-red-800/25 bg-surface text-ink dark:border-red-400/30',
    iconClass: 'text-red-700 dark:text-red-400',
    Icon: AlertCircle,
  },
  warning: {
    container:
      'border-amber-700/30 bg-surface text-ink dark:border-amber-400/30',
    iconClass: 'text-amber-700 dark:text-amber-400',
    Icon: AlertTriangle,
  },
  info: {
    container: 'border-line-strong bg-surface text-ink',
    iconClass: 'text-accent',
    Icon: Info,
  },
};

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0 || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[90] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const { container, iconClass, Icon } = STYLE_BY_TYPE[toast.type];
        return (
          <div
            key={toast.id}
            role={toast.type === 'error' ? 'alert' : 'status'}
            className={`moonlit-card pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-3 shadow-lg fade-in ${container}`}
          >
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconClass}`} />
            <div className="flex-1 break-words text-sm leading-snug">
              <p>{toast.message}</p>
              {toast.action && (
                <button
                  type="button"
                  onClick={() => {
                    toast.action?.onClick();
                    onDismiss(toast.id);
                  }}
                  className="mt-2 inline-flex items-center rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
                >
                  {toast.action.label}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Đóng thông báo"
              className="rounded-lg p-1 text-ink-faint transition-colors hover:bg-subtle hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
