// Админ-приложение: логин → проверка роли → AdminPage.
// RLS/триггеры Supabase не трогаем — это только UX-слой поверх защиты.
import { AuthProvider, LanguageProvider, useAuth, useLanguage } from '@baiqautest/shared';
import { AdminPage } from './AdminPage';
import AdminAuthPage from './AdminAuthPage';

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#2563eb]" />
    </div>
  );
}

function ForbiddenScreen() {
  const { signOut, profile } = useAuth();
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="card max-w-md w-full p-8 text-center">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
          <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7 text-red-500" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">{t('accessDenied')}</h1>
        <p className="text-gray-500 text-sm mb-2">
          {t('accessDeniedDesc')}
        </p>
        {profile && (
          <p className="text-xs text-gray-400 mb-6">
            {t('signedInAs')}: {profile.email || profile.first_name}
          </p>
        )}
        <button
          onClick={signOut}
          className="w-full py-2.5 bg-[#2563eb] hover:bg-[#1e3a8a] text-white font-medium rounded-xl transition-all"
        >
          {t('logout')}
        </button>
      </div>
    </div>
  );
}

function AdminGate() {
  const { user, profile, loading } = useAuth();

  // Пока сессия грузится ИЛИ профиль ещё подтягивается — показываем загрузку,
  // чтобы админа не мигнула страница «Доступ запрещён».
  const ready = !loading && (!user || !!profile);

  if (!ready) return <LoadingScreen />;
  if (!user) return <AdminAuthPage />;
  if (profile!.role !== 'admin') return <ForbiddenScreen />;
  return <AdminPage />;
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <AdminGate />
      </AuthProvider>
    </LanguageProvider>
  );
}