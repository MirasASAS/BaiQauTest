import { useEffect, useState } from 'react';

// Установка приложения на телефон (PWA).
// Событие beforeinstallprompt приходит один раз и раньше, чем монтируется React,
// поэтому ловим его на уровне модуля (registerPwa вызывается из main.tsx).

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

export function registerPwa() {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
  // В режиме разработки service worker мешал бы горячей перезагрузке
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(err => console.error('Service worker registration failed:', err));
    });
  }
}

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

// На iPhone и iPad кнопки установки нет: приложение добавляют через «Поделиться → На экран „Домой“»
export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function useInstallPrompt(): { canInstall: boolean; install: () => Promise<void> } {
  const [canInstall, setCanInstall] = useState(deferredPrompt !== null);

  useEffect(() => {
    const update = () => setCanInstall(deferredPrompt !== null);
    listeners.add(update);
    update();
    return () => { listeners.delete(update); };
  }, []);

  async function install() {
    const prompt = deferredPrompt;
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    // браузер разрешает показать окно установки только один раз
    deferredPrompt = null;
    notify();
  }

  return { canInstall, install };
}
