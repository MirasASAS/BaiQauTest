import { supabase } from '../supabase';

// Всё, что возвращает ученика в приложение (SQL 13): победители недели,
// история ИИ-чата, push-напоминания, способы входа.

// ── Победители недели ────────────────────────────────────────────────

export interface WeekWinner {
  week_start: string;
  place: number;
  user_id: string;
  nickname: string;
  points: number;
}

// Топ-3 прошлой недели; пусто, если на прошлой неделе никто не сдавал тесты
export async function getLastWeekWinners(): Promise<WeekWinner[]> {
  const { data, error } = await supabase.rpc('get_last_week_winners');
  if (error) throw error;
  return data || [];
}

// ── История ИИ-чата ──────────────────────────────────────────────────

export interface AiChat {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface AiChatMessage {
  id: number;
  chat_id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

const MAX_STORED_MESSAGE_CHARS = 8000;

export async function listAiChats(limit = 30): Promise<AiChat[]> {
  const { data, error } = await supabase
    .from('ai_chats')
    .select('id, title, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function getAiChatMessages(chatId: number): Promise<AiChatMessage[]> {
  const { data, error } = await supabase
    .from('ai_chat_messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('id');
  if (error) throw error;
  return data || [];
}

export async function createAiChat(title: string): Promise<AiChat> {
  const { data, error } = await supabase
    .from('ai_chats')
    .insert({ title: title.trim().slice(0, 120) })
    .select('id, title, created_at, updated_at')
    .single();
  if (error) throw error;
  return data;
}

export async function addAiChatMessages(
  chatId: number,
  messages: { role: 'user' | 'assistant'; content: string }[],
): Promise<void> {
  const rows = messages
    .filter(m => m.content.trim())
    .map(m => ({ chat_id: chatId, role: m.role, content: m.content.slice(0, MAX_STORED_MESSAGE_CHARS) }));
  if (rows.length === 0) return;
  const { error } = await supabase.from('ai_chat_messages').insert(rows);
  if (error) throw error;
}

export async function deleteAiChat(chatId: number): Promise<void> {
  const { error } = await supabase.from('ai_chats').delete().eq('id', chatId);
  if (error) throw error;
}

// ── Push-напоминания ─────────────────────────────────────────────────

const VAPID_PUBLIC_KEY: string = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

// unsupported — браузер не умеет push или не задан VITE_VAPID_PUBLIC_KEY;
// denied — ученик запретил уведомления в настройках браузера
export type PushState = 'unsupported' | 'denied' | 'off' | 'on';

function pushSupported(): boolean {
  return !!VAPID_PUBLIC_KEY
    && typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    && typeof window !== 'undefined' && 'PushManager' in window && 'Notification' in window;
}

function urlBase64ToUint8Array(value: string): Uint8Array {
  const padded = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, ch => ch.charCodeAt(0));
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration();
  return registration ? registration.pushManager.getSubscription() : null;
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    return (await currentSubscription()) ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

// Спрашивает разрешение, подписывает устройство и сохраняет подписку на сервере
export async function enablePushReminders(language: 'kz' | 'ru'): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';

  const registration = await navigator.serviceWorker.ready;
  const subscription = (await registration.pushManager.getSubscription())
    ?? await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

  const json = subscription.toJSON();
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: subscription.endpoint,
    p_p256dh: json.keys?.p256dh ?? '',
    p_auth: json.keys?.auth ?? '',
    p_lang: language,
  });
  if (error) {
    // подписка без записи на сервере бесполезна — не оставляем её висеть
    await subscription.unsubscribe().catch(() => { /* ignore */ });
    throw error;
  }
  return 'on';
}

export async function disablePushReminders(): Promise<void> {
  if (!pushSupported()) return;
  const subscription = await currentSubscription();
  if (!subscription) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
  await subscription.unsubscribe();
}

// ── Способы входа ────────────────────────────────────────────────────

export interface AuthProviders {
  google: boolean;
  phone: boolean;
}

let providersPromise: Promise<AuthProviders> | null = null;

// Какие способы входа включены в проекте Supabase (Authentication → Providers).
// Кнопки входа показываются только для включённых, поэтому отдельная настройка сайта не нужна.
export function getAuthProviders(): Promise<AuthProviders> {
  if (!providersPromise) {
    providersPromise = (async () => {
      const url = import.meta.env.VITE_SUPABASE_URL;
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!url || !key) return { google: false, phone: false };
      try {
        const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
        if (!res.ok) return { google: false, phone: false };
        const settings = await res.json();
        return { google: !!settings?.external?.google, phone: !!settings?.external?.phone };
      } catch {
        return { google: false, phone: false };
      }
    })();
  }
  return providersPromise;
}
