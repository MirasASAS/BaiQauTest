import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, BellOff, Download, Loader2, Smartphone } from 'lucide-react';
import { useLanguage, getPushState, enablePushReminders, disablePushReminders, type PushState } from '@baiqautest/shared';
import { useInstallPrompt, isIos, isStandalone } from '../lib/pwa';

// Карточка профиля: установка приложения на телефон и напоминания про серию.
// Если показать нечего (браузер ничего не поддерживает и приложение уже установлено), её нет.
export function AppSettingsCard() {
  const { language } = useLanguage();
  const { t } = useTranslation('retention');
  const { canInstall, install } = useInstallPrompt();
  const [pushState, setPushState] = useState<PushState>('unsupported');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getPushState().then(state => { if (active) setPushState(state); });
    return () => { active = false; };
  }, []);

  async function togglePush() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (pushState === 'on') {
        await disablePushReminders();
        setPushState('off');
      } else {
        setPushState(await enablePushReminders(language));
      }
    } catch (err) {
      console.error('Error switching reminders:', err);
      setError(t('remindersError'));
    }
    setBusy(false);
  }

  const showIosHint = isIos() && !isStandalone();
  const showPush = pushState !== 'unsupported';
  if (!canInstall && !showIosHint && !showPush) return null;

  return (
    <div className="card p-6 mt-6 space-y-5">
      <div className="flex items-center gap-2">
        <Smartphone className="w-5 h-5 text-[#2563eb]" />
        <h2 className="text-xl font-bold text-gray-900">{t('appTitle')}</h2>
      </div>

      {(canInstall || showIosHint) && (
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-gray-900">{t('installTitle')}</p>
            <p className="text-sm text-gray-500 mt-0.5">{t(canInstall ? 'installDesc' : 'installIosHint')}</p>
          </div>
          {canInstall && (
            <button
              onClick={install}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#2563eb] hover:bg-[#1e3a8a] text-white font-medium rounded-xl flex-shrink-0"
            >
              <Download className="w-4 h-4" />
              {t('installButton')}
            </button>
          )}
        </div>
      )}

      {showPush && (
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-gray-900">{t('remindersTitle')}</p>
            <p className="text-sm text-gray-500 mt-0.5">
              {t(pushState === 'denied' ? 'remindersDenied' : 'remindersDesc')}
            </p>
            {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
          </div>
          {pushState !== 'denied' && (
            <button
              onClick={togglePush}
              disabled={busy}
              aria-pressed={pushState === 'on'}
              className={`flex items-center gap-2 px-5 py-2.5 font-medium rounded-xl flex-shrink-0 disabled:opacity-50 ${
                pushState === 'on'
                  ? 'bg-green-50 border border-green-200 text-green-700 hover:bg-green-100'
                  : 'bg-white border border-gray-200 text-gray-700 hover:border-[#2563eb] hover:text-[#2563eb]'
              }`}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : pushState === 'on' ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
              {t(pushState === 'on' ? 'remindersOn' : 'remindersEnable')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
