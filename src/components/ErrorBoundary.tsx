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
    console.error('Arcane Library ErrorBoundary caught:', error, info.componentStack);
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
      <div className="min-h-screen flex items-center justify-center bg-[#0d0b1a] text-slate-100 px-4">
        <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-slate-900/90 p-6 shadow-2xl">
          <div className="flex items-center gap-3 text-rose-400">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/15">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-100">Giao diện gặp sự cố</h1>
              <p className="text-xs text-slate-400">Dữ liệu thư viện của bạn vẫn an toàn.</p>
            </div>
          </div>

          <p className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 px-3.5 py-2.5 text-sm text-rose-200 break-words">
            {this.state.errorMessage}
          </p>

          <div className="mt-5 flex items-center gap-2.5">
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
            >
              <RotateCcw className="h-4 w-4" />
              Tải lại trang
            </button>
            <button
              type="button"
              onClick={this.handleReset}
              className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors"
            >
              Thử khôi phục
            </button>
          </div>
        </div>
      </div>
    );
  }
}
