import { useState } from 'react';
import { Lock, ArrowRight } from 'lucide-react';
import { AuthProvider, useAuth, useLanguage, LanguageProvider, ErrorBoundary } from '@baiqautest/shared';
import { SidebarProvider } from './context/SidebarContext';
import { AuthPage } from './components/AuthPage';
import { MainLayout } from './components/MainLayout';
import { ProfilePage } from './components/ProfilePage';
import { HistoryPage } from './components/HistoryPage';
import { TestsPage } from './components/TestsPage';
import { AIChatPage } from './components/AIChatPage';

function ResetPasswordForm() {
  const { updatePassword } = useAuth();
  const { t } = useLanguage();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    if (password.length < 6) {
      setError(t('passwordTooShort'));
      return;
    }
    if (password !== confirm) {
      setError(t('passwordsDontMatch'));
      return;
    }
    setLoading(true);
    const { error } = await updatePassword(password);
    setLoading(false);
    if (error) {
      setError(error.message || t('passwordUpdateError'));
    }
    // При успехе флаг passwordRecovery сбрасывается в AuthContext — приложение откроется само
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
          <div className="bg-[#1e3a8a] px-8 py-8 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-[#2563eb] rounded-2xl mb-4 shadow-lg">
              <Lock className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">{t('recoveryTitle')}</h1>
          </div>
          <div className="p-6">
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl">
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('newPassword')}</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb] transition-colors bg-gray-50"
                    placeholder="6+"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('confirmNewPassword')}</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="password"
                    required
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb] transition-colors bg-gray-50"
                    placeholder="6+"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-[#2563eb] hover:bg-[#1e3a8a] text-white font-medium py-3 rounded-xl transition-colors disabled:opacity-50"
              >
                {loading ? '...' : t('updatePasswordButton')}
                {!loading && <ArrowRight className="w-4 h-4" />}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

function AppContent() {
  const { user, loading, passwordRecovery } = useAuth();
  const [currentPage, setCurrentPage] = useState('tests');

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (passwordRecovery) {
    return <ResetPasswordForm />;
  }

  if (!user) {
    return <AuthPage />;
  }

  function renderPage() {
    switch (currentPage) {
      case 'profile':
        return <ProfilePage />;
      case 'history':
        return <HistoryPage onNavigate={setCurrentPage} />;
      case 'tests':
        return <TestsPage />;
      case 'ai':
        return <AIChatPage />;

      default:
        return <ProfilePage />;
    }
  }

  return (
    <MainLayout currentPage={currentPage} onNavigate={setCurrentPage}>
      <ErrorBoundary key={currentPage}>
        {renderPage()}
      </ErrorBoundary>
    </MainLayout>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <SidebarProvider>
          <AppContent />
        </SidebarProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}
