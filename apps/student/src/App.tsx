import { useState } from 'react';
import { AuthProvider, useAuth, LanguageProvider, ErrorBoundary } from '@baiqautest/shared';
import { SidebarProvider } from './context/SidebarContext';
import { AuthPage } from './components/AuthPage';
import { MainLayout } from './components/MainLayout';
import { ProfilePage } from './components/ProfilePage';
import { HistoryPage } from './components/HistoryPage';
import { TestsPage } from './components/TestsPage';
import { AIChatPage } from './components/AIChatPage';

function AppContent() {
  const { user, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState('tests');

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
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
