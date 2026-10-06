import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, FileQuestion, X, AlertTriangle, ArrowRight, Calculator, Monitor, Globe2, Leaf, Atom, FlaskConical, MapPin, BookOpen, Globe, PackageOpen, Filter } from 'lucide-react';
import { useAuth } from '@baiqautest/shared';
import { useLanguage } from '@baiqautest/shared';
import { getAllTestResults, getResultReview } from '@baiqautest/shared';
import { useSubjectLabel } from '@baiqautest/shared';
import type { TestResult, Variant, Subject, ReviewQuestion } from '@baiqautest/shared';
import { ReviewItem } from './ReviewItem';

type ResultWithDetails = TestResult & { variants: Variant; subjects: Subject };

interface HistoryPageProps {
  onNavigate?: (page: string) => void;
}

const subjectIcons: Record<string, typeof Calculator> = {
  math: Calculator,
  informatics: Monitor,
  kazakhstan_history: Globe2,
  world_history: BookOpen,
  physics: Atom,
  chemistry: FlaskConical,
  biology: Leaf,
  geography: MapPin,
  english: Globe,
};

const pastelIconColors = [
  'bg-blue-100 text-blue-600',
  'bg-green-100 text-green-600',
  'bg-amber-100 text-amber-600',
  'bg-purple-100 text-purple-600',
  'bg-rose-100 text-rose-600',
  'bg-cyan-100 text-cyan-600',
  'bg-indigo-100 text-indigo-600',
  'bg-emerald-100 text-emerald-600',
  'bg-orange-100 text-orange-600',
];

export function HistoryPage({ onNavigate }: HistoryPageProps) {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const subjectLabel = useSubjectLabel();
  const [results, setResults] = useState<ResultWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ResultWithDetails | null>(null);
  const [subjectFilter, setSubjectFilter] = useState<'all' | number>('all');
  const [sortBy, setSortBy] = useState<'date' | 'score'>('date');
  const loadIdRef = useRef(0);
  const { t: tRes } = useTranslation('results');
  // Разбор выбранной попытки: вопросы с ключом + ответы ученика (RPC get_result_review)
  const [review, setReview] = useState<{ questions: ReviewQuestion[]; answers: Record<string, string> | null } | null>(null);
  const [reviewState, setReviewState] = useState<'idle' | 'loading' | 'error'>('idle');

  useEffect(() => {
    setReview(null);
    if (!selected) {
      setReviewState('idle');
      return;
    }
    let active = true;
    setReviewState('loading');
    getResultReview(selected.id)
      .then(data => {
        if (!active) return;
        setReview({ questions: data.questions, answers: data.result.answers ?? null });
        setReviewState('idle');
      })
      .catch(err => {
        if (!active) return;
        console.error('Error loading review:', err);
        setReviewState('error');
      });
    return () => { active = false; };
  }, [selected]);

  useEffect(() => {
    if (user) {
      loadResults();
    }
  }, [user]);

  async function loadResults() {
    if (!user) return;
    const id = ++loadIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const data = await getAllTestResults(user.id);
      if (id !== loadIdRef.current) return;
      setResults(Array.isArray(data) ? data : []);
    } catch (err) {
      if (id !== loadIdRef.current) return;
      console.error('Error loading results:', err);
      setError(err instanceof Error ? err.message : String(err));
    }
    if (id !== loadIdRef.current) return;
    setLoading(false);
  }

  function formatDate(dateStr?: string | null) {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleString(language === 'kz' ? 'kk-KZ' : 'ru-RU', {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function getBadge(score: number, total: number) {
    const percent = total > 0 ? (score / total) * 100 : 0;
    if (percent >= 70) return 'bg-green-100 text-green-700';
    if (percent >= 40) return 'bg-yellow-100 text-yellow-700';
    return 'bg-red-100 text-red-700';
  }

  const filtered = results
    .filter(r => subjectFilter === 'all' || r.variants?.subject_id === subjectFilter)
    .sort((a, b) => {
      if (sortBy === 'score') {
        const pa = a.total_score > 0 ? (a.score / a.total_score) * 100 : 0;
        const pb = b.total_score > 0 ? (b.score / b.total_score) * 100 : 0;
        return pb - pa;
      }
      return new Date(b.taken_at ?? 0).getTime() - new Date(a.taken_at ?? 0).getTime();
    });

  const subjectOptions = [...new Set(results.map(r => r.variants?.subject_id).filter((v): v is number => typeof v === 'number'))];

  const selectedPercent = selected && selected.total_score > 0
    ? Math.round((selected.score / selected.total_score) * 100)
    : 0;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-1">{t('myHistory')}</h1>
        <p className="text-gray-500">{t('testHistory')}</p>
      </div>

      {loading ? (
        /* Skeleton loading */
        <div className="space-y-4">
          {[0, 1, 2].map(i => (
            <div key={i} className="card p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-slate-200 animate-pulse" />
                  <div className="space-y-2">
                    <div className="w-40 h-4 bg-slate-200 rounded animate-pulse" />
                    <div className="w-56 h-3 bg-slate-100 rounded animate-pulse" />
                  </div>
                </div>
                <div className="w-20 h-9 bg-slate-200 rounded-xl animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        /* Error state */
        <div className="card p-12 text-center">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            {language === 'kz' ? 'Бірдеңе дұрыс болмады' : 'Что-то пошло не так'}
          </h2>
          <p className="text-gray-500 text-sm mb-6 break-words">{error}</p>
          <button
            onClick={loadResults}
            className="px-6 py-2.5 bg-[#2563eb] hover:bg-[#1e3a8a] text-white font-medium rounded-xl transition-all"
          >
            {language === 'kz' ? 'Қайталау' : 'Повторить'}
          </button>
        </div>
      ) : filtered.length === 0 ? (
        /* Empty state */
        <div className="card p-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-50 mb-4">
            <PackageOpen className="w-8 h-8 text-blue-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">{t('noHistory')}</h2>
          <p className="text-gray-500 mb-6">{t('noHistoryDesc')}</p>
          {onNavigate && (
            <button
              onClick={() => onNavigate('tests')}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#2563eb] hover:bg-[#1e3a8a] text-white font-medium rounded-xl transition-all"
            >
              {language === 'kz' ? 'Тестілеуді бастау' : 'Начать тестирование'}
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Filter / sort */}
          <div className="flex flex-wrap items-center gap-2 mb-5">
            <div className="flex items-center gap-1.5 text-sm text-gray-500 mr-1">
              <Filter className="w-4 h-4" />
            </div>
            <select
              value={subjectFilter === 'all' ? 'all' : String(subjectFilter)}
              onChange={e => setSubjectFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb]"
              aria-label={language === 'kz' ? 'Пән бойынша сүзгі' : 'Фильтр по предмету'}
            >
              <option value="all">{language === 'kz' ? 'Барлық пәндер' : 'Все предметы'}</option>
              {subjectOptions.map(id => {
                const s = results.find(r => r.variants?.subject_id === id)?.subjects;
                return (
                  <option key={id} value={id}>{s?.name ? subjectLabel(s.name) : `#${id}`}</option>
                );
              })}
            </select>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as 'date' | 'score')}
              className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb]"
              aria-label={language === 'kz' ? 'Сұрыптау' : 'Сортировка'}
            >
              <option value="date">{language === 'kz' ? 'Соңғысы жоғарыда' : 'Сначала новые'}</option>
              <option value="score">{language === 'kz' ? 'Ең жоғары балл' : 'По баллу'}</option>
            </select>
          </div>

          {/* Results list */}
          <div className="space-y-4">
            {filtered.map(result => {
              const variant = result.variants;
              const subject = result.subjects;
              const Icon = subject ? subjectIcons[subject.name] || FileQuestion : FileQuestion;
              const iconColor = subject?.id != null ? pastelIconColors[subject.id % pastelIconColors.length] : 'bg-blue-100 text-blue-600';
              const variantName = variant?.variant_name || `${variant?.variant_number ?? '?'}-${language === 'kz' ? 'нұсқа' : 'вариант'}`;
              const percent = result.total_score > 0 ? Math.round((result.score / result.total_score) * 100) : 0;

              return (
                <div key={result.id} className="card p-5 hover:border-blue-200 transition-all">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${iconColor}`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate">{subjectLabel(subject?.name) || `#${result.variant_id}`}</h3>
                        <div className="flex items-center gap-2 text-sm text-gray-500 mt-1 flex-wrap">
                          <span className="text-[#2563eb] font-medium">{variantName}</span>
                          <span className="text-gray-300">|</span>
                          <Calendar className="w-4 h-4" />
                          {formatDate(result.taken_at)}
                          {result.is_ranked === false && (
                            <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-500 text-xs font-medium">{tRes('unranked')}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className={`flex flex-col items-center px-4 py-2 rounded-xl ${getBadge(result.score, result.total_score)}`}>
                        <span className="font-bold text-lg leading-none">
                          {result.score ?? '?'}/{result.total_score ?? '?'}
                        </span>
                        <span className="text-xs mt-0.5">{percent}%</span>
                      </div>
                      <button
                        onClick={() => setSelected(result)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 hover:border-[#2563eb] hover:text-[#2563eb] rounded-xl text-sm font-medium text-gray-700 transition-all"
                        aria-label={language === 'kz' ? 'Толығырақ' : 'Подробнее'}
                      >
                        {language === 'kz' ? 'Толығырақ' : 'Подробнее'}
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Result detail modal ─────────────────────────────────────────── */}
      {selected && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setSelected(null)}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">
                {language === 'kz' ? 'Тест нәтижесі' : 'Результат теста'}
              </h2>
              <button onClick={() => setSelected(null)} className="p-1 text-gray-400 hover:text-gray-600" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl">
                <span className="text-sm text-gray-500">{language === 'kz' ? 'Бөлім' : 'Раздел'}</span>
                <span className="font-semibold text-gray-900">{selected.subjects?.name ? subjectLabel(selected.subjects.name) : `#${selected.variant_id}`}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl">
                <span className="text-sm text-gray-500">{language === 'kz' ? 'Нұсқа' : 'Вариант'}</span>
                <span className="font-semibold text-gray-900">
                  {selected.variants?.variant_name || `${selected.variants?.variant_number ?? '?'}-${language === 'kz' ? 'нұсқа' : 'вариант'}`}
                </span>
              </div>
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl">
                <span className="text-sm text-gray-500">{language === 'kz' ? 'Күні' : 'Дата'}</span>
                <span className="font-semibold text-gray-900">{formatDate(selected.taken_at)}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl">
                <span className="text-sm text-gray-500">{language === 'kz' ? 'Ұпай' : 'Балл'}</span>
                <span className="font-semibold text-gray-900">
                  {selected.score} / {selected.total_score}
                </span>
              </div>
              <div className="px-4 py-3 bg-[#2563eb]/5 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">{language === 'kz' ? 'Нәтиже' : 'Результат'}</span>
                  <span className="font-bold text-[#2563eb]">{selectedPercent}%</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      selectedPercent >= 70 ? 'bg-green-500' : selectedPercent >= 40 ? 'bg-amber-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${selectedPercent}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl">
                <span className="text-sm text-gray-500">{language === 'kz' ? 'Рейтинг' : 'Рейтинг'}</span>
                <span className={`font-semibold ${selected.is_ranked === false ? 'text-gray-500' : 'text-green-600'}`}>
                  {tRes(selected.is_ranked === false ? 'unranked' : 'ranked')}
                </span>
              </div>
            </div>

            {/* Разбор ответов */}
            <div className="mt-5 border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 bg-blue-50 font-bold text-sm text-gray-700">{tRes('reviewTitle')}</div>
              {reviewState === 'loading' && (
                <p className="px-5 py-4 text-sm text-gray-500">{tRes('reviewLoading')}</p>
              )}
              {reviewState === 'error' && (
                <p className="px-5 py-4 text-sm text-red-500">{tRes('reviewError')}</p>
              )}
              {review && (
                <div className="divide-y divide-gray-100">
                  {review.questions.map((q, i) => (
                    <ReviewItem
                      key={q.id}
                      question={q}
                      index={i}
                      userAnswer={review.answers?.[q.id] ?? null}
                      language={language}
                      tRes={tRes}
                    />
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => setSelected(null)}
              className="w-full mt-6 py-3 bg-[#2563eb] hover:bg-[#1e3a8a] text-white font-medium rounded-xl transition-all"
            >
              Жабу / Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
