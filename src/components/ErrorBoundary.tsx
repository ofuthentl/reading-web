import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Đã xảy ra lỗi hiển thị không mong muốn.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Ofu's Library ErrorBoundary caught:", error, info.componentStack);
  }

  private handleReset = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-4 text-ink transition-colors duration-200">
        <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-700/20 bg-red-500/10 text-red-700 dark:border-red-400/25 dark:text-red-300">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-base font-semibold text-ink">Giao diện gặp sự cố</h1>
              <p className="text-xs text-ink-muted">Dữ liệu thư viện của bạn vẫn an toàn.</p>
            </div>
          </div>

          <p className="mt-4 break-words rounded-xl border border-line bg-subtle px-3.5 py-2.5 text-sm text-red-800 dark:text-red-300">
            {this.state.errorMessage}
          </p>

          <div className="mt-5 flex items-center gap-2.5">
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
            >
              <RotateCcw className="h-4 w-4" />
              Tải lại trang
            </button>
            <button
              type="button"
              onClick={this.handleReset}
              className="rounded-xl border border-line-strong bg-surface px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-subtle"
            >
              Thử khôi phục
            </button>
          </div>
        </div>
      </div>
    );
  }
}
