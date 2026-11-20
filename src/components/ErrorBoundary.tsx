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
      <div className="min-h-screen flex items-center justify-center bg-stone-50 text-stone-800 px-4">
        <div className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-stone-900">Giao diện gặp sự cố</h1>
              <p className="text-xs text-stone-500">Dữ liệu thư viện của bạn vẫn an toàn.</p>
            </div>
          </div>

          <p className="mt-4 rounded-lg border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm text-red-700 break-words">
            {this.state.errorMessage}
          </p>

          <div className="mt-5 flex items-center gap-2.5">
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-stone-800 transition-colors"
            >
              <RotateCcw className="h-4 w-4" />
              Tải lại trang
            </button>
            <button
              type="button"
              onClick={this.handleReset}
              className="rounded-lg border border-stone-300 px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-100 transition-colors"
            >
              Thử khôi phục
            </button>
          </div>
        </div>
      </div>
    );
  }
}
