# Байқау тест — Архитектура

Документ описывает текущую архитектуру приложения «Байқау тест» (BaiQAUTest).

## 1. Высокоуровневая схема

```
                          БАЙҚАУ ТЕСТ (React 18 + Vite + TS)
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         ↓                           ↓                           ↓
     ОҚУШЫ (student)            ADMIN (admin)                AI (импорт+чат)
    Dashboard/Тест/История    Банк сұрақ/Импорт/           DeepSeek (b.ai)
    Лидерборд/Streak/Бейдж    Пользователи/Статистика      → Gemini → Mock
         │                           │                           │
         └───────────────────────────┼───────────────────────────┘
                                     ↓
                           SUPABASE (Postgres + RLS)
                                     │
        ┌──────────────┬─────────────┼─────────────┬──────────────┐
        ↓              ↓             ↓             ↓              ↓
     Tables        RPC-функции   Triggers     Storage       Auth (email)
  profiles       is_admin()    handle_new_user  test-imports   Supabase Auth
  subjects       admin_list_users  make_first_user_admin  (файлы импорта)  │
  variants       admin_platform_stats auto_confirm_email    │
  questions      publish_import_questions protect_profile_fields  JWT + RLS
  results        get_leaderboard / get_my_rank  validate_result_score
  import_jobs    get_user_streak / get_user_badges
  import_questions
```

## 2. Фронтенд — структура (`src/`)

```
src/
├── App.tsx                      # state-based routing: profile/history/tests/ai/admin
├── components/
│   ├── MainLayout.tsx           # sidebar (navy, collapsible) + header + mobile drawer
│   ├── AuthPage.tsx             # login / register
│   ├── TestsPage.tsx            # ГЛАВНЫЙ: dashboard → variants → test(экзамен) → result
│   ├── HistoryPage.tsx          # тарих (дедупликация по варианту, фильтры)
│   ├── ProfilePage.tsx          # профиль + жетістіктер (бейджтер)
│   ├── AIChatPage.tsx           # ЖИ-чат (Gemini/DeepSeek)
│   ├── AdminPage.tsx            # админ: Банк/Импорт/Пользователи/Статистика/Настройки
│   └── admin/ImportAdmin.tsx    # импорт: drag&drop → прогресс → preview → publish
├── context/
│   ├── AuthContext.tsx          # сессия + профиль + роли
│   ├── SidebarContext.tsx       # сворачивание сайдбара (localStorage)
├── lib/
│   ├── supabase.ts              # клиент
│   ├── localStorage.ts          # запросы к subjects/variants/questions/results
│   ├── api.ts                   # RPC-обёртки (admin/leaderboard/streak/badges)
│   ├── aiService.ts             # Gemini chat/объяснения/генерация
│   ├── ai/openaiCompat.ts       # OpenAI-совместимый клиент (DeepSeek)
│   └── import/                  # парсеры (xlsx/csv/docx/pdf) + провайдеры + валидация
├── i18n/                        # react-i18next
└── locales/{kz,ru}/             # common, subjects, test, results, profile, admin, import
```

## 3. Основные сценарии — потоки данных

### Тест тапсыру
```
Dashboard → пәнді таңдау → variants → тест (fullscreen, таймер 1 мин/сұрақ)
→ auto-save жауаптар (localStorage) → Аяқтау (модал растау)
→ saveTestResult → results таблицасы (RLS: өз нәтижелері)
→ Результат беті (donut-диаграмма, count-up, watermark)
```

### Импорт тестов
```
Файл (xlsx/csv/docx/pdf) → import_jobs (uploaded)
→ parse (клиент) → AI батчпен (DeepSeek→Gemini→Mock)
→ validate (needs_review/duplicate) → import_questions (draft/review)
→ Admin preview/edit → publish → RPC publish_import_questions
→ questions таблицасына (АТОМАРНО, бір транзакция) + variants.total_score
```

### Геймификация
```
results → get_user_streak (күндер қатары) → «🔥 N күн»
results → get_user_badges (COUNT DISTINCT variant) → медальдар
results → get_leaderboard (DISTINCT ON variant_id) → топ-10 + user_id
```

## 4. Supabase — ключевые механизмы

| Тип | Имя | Назначение |
|-----|-----|-----------|
| Trigger | `handle_new_user` | регистрация → профиль автоматически |
| Trigger | `make_first_user_admin` | первый user → admin |
| Trigger | `auto_confirm_email` | авто-подтверждение email |
| Trigger | `protect_profile_fields` | не-админ не может менять role/is_blocked |
| Trigger | `validate_result_score` | score ≤ total_score = кол-во вопросов |
| RPC | `is_admin()` | SECURITY DEFINER — база для всех проверок RLS |
| RPC | `publish_import_questions` | транзакционная публикация |
| RLS | profiles/questions/variants/results/import_* | доступ по ролям |

## 5. SQL-миграции (`supabase/`)

| Файл | Содержимое |
|------|-----------|
| `00_new_project_full_schema.sql` | базовые таблицы + триггеры auth + сид |
| `01_admin_and_gamification.sql` | админ-функции, лидерборд, streak, бейджи |
| `02_import_system.sql` | import_jobs / import_questions + storage |
| `03_security_fixes.sql` | защита ролей, валидация результатов, атомарный publish, дедуп |

## 6. Переменные окружения (`.env`)

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_GEMINI_API_KEY=
VITE_DEEPSEEK_API_KEY=
VITE_DEEPSEEK_MODEL=deepseek-v4-flash-vision-exp
VITE_DEEPSEEK_BASE_URL=https://api.b.ai/v1
```

## 7. Направление развития

```
ҚАЗІР: SPA (всё в браузере, AI-ключи на клиенте)
   │
   ├─ 1. Backend (Next.js API / Supabase Edge Functions)
   │     → AI-ключи на сервер, контроль доступа к генерации
   ├─ 2. Тесты: таймеры/типы (ЕНТ формат), история по баллам
   ├─ 3. Масштаб: 1000+ вопросов → разделы (sections), категории
   └─ 4. Аналитика: Radar-график по предметам, динамика результатов
```
