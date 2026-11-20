import { AlertTriangle, RotateCcw } from 'lucide-react';

interface PdfReaderFallbackProps {
  errorMessage: string;
  onClose: () => void;
}

export function PdfReaderFallback({ errorMessage, onClose }: PdfReaderFallbackProps) {
  return (
    <div className="theme-canvas flex h-[calc(100vh-3.25rem)] items-center justify-center p-6 text-ink">
      <div className="moonlit-card w-full max-w-md rounded-2xl border border-line bg-surface p-6 text-center shadow-sm">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-red-700/20 bg-red-500/10 text-red-700 dark:border-red-400/25 dark:text-red-300">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <h2 className="mt-3 font-display text-base font-semibold text-ink">
          Không thể tải trình đọc PDF
        </h2>
        <p className="mt-1.5 break-words text-xs text-ink-muted">{errorMessage}</p>
        <div className="mt-5 flex items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
          >
            <RotateCcw className="h-4 w-4" />
            Tải lại trang
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-line-strong bg-surface px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-subtle"
          >
            Đóng sách
          </button>
        </div>
      </div>
    </div>
  );
}
