// BaiQAU — напоминания про серию (Edge Function)
// Раз в день находит учеников, у которых серия оборвётся сегодня (вчера тест был,
// сегодня ещё нет), и отправляет им web-push на устройства с включёнными напоминаниями.
// Вызывается по расписанию (pg_cron, см. конец supabase/13_retention.sql), не из браузера.
// Deploy:  supabase functions deploy send-reminders --no-verify-jwt
// Secrets: supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... \
//            VAPID_SUBJECT=mailto:you@example.com CRON_SECRET=...
// Ключи VAPID: npx web-push generate-vapid-keys (публичный — ещё и в VITE_VAPID_PUBLIC_KEY сайта)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import webpush from 'npm:web-push@3.6.7';
import { jsonResponse, handleCors } from '../_shared/cors.ts';

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') || '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') || '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || '';
const CRON_SECRET = Deno.env.get('CRON_SECRET') || '';

interface Target {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  lang: 'kz' | 'ru';
  streak: number;
}

function message(target: Target): { title: string; body: string; url: string } {
  if (target.lang === 'ru') {
    return {
      title: `🔥 Серия ${target.streak} дн. — не прерывайте!`,
      body: 'Пройдите сегодня один тест, чтобы серия продолжилась.',
      url: '/tests',
    };
  }
  return {
    title: `🔥 ${target.streak} күндік серияңыз үзілмесін!`,
    body: 'Бүгін бір тест тапсырып, серияны жалғастырыңыз.',
    url: '/tests',
  };
}

// Сегодняшняя дата по Алматы в виде YYYY-MM-DD
function almatyToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Almaty' }).format(new Date());
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    if (!CRON_SECRET || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
      return jsonResponse({ error: 'send-reminders is not configured: set VAPID_* and CRON_SECRET secrets' }, 500);
    }
    // Функция открыта без JWT, поэтому её защищает общий секрет расписания
    if (req.headers.get('x-cron-secret') !== CRON_SECRET) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const admin = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
    const { data, error } = await admin.rpc('get_streak_reminder_targets');
    if (error) return jsonResponse({ error: error.message }, 500);

    const targets = (data || []) as Target[];
    const sent: number[] = [];
    const expired: number[] = [];
    let failed = 0;

    for (const target of targets) {
      try {
        await webpush.sendNotification(
          { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
          JSON.stringify(message(target)),
          { TTL: 6 * 60 * 60 },
        );
        sent.push(target.id);
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode;
        // 404 / 410 — подписки больше нет (приложение удалено или уведомления запрещены)
        if (status === 404 || status === 410) expired.push(target.id);
        else {
          failed++;
          console.error('push failed:', status, err instanceof Error ? err.message : String(err));
        }
      }
    }

    if (sent.length > 0) {
      const { error: markError } = await admin
        .from('push_subscriptions')
        .update({ last_reminded_on: almatyToday() })
        .in('id', sent);
      if (markError) console.error('mark reminded failed:', markError.message);
    }
    if (expired.length > 0) {
      const { error: deleteError } = await admin.from('push_subscriptions').delete().in('id', expired);
      if (deleteError) console.error('expired cleanup failed:', deleteError.message);
    }

    return jsonResponse({ targets: targets.length, sent: sent.length, expired: expired.length, failed });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Internal error' }, 500);
  }
});
