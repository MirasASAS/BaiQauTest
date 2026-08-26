import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { supabase } from '../supabase';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const lang = i18n.language === 'kz' ? 'kz' : 'ru';

  const toggle = () => {
    const next = lang === 'ru' ? 'kz' : 'ru';
    i18n.changeLanguage(next);
    localStorage.setItem('language', next);

    // Сохранить выбор языка в профиле (если пользователь вошёл)
    supabase.auth.getSession().then(({ data }) => {
      const userId = data?.session?.user?.id;
      if (userId) {
        supabase
          .from('profiles')
          .update({ preferred_lang: next, updated_at: new Date().toISOString() })
          .eq('id', userId)
          .then(() => {});
      }
    });
  };

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all"
      aria-label="Switch language"
    >
      <Globe className="w-4 h-4" />
      <span className="font-bold">{lang === 'ru' ? 'ҚАЗ' : 'РУС'}</span>
    </button>
  );
}
