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

1. В SQL Editor выполнить по порядку файлы `supabase/00_…sql` — `supabase/11_…sql`.
2. Задеплоить функции и задать ключи ИИ:
   ```bash
   supabase functions deploy ai-chat
   supabase functions deploy ai-import
   supabase secrets set GEMINI_API_KEY=... DEEPSEEK_API_KEY=...
   ```
3. Первый зарегистрированный пользователь автоматически становится админом.

Ключи ИИ хранятся только в секретах Supabase — в `.env` приложений их быть не должно.

## Проверки

```bash
npm run typecheck:student
npm run typecheck:admin
npm run test:admin
npm run build:student
npm run build:admin
```
