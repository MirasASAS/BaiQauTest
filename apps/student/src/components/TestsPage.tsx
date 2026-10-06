import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, animate } from 'framer-motion';
import { CheckCircle, AlertCircle, Check, Trophy, FileQuestion, Calculator, Monitor, Globe, Globe2, Leaf, Atom, FlaskConical, MapPin, BookOpen, ArrowLeft, Loader2, Sparkles, RotateCcw, ChevronDown, GraduationCap, Sigma, BookText } from 'lucide-react';
import { useAuth } from '@baiqautest/shared';
import { useLanguage } from '@baiqautest/shared';
import { LanguageSwitcher } from '@baiqautest/shared';
import { getSubjects, getVariants, getVariantsBySubjectId, getQuestionsByVariantId, startTestAttempt, getTestResultByVariant, saveTestResult, getUserStats } from '@baiqautest/shared';
import { getStudyRecommendation, playSelect, playFinish } from '@baiqautest/shared';
import { getLeaderboard, getMyRank, getUserStreak, getMyTopicStats, getMyMistakes, getLastWeekWinners, getOpenFullExam, type LeaderboardEntry, type LeaderboardPeriod, type MyRank, type TopicStat, type MistakesSummary, type WeekWinner } from '@baiqautest/shared';
import { useSubjectLabel, isAnswered, scoreAnswer, maxScore, formatAnswer, withAnswerKey } from '@baiqautest/shared';
import type { Subject, Variant, TestQuestion, AnswerValue } from '@baiqautest/shared';
import { ReviewItem } from './ReviewItem';
import { ExamScreen } from './ExamScreen';
import { MistakesPractice } from './MistakesPractice';
import { FullExam } from './FullExam';

type Stage = 'dashboard' | 'variants' | 'test' | 'result' | 'mistakes' | 'fullExam';

// Deterministic numeric code from a UUID (used as user ID on the result page)
function deriveCode(id: string): string {
  let h1 = 0;
  let h2 = 0;
  for (let i = 0; i < id.length; i++) {
    h1 = (h1 * 31 + id.charCodeAt(i)) >>> 0;
    h2 = (h2 * 17 + id.charCodeAt(i)) >>> 0;
  }
  return (String(h1) + String(h2)).slice(0, 12) || '—';
}

// Count-up animation for the final score
function CountUp({ value, duration = 1 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const controls = animate(0, value, {
      duration,
      ease: 'easeOut',
      onUpdate: v => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [value, duration]);
  return <>{display}</>;
}

export function TestsPage() {
  const { user, profile } = useAuth();
  const { t, language } = useLanguage();
  const [stage, setStage] = useState<Stage>('dashboard');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null);
  const [questions, setQuestions] = useState<TestQuestion[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<number, AnswerValue>>({});
  const [score, setScore] = useState(0);
  // Максимум баллов сданной попытки (сумма баллов вопросов, а не их количество)
  const [resultTotal, setResultTotal] = useState(0);
  // Победители прошлой недели и незавершённый полный ЕНТ
  const [weekWinners, setWeekWinners] = useState<WeekWinner[]>([]);
  const [hasOpenFullExam, setHasOpenFullExam] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ testsCompleted: 0, averageScore: 0, bestResult: 0 });
  const [aiRecommendation, setAiRecommendation] = useState<string>('');
  const [loadingRecommendation, setLoadingRecommendation] = useState(false);
  const [variantResults, setVariantResults] = useState<Record<number, { score: number; total_score: number } | null>>({});
  // Число заданий варианта: total_score — это сумма баллов, а не количество вопросов
  const [variantCounts, setVariantCounts] = useState<Record<number, number>>({});
  const [showAnswerCard, setShowAnswerCard] = useState(false);
  const [streak, setStreak] = useState(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myRank, setMyRank] = useState<MyRank | null>(null);
  const [lbPeriod, setLbPeriod] = useState<LeaderboardPeriod>('all');
  const [topicStats, setTopicStats] = useState<TopicStat[]>([]);
  const [mistakes, setMistakes] = useState<MistakesSummary | null>(null);
  const [mistakesSubjectId, setMistakesSubjectId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const subjectLabel = useSubjectLabel();
  const { t: tTest } = useTranslation('test');
  const { t: tRes } = useTranslation('results');
  const [timeLeft, setTimeLeft] = useState(0);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const [offline, setOffline] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const finishingRef = useRef(false);
  // Дедлайн попытки по часам устройства; сам срок задаёт сервер (start_test_attempt)
  const deadlineRef = useRef(0);
  const [attemptId, setAttemptId] = useState<number | null>(null);
  // null — результата ещё нет; false — попытка сохранена, но в рейтинг не идёт
  const [resultRanked, setResultRanked] = useState<boolean | null>(null);

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
    math_literacy: Sigma,
    reading_literacy: BookText,
  };

  function getSubjectIcon(name: string): typeof Calculator {
    return subjectIcons[name] || FileQuestion;
  }

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

  useEffect(() => {
    let active = true;
    loadInitialData(active);
    return () => { active = false; };
  }, [user]);

  async function loadInitialData(active = true) {
    setLoading(true);
    setLoadError(null);
    try {
      const subjectsData = await getSubjects();
      if (!active) return;
      setSubjects(subjectsData);
      const allVariants = await getVariants();
      if (!active) return;
      setVariants(allVariants);
      if (user) {
        const userStats = await getUserStats(user.id);
        if (!active) return;
        setStats(userStats);
      }
    } catch (err) {
      if (!active) return;
      console.error('Error loading data:', err);
      setLoadError(err instanceof Error ? err.message : 'Ошибка загрузки данных');
    }
    if (!active) return;
    setLoading(false);
  }

  // Load AI recommendation when stats change
  useEffect(() => {
    if (stage === 'dashboard' && stats.testsCompleted > 0 && !aiRecommendation) {
      loadRecommendation();
    }
  }, [stats, stage]);

  // Статистика по темам для блока «Слабые темы»
  useEffect(() => {
    if (stage !== 'dashboard' || !user) return;
    let active = true;
    getMyTopicStats()
      .then(rows => { if (active) setTopicStats(rows); })
      .catch(() => { /* SQL 10 ещё не применён — блок просто не показываем */ });
    getMyMistakes(null, 1)
      .then(data => { if (active) setMistakes(data); })
      .catch(() => { /* SQL 11 ещё не применён — блок просто не показываем */ });
    getOpenFullExam(user.id)
      .then(session => { if (active) setHasOpenFullExam(!!session); })
      .catch(() => { /* SQL 12 ещё не применён */ });
    return () => { active = false; };
  }, [stage, user]);

  // Load streak + leaderboard on dashboard
  useEffect(() => {
    if (stage !== 'dashboard') return;
    let active = true;
    (async () => {
      try {
        const [s, lb, rank, winners] = await Promise.all([
          getUserStreak().catch(() => 0),
          getLeaderboard(lbPeriod).catch(() => []),
          getMyRank(lbPeriod).catch(() => null),
          // SQL 13 ещё не применён — блок победителей просто не показываем
          getLastWeekWinners().catch(() => []),
        ]);
        if (!active) return;
        setStreak(s);
        setLeaderboard(lb);
        setMyRank(rank);
        setWeekWinners(winners);
      } catch { /* ignore */ }
    })();
    return () => { active = false; };
  }, [stage, lbPeriod]);

  async function loadRecommendation() {
    setLoadingRecommendation(true);
    try {
      const rec = await getStudyRecommendation(stats, language);
      setAiRecommendation(rec);
    } catch (err) {
      console.error('Error loading AI recommendation:', err);
    }
    setLoadingRecommendation(false);
  }

  async function selectSubject(subject: Subject) {
    setLoading(true);
    try {
      const variantsData = await getVariantsBySubjectId(subject.id);
      setVariants(variantsData);
      setSelectedSubject(subject);
      
      // Load results for all variants (parallel, resilient to individual failures)
      if (user) {
        const results: Record<number, { score: number; total_score: number } | null> = {};
        const settled = await Promise.allSettled(
          variantsData.map(v => getTestResultByVariant(user.id, v.id))
        );
        variantsData.forEach((v, i) => {
          results[v.id] = settled[i].status === 'fulfilled' ? settled[i].value : null;
        });
        setVariantResults(results);
      }

      // Количество заданий считаем по самим вопросам; не загрузилось — карточка покажет только баллы
      setVariantCounts({});
      Promise.allSettled(variantsData.map(v => getQuestionsByVariantId(v.id))).then(settled => {
        const counts: Record<number, number> = {};
        variantsData.forEach((v, i) => {
          const item = settled[i];
          if (item.status === 'fulfilled') counts[v.id] = item.value.length;
        });
        setVariantCounts(counts);
      });
      
      setStage('variants');
    } catch (err) {
      console.error('Error loading variants:', err);
    }
    setLoading(false);
  }

  async function selectVariant(variant: Variant) {
    setLoading(true);
    finishingRef.current = false;
    try {
      // Сервер создаёт попытку или возвращает незавершённую — с оставшимся временем
      const { attempt, questions: questionsData, msLeft } = await startTestAttempt(variant.id);
      deadlineRef.current = Date.now() + msLeft;
      setAttemptId(attempt?.id ?? null);
      setTimeLeft(Math.ceil(msLeft / 1000));
      setTimeUp(false);
      setResultRanked(null);
      setQuestions(questionsData);
      setSelectedVariant(variant);
      setStage('test');
      setCurrentQuestion(0);
      setAnswers({});
      setScore(0);
    } catch (err) {
      console.error('Error loading questions:', err);
    }
    setLoading(false);
  }

  const [showRetakeConfirm, setShowRetakeConfirm] = useState(false);
  const [pendingRetakeVariant, setPendingRetakeVariant] = useState<Variant | null>(null);

  function requestRetake(variant: Variant) {
    setPendingRetakeVariant(variant);
    setShowRetakeConfirm(true);
  }

  function confirmRetake() {
    setShowRetakeConfirm(false);
    if (pendingRetakeVariant) {
      selectVariant(pendingRetakeVariant);
      setPendingRetakeVariant(null);
    }
  }

  // Exam countdown: отсчёт до серверного дедлайна попытки (1 минута на вопрос).
  // Время считается от дедлайна, а не тиками, поэтому свёрнутая вкладка его не «замораживает».
  useEffect(() => {
    if (stage !== 'test' || attemptId === null) return;
    const tick = () => setTimeLeft(Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [stage, attemptId]);

  // Auto-submit when time runs out (только если таймер реально тикал, а не 0 изначально)
  const prevTimeRef = useRef(-1);
  useEffect(() => {
    if (stage === 'test' && timeLeft === 0 && questions.length > 0 && !finishingRef.current && prevTimeRef.current > 0) {
      setTimeUp(true);
      finishTest();
    }
    prevTimeRef.current = timeLeft;
  }, [timeLeft, stage]);

  // Offline / online detection
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    setOffline(typeof navigator !== 'undefined' && !navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // Auto-save answers to localStorage (debounced 500ms)
  useEffect(() => {
    if (stage !== 'test' || !selectedVariant) return;
    const key = `exam_answers_${user?.id ?? 'guest'}_${selectedVariant.id}`;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(answers));
      } catch { /* ignore */ }
    }, 500);
    return () => clearTimeout(t);
  }, [answers, stage, selectedVariant, user?.id]);

  // Restore saved answers when entering the test
  useEffect(() => {
    if (stage === 'test' && selectedVariant) {
      try {
        const key = `exam_answers_${user?.id ?? 'guest'}_${selectedVariant.id}`;
        const saved = localStorage.getItem(key);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && typeof parsed === 'object') setAnswers(parsed);
        }
      } catch { /* ignore */ }
    }
  }, [stage, selectedVariant, user?.id]);

  function selectAnswer(answer: AnswerValue | null) {
    setAnswers(prev => {
      const next = { ...prev };
      if (answer === null) delete next[currentQuestion];
      else next[currentQuestion] = answer;
      return next;
    });
    // Верность ответа во время теста неизвестна (ключ приходит с сервера после сдачи)
    if (answer !== null && formatAnswer(answer) !== formatAnswer(answers[currentQuestion])) playSelect();
  }

  function goBackToVariants() {
    if (selectedSubject) {
      setStage('variants');
    } else {
      reset();
    }
  }

  async function finishTest() {
    if (finishingRef.current || !selectedVariant) return;
    finishingRef.current = true;
    setShowFinishConfirm(false);
    setSubmitError(null);

    const answersById: Record<string, AnswerValue> = {};
    questions.forEach((q, i) => {
      if (isAnswered(answers[i])) answersById[q.id] = answers[i];
    });

    try {
      // Балл считает сервер; вместе с результатом приходит ключ правильных ответов
      const { result, answerKey } = await saveTestResult({
        variant_id: selectedVariant.id,
        answers: answersById,
      });
      setScore(result.score);
      setResultTotal(result.total_score);
      setResultRanked(result.is_ranked !== false);
      setQuestions(prev => prev.map(q => withAnswerKey(q, answerKey[q.id])));
    } catch (err) {
      // Не сохранилось — остаёмся в тесте, ответы лежат в localStorage, можно повторить
      console.error('Error saving result:', err);
      finishingRef.current = false;
      setTimeUp(false);
      setSubmitError(err instanceof Error ? err.message : String(err));
      return;
    }

    playFinish();
    try {
      localStorage.removeItem(`exam_answers_${user?.id ?? 'guest'}_${selectedVariant.id}`);
    } catch { /* ignore */ }
    setStage('result');
    if (user) {
      getUserStats(user.id).then(setStats).catch(() => { /* ignore */ });
    }
  }

  function reset() {
    setStage('dashboard');
    setSelectedSubject(null);
    setSelectedVariant(null);
    setVariants([]);
    setQuestions([]);
    setCurrentQuestion(0);
    setAnswers({});
    setScore(0);
    setAiRecommendation('');
    setVariantResults({});
    setShowAnswerCard(false);
    setShowFinishConfirm(false);
    setTimeUp(false);
    setSubmitError(null);
    setAttemptId(null);
    setResultRanked(null);
    loadInitialData();
  }

  // Dashboard
  if (stage === 'dashboard') {
    return (
      <div className="max-w-5xl mx-auto">
        {/* Greeting */}
        <div className="mb-6">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold text-gray-900">
              {t('greeting')}, {profile?.first_name}!
            </h1>
            {streak > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 border border-orange-200 text-orange-700 text-sm font-bold rounded-xl">
                🔥 {streak} {tTest('streakDays')}
              </span>
            )}
          </div>
          <p className="text-gray-500 mt-2">{t('appSubtitle')}</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="card p-5"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-11 h-11 rounded-xl bg-amber-100 flex items-center justify-center">
                <FileQuestion className="w-6 h-6 text-amber-600" />
              </div>
              <span className="text-sm font-medium text-gray-500">{t('testsPassed')}</span>
            </div>
            <p className="text-[32px] leading-none font-bold text-gray-900">{stats.testsCompleted}</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.08, ease: 'easeOut' }}
            className="card p-5"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-11 h-11 rounded-xl bg-green-100 flex items-center justify-center">
                <Trophy className="w-6 h-6 text-green-600" />
              </div>
              <span className="text-sm font-medium text-gray-500">{t('averageScore')}</span>
            </div>
            <p className="text-[32px] leading-none font-bold text-gray-900">{stats.averageScore}%</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.16, ease: 'easeOut' }}
            className="card p-5"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-11 h-11 rounded-xl bg-yellow-100 flex items-center justify-center">
                <Trophy className="w-6 h-6 text-yellow-600" />
              </div>
              <span className="text-sm font-medium text-gray-500">{t('bestResult')}</span>
            </div>
            <p className="text-[32px] leading-none font-bold text-gray-900">{stats.bestResult}%</p>
          </motion.div>
        </div>

        {/* AI Recommendation Card (скрыта, если ИИ недоступен и показать нечего) */}
        {(loadingRecommendation || aiRecommendation || stats.testsCompleted === 0) && (
          <div className="mb-8 bg-gradient-to-r from-violet-50 to-indigo-50 rounded-2xl border border-violet-100 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <span className="text-sm font-semibold text-violet-800">{t('aiRecommendation')}</span>
            </div>
            {loadingRecommendation ? (
              <div className="flex items-center gap-2 text-sm text-violet-600">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('aiRecommendationLoading')}
              </div>
            ) : aiRecommendation ? (
              <p className="text-sm text-violet-900 leading-relaxed">{aiRecommendation}</p>
            ) : stats.testsCompleted === 0 ? (
              <p className="text-sm text-violet-700">
                {language === 'kz'
                  ? '📚 Тест тапсырып, ЖИ кеңесін алыңыз!'
                  : '📚 Пройдите тест, чтобы получить совет от ИИ!'}
              </p>
            ) : null}
          </div>
        )}

        {/* Работа над ошибками */}
        {mistakes && mistakes.total > 0 && (
          <div className="mb-8 card p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-gray-900">{tTest('mistakesTitle')}</h2>
                <p className="text-sm text-gray-500 mt-1">{tTest('mistakesDesc', { count: mistakes.total })}</p>
              </div>
              <button
                onClick={() => { setMistakesSubjectId(null); setStage('mistakes'); }}
                className="flex-shrink-0 px-5 py-2.5 bg-[#2563eb] hover:bg-[#1e3a8a] text-white font-bold rounded-xl"
              >
                {tTest('mistakesStart')}
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              {mistakes.by_subject.map(item => (
                <button
                  key={item.subject_id}
                  onClick={() => { setMistakesSubjectId(item.subject_id); setStage('mistakes'); }}
                  className="px-3 py-1.5 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700 font-medium hover:bg-red-100"
                >
                  {subjectLabel(item.subject)} · {item.count}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Слабые темы: до 5 тем с долей верных ответов ниже 70% (минимум 3 вопроса по теме) */}
        {(() => {
          const weak = topicStats
            .filter(r => r.topic && r.total >= 3)
            .map(r => ({ ...r, percent: Math.round((r.correct / r.total) * 100) }))
            .filter(r => r.percent < 70)
            .sort((a, b) => a.percent - b.percent)
            .slice(0, 5);
          if (weak.length === 0) return null;
          return (
            <div className="mb-8 card p-5">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="w-5 h-5 text-amber-500" />
                <h2 className="text-lg font-bold text-gray-900">{tTest('weakTopics')}</h2>
              </div>
              <p className="text-sm text-gray-500 mb-4">{tTest('weakTopicsDesc')}</p>
              <div className="space-y-3">
                {weak.map(r => (
                  <div key={`${r.subject}:${r.topic}`}>
                    <div className="flex items-center justify-between gap-3 text-sm mb-1">
                      <span className="min-w-0 truncate">
                        <span className="font-medium text-gray-900">{r.topic}</span>
                        <span className="text-gray-400"> · {subjectLabel(r.subject)}</span>
                      </span>
                      <span className="flex-shrink-0 font-bold text-gray-700">{r.correct}/{r.total} · {r.percent}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${r.percent < 40 ? 'bg-red-500' : 'bg-amber-500'}`}
                        style={{ width: `${r.percent}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Subjects Section */}
        {loadError ? (
          <div className="card p-10 text-center">
            <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <p className="text-gray-700 font-medium mb-1">
              {language === 'kz' ? 'Деректерді жүктеу мүмкін болмады' : 'Не удалось загрузить данные'}
            </p>
            <p className="text-gray-400 text-sm mb-4 break-words">{loadError}</p>
<button
              onClick={() => loadInitialData()}
              className="px-5 py-2.5 bg-[#2563eb] hover:bg-[#1e3a8a] text-white font-medium rounded-xl transition-all"
            >
              {language === 'kz' ? 'Қайталау' : 'Повторить'}
            </button>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#2563eb]" />
          </div>
        ) : (
          <div>
            {/* Полный ЕНТ: несколько предметов в одной попытке */}
            <div className="mb-8 rounded-2xl bg-gradient-to-r from-[#1e3a8a] to-[#2563eb] text-white p-5 sm:p-6 flex items-center gap-4 flex-wrap">
              <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center flex-shrink-0">
                <GraduationCap className="w-8 h-8" />
              </div>
              <div className="flex-1 min-w-[200px]">
                <h2 className="text-xl font-bold">{tTest('fullExamTitle')}</h2>
                <p className="text-sm text-blue-100 mt-1">{tTest(hasOpenFullExam ? 'fullExamResumeDesc' : 'fullExamDesc')}</p>
              </div>
              <button
                onClick={() => setStage('fullExam')}
                className="flex-shrink-0 px-6 py-3 bg-white text-[#1e3a8a] font-bold rounded-xl hover:bg-blue-50"
              >
                {tTest(hasOpenFullExam ? 'fullExamResume' : 'fullExamStart')}
              </button>
            </div>

            <h2 className="text-xl font-bold text-gray-900 mb-4">{t('selectSubject')}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {subjects.map(subject => {
                const Icon = getSubjectIcon(subject.name);
                const iconColor = pastelIconColors[subject.id % pastelIconColors.length];
                const variantCount = variants.filter(v => v.subject_id === subject.id).length;

                return (
                  <button
                    key={subject.id}
                    onClick={() => selectSubject(subject)}
                    className="card p-5 hover:border-blue-200 text-left group"
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform ${iconColor}`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-1">{subjectLabel(subject.name)}</h3>
                    <p className="text-sm text-gray-500">{variantCount} {t('variantsCount')}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Leaderboard */}
        {(leaderboard.length > 0 || lbPeriod === 'week') && (
          <div className="mt-8">
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <Trophy className="w-5 h-5 text-amber-500" />
              <h2 className="text-xl font-bold text-gray-900">
                {language === 'kz' ? 'Лидерборд' : 'Лидерборд'}
              </h2>
              <div className="ml-auto flex items-center gap-1 bg-gray-100 rounded-xl p-1">
                {(['all', 'week'] as const).map(period => (
                  <button
                    key={period}
                    onClick={() => setLbPeriod(period)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      lbPeriod === period ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tTest(period === 'all' ? 'lbAll' : 'lbWeek')}
                  </button>
                ))}
              </div>
            </div>
            {weekWinners.length > 0 && (
              <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm font-bold text-amber-900 mb-2">👑 {tTest('lastWeekWinners')}</p>
                <div className="flex flex-wrap gap-2">
                  {weekWinners.map(w => (
                    <span
                      key={w.place}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm bg-white border ${
                        user && w.user_id === user.id ? 'border-[#2563eb] text-[#1e3a8a] font-bold' : 'border-amber-200 text-gray-800 font-medium'
                      }`}
                    >
                      {w.place === 1 ? '🥇' : w.place === 2 ? '🥈' : '🥉'} {w.nickname}
                      <span className="text-gray-400 font-normal">· {w.points} {tTest('points')}</span>
                    </span>
                  ))}
                </div>
                <p className="text-xs text-amber-800/80 mt-2">{tTest('weekPrizeHint')}</p>
              </div>
            )}
            <div className="card p-2 divide-y divide-gray-100">
              {leaderboard.length === 0 && (
                <p className="px-4 py-6 text-sm text-gray-500 text-center">{tTest('lbEmptyWeek')}</p>
              )}
              {leaderboard.map((entry, i) => {
                const isMe = user && entry.user_id === user.id;
                return (
                  <div key={entry.user_id} className={`flex items-center gap-3 px-4 py-3 rounded-xl ${isMe ? 'bg-blue-50' : ''}`}>
                    <span className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold flex-shrink-0 ${
                      i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-slate-200 text-slate-600' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {entry.nickname}
                        {isMe && <span className="ml-2 text-xs text-[#2563eb] font-bold">({tTest('you')})</span>}
                      </p>
                      <p className="text-xs text-gray-500">{entry.tests_count} {tTest('tests')}</p>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <span className="text-sm text-gray-400 hidden sm:inline">{entry.avg_percent}%</span>
                      <span className="text-sm font-bold text-gray-900">{entry.total_points} {tTest('points')}</span>
                    </div>
                  </div>
                );
              })}
              {myRank && user && !leaderboard.some(e => e.user_id === user.id) && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-50">
                  <span className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-100 text-blue-700 text-sm font-bold flex-shrink-0">{myRank.rank}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{myRank.nickname} <span className="text-xs text-[#2563eb] font-bold">({tTest('you')})</span></p>
                    <p className="text-xs text-gray-500">{myRank.tests_count} {tTest('tests')}</p>
                  </div>
                  <span className="text-sm font-bold text-gray-900 flex-shrink-0">{myRank.total_points} {tTest('points')}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
  if (stage === 'variants' && selectedSubject) {
    const Icon = getSubjectIcon(selectedSubject.name);

    return (
      <div className="max-w-4xl mx-auto">
        <button
          onClick={reset}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('back')}
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${pastelIconColors[selectedSubject.id % pastelIconColors.length]}`}>
            <Icon className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{subjectLabel(selectedSubject.name)}</h1>
            <p className="text-gray-500">{variants.length} {t('variantsCount')}</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#2563eb]" />
          </div>
        ) : variants.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-yellow-100 mb-4">
              <AlertCircle className="w-8 h-8 text-yellow-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">{t('noVariants')}</h2>
            <p className="text-gray-500">{t('noVariantsDesc')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {variants.map(variant => {
              const result = variantResults[variant.id] || null;
              const isCompleted = !!result;

              return (
                <div
                  key={variant.id}
                  className={`overflow-hidden transition-all ${
                    isCompleted ? 'border-2 border-green-200 bg-green-50/30 card' : 'card border-2 border-transparent hover:border-blue-200'
                  }`}
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-bold text-gray-900 text-lg">{variant.variant_name || `${variant.variant_number}-${tTest('variantFallback')}`}</h3>
                        {isCompleted && (
                          <div className="flex items-center gap-1.5 text-green-600 text-sm mt-1">
                            <CheckCircle className="w-4 h-4" />
                            {t('completed')}: {result!.score}/{result!.total_score}
                          </div>
                        )}
                      </div>
                      {isCompleted && (
                        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                          <Check className="w-5 h-5 text-green-600" />
                        </div>
                      )}
                    </div>

                    <div className="flex gap-6 text-sm text-gray-600 mb-5">
                      {variantCounts[variant.id] !== undefined && (
                        <div className="flex items-center gap-2">
                          <FileQuestion className="w-4 h-4 text-gray-400" />
                          <span>{variantCounts[variant.id]} {tTest('questions')}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-gray-400" />
                        <span>{variant.total_score} {tTest('points')}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => isCompleted ? requestRetake(variant) : selectVariant(variant)}
                      className={`w-full py-3 rounded-xl font-medium transition-colors ${
                        isCompleted
                          ? 'bg-green-100 hover:bg-green-200 text-green-700'
                          : 'bg-[#2563eb] hover:bg-[#1e3a8a] text-white'
                      }`}
                    >
                      {isCompleted ? t('tryAgain') : t('start')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Retake confirmation modal ─────────────────────────────────── */}
        {showRetakeConfirm && (
          <div
            className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4"
            onClick={() => setShowRetakeConfirm(false)}
          >
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
              <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
                <RotateCcw className="w-6 h-6 text-blue-500" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">{t('retakeConfirmTitle')}</h3>
              <p className="text-gray-500 text-sm mb-2">{t('retakeConfirmDesc')}</p>
              <p className="text-amber-600 text-xs mb-6">{tRes('retakeNotRanked')}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowRetakeConfirm(false)}
                  className="flex-1 py-2.5 border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium rounded-xl transition-all"
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={confirmRetake}
                  className="flex-1 py-2.5 bg-[#2563eb] hover:bg-[#1e3a8a] text-white font-medium rounded-xl transition-all"
                >
                  {t('confirmRetake')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (stage === 'mistakes') {
    return <MistakesPractice subjectId={mistakesSubjectId} onClose={reset} />;
  }

  if (stage === 'fullExam') {
    return <FullExam onClose={reset} />;
  }

  // ── Full-screen exam (testcenter.kz style) ──────────────────────────────────
  if (stage === 'test' && selectedVariant) {
    return (
      <ExamScreen
        loading={loading}
        studentName={[profile?.last_name, profile?.first_name].filter(Boolean).join(' ')}
        subjectName={subjectLabel(selectedSubject?.name)}
        variantName={selectedVariant.variant_name || `${selectedVariant.variant_number}-${tTest('variantFallback')}`}
        questions={questions}
        currentQuestion={currentQuestion}
        onNavigate={setCurrentQuestion}
        answers={answers}
        onSelectAnswer={selectAnswer}
        onResetAnswers={() => setAnswers({})}
        timeLeft={timeLeft}
        totalSeconds={questions.length * 60}
        offline={offline}
        onExit={goBackToVariants}
        onBackHome={reset}
        showFinishConfirm={showFinishConfirm}
        onFinishConfirmChange={setShowFinishConfirm}
        onFinish={finishTest}
        submitError={submitError}
        onDismissSubmitError={() => setSubmitError(null)}
        timeUp={timeUp}
      />
    );
  }
  if (stage === 'result' && selectedVariant) {
    const totalQuestions = questions.length || selectedVariant.total_score;
    const totalPoints = resultTotal || questions.reduce((sum, q) => sum + maxScore(q), 0) || totalQuestions;
    const answeredCount = questions.filter((_, i) => isAnswered(answers[i])).length;
    const fullName = [profile?.last_name, profile?.first_name].filter(Boolean).join(' ') || '—';
    const userCode = profile?.phone?.replace(/\D/g, '') || deriveCode(user?.id || '');
    const sections = [{ name: subjectLabel(selectedSubject?.name), score }];

    let correct = 0;
    let wrong = 0;
    let skipped = 0;
    // «верно» — вопрос решён на полный балл; частично верный ответ идёт в «неверно»
    questions.forEach((q, i) => {
      if (!isAnswered(answers[i])) skipped++;
      else if (scoreAnswer(q, answers[i]) === maxScore(q)) correct++;
      else wrong++;
    });
    const totalPct = totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0;
    const donutC = 2 * Math.PI * 42;
    const donutSeg = (n: number) => (totalQuestions > 0 ? (n / totalQuestions) * donutC : 0);

    return (
      <>
      <div className="fixed inset-0 z-50 watermark-page flex flex-col overflow-y-auto overflow-x-hidden">
        {/* ── Right fixed tools ─────────────────────────────────────────── */}
        <div className="fixed right-3 top-3 z-50 flex flex-col items-center gap-2 bg-white rounded-xl shadow-lg border border-gray-200 px-2 py-2">
          <LanguageSwitcher />
          <button
            onClick={() => { if (confirm(tRes('reloadConfirm'))) reset(); }}
            className="p-1 text-gray-500 hover:text-gray-700 transition-colors"
            title={tRes('reload')}
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        </div>

        {/* ── Header ────────────────────────────────────────────────────── */}
        <header className="watermark-header flex-shrink-0 px-5 py-4 flex items-center justify-between gap-3 text-white">
          <div className="flex items-center text-sm uppercase tracking-wide min-w-0">
            <span className="text-blue-200 font-medium">{t('appSubtitle')}</span>
            <span className="mx-2 text-blue-200">›</span>
            <span className="font-bold">{tRes('breadcrumbEnd')}</span>
          </div>
          <button
            onClick={reset}
            className="flex-shrink-0 bg-[#2563eb] hover:bg-[#1d4ed8] text-white px-4 py-2 rounded-lg text-sm font-medium transition-all"
          >
            {tRes('backHome')}
          </button>
        </header>

        {/* ── Content ───────────────────────────────────────────────────── */}
        <div className="flex-1 w-full max-w-5xl mx-auto px-4 py-6">
          {/* User info strip */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
            <div className="grid grid-cols-2 divide-x divide-gray-100">
              <div className="px-5 py-4">
                <p className="text-[11px] uppercase text-gray-400 mb-1">{tRes('fullName')}</p>
                <p className="font-bold text-gray-900">{fullName}</p>
              </div>
              <div className="px-5 py-4 text-right">
                <p className="text-[11px] uppercase text-gray-400 mb-1">ID</p>
                <p className="font-bold text-gray-900">{userCode}</p>
              </div>
            </div>
          </div>

          {resultRanked === false && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3 mb-6">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{tRes('notRanked')}</span>
            </div>
          )}

          {/* General result table (3 columns) */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
            <div className="md:grid md:grid-cols-[1fr_1fr_190px]">
              {/* Sections */}
              <div className="md:border-r md:border-gray-100">
                <div className="px-5 py-3 bg-blue-50 font-bold text-sm text-gray-700 border-b border-gray-100">
                  {tRes('section') + ':'}
                </div>
                {sections.map((s, i) => (
                  <div key={i} className="px-5 py-4 border-b border-gray-100 last:border-b-0 font-medium text-gray-800">
                    {s.name}
                  </div>
                ))}
              </div>
              {/* Section scores */}
              <div className="md:border-r md:border-gray-100 border-t md:border-t-0 border-gray-100">
                <div className="px-5 py-3 bg-blue-50 font-bold text-sm text-gray-700 border-b border-gray-100">
                  {tRes('sectionScore') + ':'}
                </div>
                {sections.map((s, i) => (
                  <div key={i} className="px-5 py-4 border-b border-gray-100 last:border-b-0 text-center font-semibold text-gray-800">
                    {s.score}
                  </div>
                ))}
              </div>
              {/* Total */}
              <div className="flex flex-col items-center justify-center py-5 border-t md:border-t-0 border-gray-100 bg-blue-50/40">
                <span className="text-sm font-bold text-gray-600 mb-1">{tRes('total') + ':'}</span>
                <span className="text-5xl font-bold text-[#2563eb] leading-none"><CountUp value={score} /></span>
                <span className="text-sm text-gray-400 mt-2">{tRes('outOfPoints', { count: totalPoints })} · {tRes('questionsCount', { count: totalQuestions })}</span>
              </div>
            </div>
          </div>

          {/* Donut chart: correct / wrong / skipped */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
            <div className="px-5 py-3 bg-blue-50 font-bold text-sm text-gray-700 border-b border-gray-100">
              {tRes('correctWrongSkipped')}
            </div>
            <div className="flex items-center gap-6 px-6 py-6 flex-wrap">
              <div className="relative w-32 h-32 mx-auto flex-shrink-0">
                <svg viewBox="0 0 100 100" className="w-32 h-32 -rotate-90">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="#f1f5f9" strokeWidth="14" />
                  <circle
                    cx="50" cy="50" r="42" fill="none" stroke="#22c55e" strokeWidth="14" strokeLinecap="round"
                    strokeDasharray={`${donutSeg(correct)} ${donutC}`}
                  />
                  <circle
                    cx="50" cy="50" r="42" fill="none" stroke="#ef4444" strokeWidth="14"
                    strokeDasharray={`${donutSeg(wrong)} ${donutC}`}
                    strokeDashoffset={-donutSeg(correct)}
                    className="transition-all"
                  />
                  <circle
                    cx="50" cy="50" r="42" fill="none" stroke="#cbd5e1" strokeWidth="14"
                    strokeDasharray={`${donutSeg(skipped)} ${donutC}`}
                    strokeDashoffset={-donutSeg(correct) - donutSeg(wrong)}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-gray-900">{totalPct}%</span>
                  <span className="text-[10px] text-gray-400 uppercase">{tRes('result')}</span>
                </div>
              </div>
              <div className="space-y-2 flex-1 min-w-[180px]">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-gray-600"><span className="w-3 h-3 rounded-full bg-green-500" />{tRes('correct')}</span>
                  <span className="font-bold text-gray-900">{correct}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-gray-600"><span className="w-3 h-3 rounded-full bg-red-500" />{tRes('wrong')}</span>
                  <span className="font-bold text-gray-900">{wrong}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-gray-600"><span className="w-3 h-3 rounded-full bg-slate-300" />{tRes('skipped')}</span>
                  <span className="font-bold text-gray-900">{skipped}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section full statistics */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
            <div className="px-5 py-3 bg-blue-50 font-bold text-sm text-gray-700 border-b border-gray-100">
              {tRes('fullStats')}
            </div>
            <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
              <div className="px-5 py-4">
                <p className="text-[11px] uppercase text-gray-400 mb-1">{tRes('section') + ':'}</p>
                <p className="font-semibold text-gray-800">{subjectLabel(selectedSubject?.name)}</p>
              </div>
              <div className="px-5 py-4">
                <p className="text-[11px] uppercase text-gray-400 mb-1">{tRes('answersCount') + ':'}</p>
                <p className="font-semibold text-gray-800">{answeredCount} / {totalQuestions}</p>
              </div>
              <div className="px-5 py-4">
                <p className="text-[11px] uppercase text-gray-400 mb-1">{tRes('sectionScore') + ':'}</p>
                <p className="font-semibold text-gray-800">{score}</p>
              </div>
            </div>

            {/* Test data table */}
            <div className="p-5">
              <p className="font-semibold text-gray-800 mb-3">{tRes('testData')}</p>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <tbody>
                    <tr>
                      <td className="border border-gray-200 px-3 py-2 bg-gray-50 font-semibold text-gray-700 whitespace-nowrap min-w-[190px]">
                        {tRes('order')}
                      </td>
                      {questions.map((_, i) => (
                        <td key={i} className="border border-gray-200 px-2 py-2 text-center font-medium text-gray-600">{i + 1}</td>
                      ))}
                    </tr>
                    <tr>
                      <td className="border border-gray-200 px-3 py-2 bg-gray-50 font-semibold text-gray-700 whitespace-nowrap">
                        {tRes('yourAnswer')}
                      </td>
                      {questions.map((_, i) => (
                        <td key={i} className={`border border-gray-200 px-2 py-2 text-center font-medium whitespace-nowrap ${isAnswered(answers[i]) ? 'text-gray-800' : 'text-gray-300'}`}>
                          {formatAnswer(answers[i]) || '-'}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="border border-gray-200 px-3 py-2 bg-gray-50 font-semibold text-gray-700 whitespace-nowrap">
                        {tRes('testResult')}
                      </td>
                      {questions.map((_, i) => {
                        const got = scoreAnswer(questions[i], answers[i]);
                        return (
                          <td key={i} className={`border border-gray-200 px-2 py-2 text-center font-bold ${got === maxScore(questions[i]) ? 'text-green-600' : got > 0 ? 'text-amber-600' : 'text-red-500'}`}>
                            {got}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Review section — разбор ответов */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
            <button
              onClick={() => setShowAnswerCard(!showAnswerCard)}
              className="w-full flex items-center justify-between px-5 py-3 bg-blue-50 hover:bg-blue-100/80 transition-colors"
            >
              <span className="font-bold text-sm text-gray-700">{tRes('reviewTitle')}</span>
              <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${showAnswerCard ? 'rotate-180' : ''}`} />
            </button>
            {showAnswerCard && (
              <div className="divide-y divide-gray-100">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                  <p className="text-xs text-gray-500">{tRes('reviewDesc')}</p>
                </div>
                {questions.map((q, i) => (
                  <ReviewItem
                    key={q.id}
                    question={q}
                    index={i}
                    userAnswer={answers[i] ?? null}
                    language={language}
                    tRes={tRes}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={reset}
              className="flex-1 py-3 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium rounded-xl transition-colors"
            >
              {t('backToMain')}
            </button>
            <button
              onClick={() => requestRetake(selectedVariant!)}
              className="flex-1 py-3 bg-[#2563eb] hover:bg-[#1e3a8a] text-white font-medium rounded-xl transition-colors"
            >
              {t('tryAgain')}
            </button>
          </div>
        </div>
      </div>

        {/* Retake confirmation (result stage) */}
        {showRetakeConfirm && (
          <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={() => setShowRetakeConfirm(false)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
              <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
                <RotateCcw className="w-6 h-6 text-blue-500" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">{t('retakeConfirmTitle')}</h3>
              <p className="text-gray-500 text-sm mb-2">{t('retakeConfirmDesc')}</p>
              <p className="text-amber-600 text-xs mb-6">{tRes('retakeNotRanked')}</p>
              <div className="flex gap-3">
                <button onClick={() => setShowRetakeConfirm(false)}
                  className="flex-1 py-2.5 border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium rounded-xl transition-all">
                  {t('cancel')}
                </button>
                <button onClick={confirmRetake}
                  className="flex-1 py-2.5 bg-[#2563eb] hover:bg-[#1e3a8a] text-white font-medium rounded-xl transition-all">
                  {t('confirmRetake')}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}
