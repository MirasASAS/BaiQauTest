import { ReactNode, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, History, FileQuestion, LogOut, Menu, X, Check, Bot, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { useAuth } from '@baiqautest/shared';
import { useLanguage } from '@baiqautest/shared';
import { LanguageSwitcher } from '@baiqautest/shared';
import { useSidebar } from '../context/SidebarContext';

interface MainLayoutProps {
  children: ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
}

export function MainLayout({ children, currentPage, onNavigate }: MainLayoutProps) {
  const { signOut, profile } = useAuth();
  const { t } = useLanguage();
  const { collapsed, setCollapsed } = useSidebar();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const fullName = [profile?.last_name, profile?.first_name, profile?.middle_name].filter(Boolean).join(' ');

  const menuItems = [
    { id: 'profile', label: t('profile'), icon: User },
    { id: 'history', label: t('history'), icon: History },
    { id: 'tests', label: t('tests'), icon: FileQuestion },
    { id: 'ai', label: t('aiAssistant'), icon: Bot },
  ];

  async function handleSignOut() {
    setShowLogoutModal(true);
  }

  async function confirmSignOut() {
    setShowLogoutModal(false);
    await signOut();
  }

  return (
    <div className="min-h-screen bg-slate-50 overflow-x-hidden">
      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-[60] bg-[#1e293b] px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 rounded-lg hover:bg-white/10 transition-colors"
        >
          {sidebarOpen ? <X className="w-5 h-5 text-white" /> : <Menu className="w-5 h-5 text-white" />}
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#2563eb] rounded-lg flex items-center justify-center">
            <Check className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-white">BaiQAUTest</span>
        </div>
        <LanguageSwitcher />
      </div>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Desktop toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="hidden lg:flex fixed top-4 z-[60] items-center justify-center w-9 h-9 rounded-xl bg-white shadow-md border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50"
        style={{ left: collapsed ? 16 : 292 }}
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>

      {/* Fixed top-right tools (desktop) */}
      <div className="hidden lg:flex fixed top-4 right-4 z-50 items-center gap-1 bg-white rounded-xl shadow-md border border-gray-200 px-2 py-1.5">
        <LanguageSwitcher />
        <button
          onClick={() => window.location.reload()}
          className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          title={t('logout')}
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 bottom-0 w-72 bg-[#1e293b] z-50 transform transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'lg:-translate-x-full' : 'lg:translate-x-0'}`}
      >
        <div className="relative flex flex-col h-full">
          {/* Mobile close button */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden absolute top-3 right-3 p-2 rounded-lg text-blue-200 hover:bg-white/10 hover:text-white transition-colors"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Logo */}
          <div className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-[#2563eb] rounded-xl flex items-center justify-center shadow-lg">
                <Check className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-white text-xl">BaiQAUTest</h1>
                <p className="text-xs text-blue-200">{t('appSubtitle')}</p>
              </div>
            </div>
          </div>

          {/* User info */}
          <div className="px-4 pb-4">
            <div className="bg-white/10 rounded-2xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-[#2563eb] flex items-center justify-center">
                  <User className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white truncate">
                    {fullName || t('student')}
                  </p>
                  <p className="text-xs text-blue-200 truncate">
                    {profile?.role === 'admin' ? t('admin') : t('student')}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-2">
            <div className="space-y-1">
              {menuItems.map(item => {
                const Icon = item.icon;
                const isActive = currentPage === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onNavigate(item.id);
                      setSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-[#2563eb] text-white shadow-lg'
                        : 'text-blue-100 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-blue-300'}`} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Bottom section */}
          <div className="p-4 border-t border-white/10">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-300 hover:bg-red-500/20 hover:text-red-200 transition-colors"
            >
              <LogOut className="w-5 h-5" />
              {t('logout')}
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className={`${collapsed ? 'lg:ml-0' : 'lg:ml-72'} min-h-screen pt-14 lg:pt-0 transition-[margin-left] duration-300`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={currentPage}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="p-6 lg:p-8"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Logout confirmation modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">{t('logoutConfirmTitle')}</h3>
            <p className="text-sm text-gray-500 mb-6">{t('logoutConfirmDesc')}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLogoutModal(false)}
                className="flex-1 py-2.5 border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium rounded-xl transition-colors"
              >
                {t('stayLoggedIn')}
              </button>
              <button
                onClick={confirmSignOut}
                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white font-medium rounded-xl transition-colors"
              >
                {t('logout')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
