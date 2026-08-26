import { Component, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || String(error) };
  }

  componentDidCatch(error: Error) {
    console.error('Page error:', error);
  }

  handleReload = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-md mx-auto mt-16 p-8 bg-white rounded-2xl border border-red-100 shadow-sm text-center">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Бет ашылмады / Страница не открылась</h2>
          <p className="text-gray-500 text-sm mb-6 break-words">{this.state.message}</p>
          <button
            onClick={this.handleReload}
            className="px-6 py-2.5 bg-[#2563eb] hover:bg-[#1e3a8a] text-white font-medium rounded-xl transition-colors"
          >
            Қайталау / Попробовать снова
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
