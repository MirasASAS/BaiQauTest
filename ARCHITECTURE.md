# Байқау тест — Архитектура

Документ описывает текущую архитектуру приложения «Байқау тест» (BaiQAUTest).

## 1. Высокоуровневая схема

```
   apps/student (ученик)              apps/admin (админ)
   Dashboard / Тест / История         Банк вопросов / Импорт /
   Лидерборд / Streak / ЖИ-чат        Пользователи / Статистика
            │                                   │
            └──────── packages/shared ──────────┘
              (Supabase-клиент, Auth, i18n, API)
                            │
        ┌───────────────────┼────────────────────┐
        ↓                   ↓                    ↓
   Postgres + RLS      RPC-функции         Edge Functions
   profiles            get_test_questions   ai-chat   → Gemini
   subjects            submit_test_result   ai-import → DeepSeek / Gemini
   variants            get_leaderboard …    (ключи ИИ — в секретах Supabase)
   questions           admin_* …
   results             publish_import_questions
   import_jobs / import_questions
   ai_usage            Storage: test-imports     Auth: email + JWT
```

Оба приложения — SPA (React 18 + Vite + TypeScript + Tailwind). Своего сервера нет:
вся серверная логика живёт в Supabase (RLS, триггеры, RPC, Edge Functions).

## 2. Структура репозитория (npm workspaces)

```
apps/
├── student/src/
│   ├── App.tsx                  # state-based routing: tests / history / profile / ai
│   ├── components/
│   │   ├── TestsPage.tsx        # ГЛАВНЫЙ: dashboard → variants → test (экзамен) → result
│   │   ├── HistoryPage.tsx      # история (последняя попытка на вариант, фильтры)
│   │   ├── ProfilePage.tsx      # профиль + бейджи
│   │   ├── AIChatPage.tsx       # ЖИ-чат
│   │   ├── AuthPage.tsx         # вход / регистрация
│   │   └── MainLayout.tsx       # сайдбар + header + mobile drawer
│   └── context/SidebarContext.tsx
├── admin/src/
│   ├── App.tsx                  # логин → проверка role = 'admin' → AdminPage
│   ├── AdminPage.tsx            # Банк / Импорт / Пользователи / Статистика / Настройки
│   ├── admin/ImportAdmin.tsx    # drag&drop → прогресс → preview → publish
│   └── lib/import/              # парсеры (xlsx/csv/docx/pdf), AI-провайдеры, валидация, тесты
packages/shared/
├── src/
│   ├── supabase.ts              # клиент
│   ├── context/AuthContext.tsx  # сессия + профиль + роли + блокировка
│   ├── lib/localStorage.ts      # запросы к subjects/variants/questions/results (название историческое)
│   ├── api.ts                   # RPC-обёртки (admin / leaderboard / streak / badges)
│   ├── lib/aiService.ts         # чат, объяснения, генерация — через Edge Functions
│   ├── lib/sound.ts             # звуки теста (Web Audio)
│   └── i18n/                    # react-i18next
└── locales/{kz,ru}/             # common, subjects, test, results, profile, admin, import
supabase/
├── 00…11_*.sql                  # схема; запускаются вручную в SQL Editor по порядку
├── functions/ai-chat, ai-import # Edge Functions (Deno)
└── migrations/                  # старая история, для нового проекта НЕ используется
```

## 3. Основные сценарии

### Прохождение теста
```
Dashboard → предмет → варианты
→ start_test_attempt(variant)            — вопросы БЕЗ правильных ответов + серверный дедлайн попытки
→ экзамен (fullscreen, таймер 1 мин/вопрос, автосохранение ответов в localStorage)
→ Завершить → submit_test_result(variant, answers)
     сервер сам считает балл, пишет строку в results
     и возвращает { result, answer_key }
→ страница результата (балл с сервера, разбор ответов по answer_key)
```
Клиент балл не считает и не присылает. Прямой `SELECT` из `questions` и прямой
`INSERT` в `results` ученику закрыты RLS.

### Импорт тестов (админ)
```
Файл (xlsx/csv/docx/pdf) → import_jobs (uploaded)
→ parse (в браузере) → AI пачками через ai-import (DeepSeek → Gemini → Mock)
→ validate (needs_review / duplicate) → import_questions (draft / review)
→ Admin preview/edit → publish_import_questions (одна транзакция)
→ questions; variants.total_score пересчитывает триггер
```

### Геймификация
```
results → get_user_streak   (дни подряд)
results → get_user_badges   (COUNT DISTINCT variant, 90%+)
results → get_leaderboard   (последняя попытка на вариант, топ-10) / get_my_rank
```
Заблокированные пользователи в лидерборд не попадают.

### ИИ
```
браузер → supabase.functions.invoke('ai-chat' | 'ai-import')
        → проверка JWT, блокировки, роли (ai-import — только админ),
          лимит 100 запросов/час (ai-chat, таблица ai_usage)
        → Gemini / DeepSeek
```
Ключей ИИ в клиентском коде и `.env` приложений нет.

## 4. Supabase — ключевые механизмы

| Тип | Имя | Назначение |
|-----|-----|-----------|
| Trigger | `handle_new_user` | регистрация → профиль автоматически |
| Trigger | `make_first_user_admin` | первый пользователь → admin |
| Trigger | `auto_confirm_user_email` | авто-подтверждение email |
| Trigger | `protect_profile_fields` | не-админ не может менять role / is_blocked |
| Trigger | `validate_result_score` | score ≤ total_score = число вопросов варианта |
| Trigger | `results_blocked_check` | заблокированный не может писать результаты |
| Trigger | `sync_variant_total_score` | variants.total_score = число вопросов |
| RPC | `is_admin()` | SECURITY DEFINER — база для проверок RLS |
| RPC | `start_test_attempt` | старт/продолжение попытки: вопросы без `correct_answer` и дедлайн |
| RPC | `get_result_review` | разбор своей попытки: вопросы с ключом и ответы ученика |
| RPC | `get_question_for_explain` | вопрос для объяснения ИИ (только после сдачи варианта) |
| RPC | `get_my_topic_stats` | статистика ученика по предметам и темам (по первым попыткам) |
| RPC | `submit_test_result` | серверный подсчёт балла + ключ ответов |
| RPC | `publish_import_questions` | транзакционная публикация импорта |
| RPC | `admin_list_users` / `admin_set_user_role` / `admin_toggle_block` / `admin_platform_stats` | админка |
| RLS | все таблицы | доступ по ролям; `questions` напрямую читает только админ |

## 5. SQL-файлы (`supabase/`, запускать по порядку)

| Файл | Содержимое |
|------|-----------|
| `00_new_project_full_schema.sql` | базовые таблицы + триггеры auth + сид |
| `01_admin_and_gamification.sql` | админ-функции, лидерборд, streak, бейджи |
| `02_import_system.sql` | import_jobs / import_questions + storage |
| `03_security_fixes.sql` | защита ролей, валидация результатов, атомарный publish |
| `04_blocked_users_enforcement.sql` | блокировка на уровне БД |
| `05_submit_test_result.sql` | первая версия RPC сдачи теста (заменена в 08) |
| `06_total_score_trigger.sql` | авто-пересчёт total_score |
| `07_ai_usage.sql` | таблица ai_usage для лимита запросов к ИИ |
| `08_server_side_scoring.sql` | серверный подсчёт балла, скрытие правильных ответов |
| `09_attempts_and_fair_ranking.sql` | серверные попытки с таймером, рейтинг по первой попытке (`results.is_ranked`), недельный лидерборд, streak по Алматы, разбор ответов, `questions.explanation_*` |
| `10_bilingual_content.sql` | казахский текст вопроса (`*_kz`), тема, сложность, картинка (bucket `question-images`), публикация импорта с обоими языками, статистика по темам |
| `11_mistakes_practice.sql` | «работа над ошибками»: `get_my_mistakes`, `record_mistake_practice`, таблица `mistake_practice` |

## 6. Конфигурация

`.env` приложений (попадает в браузер — только публичные значения):
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
# только admin, необязательно: auto | gemini | mock
VITE_AI_PROVIDER=auto
```

Секреты Edge Functions (`supabase secrets set …`):
```
GEMINI_API_KEY=
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-v4-flash-vision-exp      # необязательно
DEEPSEEK_BASE_URL=https://api.b.ai/v1            # необязательно
```

## 7. Известные ограничения

- После первой сдачи ученик видит ключ ответов варианта и может пересдать его на 100%
  (в лидерборд идёт последняя попытка).
- `ai-import` не ограничен по числу запросов (доступен только админам).
- Парсинг файлов импорта идёт в браузере; сканы PDF требуют OCR и не поддерживаются.

## 8. Направление развития

```
├─ 1. Тесты: форматы ЕНТ (несколько правильных ответов, соответствие), разделы
├─ 2. Лидерборд по первой попытке / банк случайных вопросов против заучивания ключа
├─ 3. Масштаб: 1000+ вопросов → разделы (sections), категории
└─ 4. Аналитика: Radar-график по предметам, динамика результатов
```
