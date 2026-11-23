import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  onReconnect: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
  }

  private handleReconnectClick = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReconnect();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 text-center bg-slate-950 text-slate-100">
          <div className="max-w-md w-full bg-slate-900 border border-rose-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col items-center">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4">
              <AlertCircle size={30} />
            </div>
            <h2 className="text-xl font-bold mb-2 text-rose-200">Table Interrupted</h2>
            <p className="text-xs text-slate-400 mb-6">
              A temporary display error was caught. Tap Reconnect to clear table state and restore your active seat in the match.
            </p>
            <button
              onClick={this.handleReconnectClick}
              className="py-3 px-6 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-sm tracking-wide shadow-lg flex items-center gap-2 transition active:scale-95"
            >
              <RotateCcw size={16} />
              <span>Reconnect</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
