// Общий код для student и admin приложений.
export * from './types';
export { supabase } from './supabase';
export * from './api';
export * from './lib/localStorage';
export * from './lib/aiService';
export * from './lib/subjects';
export { AuthProvider, useAuth } from './context/AuthContext';
export { LanguageProvider, useLanguage } from './i18n/LanguageContext';
export { LanguageSwitcher } from './i18n/LanguageSwitcher';
export { ErrorBoundary } from './components/ErrorBoundary';
export { default as i18n } from './i18n';
export { default } from './i18n';
export type { Language } from './i18n/translations';
export { translations } from './i18n/translations';