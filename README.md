# Байқау тест (BaiQAUTest)

Платформа подготовки к ЕНТ/ҰБТ: ученик проходит тесты по предметам, админ ведёт банк
вопросов и импортирует их из файлов с помощью ИИ. Интерфейс на казахском и русском.

Подробное устройство — в [ARCHITECTURE.md](ARCHITECTURE.md).

## Состав

| Папка | Что это |
|-------|---------|
| `apps/student` | приложение ученика |
| `apps/admin` | админ-панель |
| `packages/shared` | общий код (Supabase, авторизация, i18n, API) |
| `supabase` | SQL-схема и Edge Functions |

## Запуск локально

```bash
npm install
cp apps/student/.env.example apps/student/.env   # вписать VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY
cp apps/admin/.env.example apps/admin/.env
npm run dev            # ученик
npm run dev:admin      # админка
```

## Настройка Supabase

1. В SQL Editor выполнить по порядку файлы `supabase/00_…sql` — `supabase/13_…sql`.
2. Задеплоить функции и задать ключи ИИ:
   ```bash
   supabase functions deploy ai-chat
   supabase functions deploy ai-import
   supabase secrets set GEMINI_API_KEY=... DEEPSEEK_API_KEY=...
   ```
3. Первый зарегистрированный пользователь автоматически становится админом.

Необязательные возможности (без них приложение работает, соответствующие кнопки просто не показываются):

- **Вход через Google / по телефону** — включить провайдер в Authentication → Providers
  (для Google нужен OAuth-клиент, для телефона — SMS-провайдер) и добавить адрес сайта в
  Authentication → URL Configuration. Кнопки входа появятся сами.
- **Push-напоминания про серию** — создать ключи `npx web-push generate-vapid-keys`, публичный
  записать в `VITE_VAPID_PUBLIC_KEY` приложения ученика, затем:
  ```bash
  supabase functions deploy send-reminders --no-verify-jwt
  supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com CRON_SECRET=...
  ```
  и включить расписание — блок в конце `supabase/13_retention.sql`.

Ключи ИИ хранятся только в секретах Supabase — в `.env` приложений их быть не должно.

## Проверки

```bash
npm run typecheck:student
npm run typecheck:admin
npm run test:admin
npm run build:student
npm run build:admin
```
