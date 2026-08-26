import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence, animate } from 'framer-motion';
import { CheckCircle, X, AlertCircle, Check, Trophy, FileQuestion, Calculator, Monitor, Globe, Globe2, Leaf, Atom, FlaskConical, MapPin, BookOpen, ArrowLeft, Loader2, Sparkles, ArrowRight, Menu, User, Layers, Grid3x3, Droplets, RotateCcw, ChevronLeft, ChevronDown, Clock } from 'lucide-react';
import { useAuth } from '@baiqautest/shared';
import { useLanguage } from '@baiqautest/shared';
import { LanguageSwitcher } from '@baiqautest/shared';
import { getSubjects, getVariants, getVariantsBySubjectId, getQuestionsByVariantId, getTestResultByVariant, saveTestResult, getUserStats } from '@baiqautest/shared';
import { getStudyRecommendation, isAIConfigured, explainQuestion, playCorrect, playWrong, playFinish } from '@baiqautest/shared';
import { getLeaderboard, getMyRank, getUserStreak, type LeaderboardEntry, type MyRank } from '@baiqautest/shared';
import { useSubjectLabel } from '@baiqautest/shared';
import type { Subject, Variant, Question } from '@baiqautest/shared';

type Stage = 'dashboard' | 'variants' | 'test' | 'result';

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

// Circular countdown timer
function CircularTimer({ seconds, total }: { seconds: number; total: number }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const pct = total > 0 ? Math.max(0, Math.min(1, seconds / total)) : 0;
  const isDanger = seconds <= 60;
  const isWarn = seconds <= 300;
  const color = isDanger ? '#ef4444' : isWarn ? '#f59e0b' : '#38bdf8';
  const mm = Math.floor(seconds / 60).toString().padStart(2, '0');
  const ss = (seconds % 60).toString().padStart(2, '0');
  return (
    <div className="relative w-11 h-11 flex-shrink-0" role="timer" aria-label={`${mm}:${ss}`}>
      <svg viewBox="0 0 40 40" className="w-11 h-11 -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" stroke="#334155" strokeWidth="4" opacity="0.35" />
        <circle
          cx="20" cy="20" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
          className={isDanger ? 'animate-pulse' : ''}
          style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s ease' }}
        />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center text-[10px] font-bold ${
        isDanger ? 'text-red-400' : isWarn ? 'text-amber-300' : 'text-white'
      }`}>
        {mm}:{ss}
      </span>
    </div>
  );
}

// Per-question review item (own state — valid separate component)
function ReviewItem({
  question,
  index,
  userAnswer,
  subjectName,
  language,
  tRes,
}: {
  question: Question;
  index: number;
  userAnswer: string | null;
  subjectName: string;
  language: 'kz' | 'ru';
  tRes: (key: string) => string;
}) {
  const [explainState, setExplainState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [explainText, setExplainText] = useState('');

  const isCorrect = userAnswer === question.correct_answer;

  return (
    <div className="px-5 py-4">
      <div className="flex items-start gap-3">
        <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
          userAnswer === null
            ? 'bg-slate-100 text-slate-400'
            : isCorrect
            ? 'bg-green-100 text-green-700'
            : 'bg-red-100 text-red-700'
        }`}>
          {userAnswer === null ? '–' : isCorrect ? '✓' : '✗'}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 mb-2">
            {index + 1}. {question.question_text}
          </p>
          <div className="grid grid-cols-2 gap-1.5 mb-2">
            {(['A', 'B', 'C', 'D'] as const).map(opt => {
              const optText = question[`option_${opt.toLowerCase() as 'a' | 'b' | 'c' | 'd'}`];
              const isUserAns = userAnswer === opt;
              const isCorrectAns = question.correct_answer === opt;
              return (
                <div key={opt} className={`px-3 py-1.5 rounded-lg text-xs border ${
                  isUserAns && isCorrectAns
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : isUserAns && !isCorrectAns
                    ? 'bg-red-50 border-red-200 text-red-600'
                    : isCorrectAns
                    ? 'bg-green-50/50 border-green-100 text-green-600'
                    : 'bg-white border-gray-200 text-gray-600'
                } ${isUserAns ? 'font-bold' : ''}`}>
                  <span className="font-semibold mr-1">{opt})</span>{optText}
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-400">
              {tRes('yourAnswer')}: <span className={`font-bold ${userAnswer ? (isCorrect ? 'text-green-600' : 'text-red-500') : 'text-gray-400'}`}>{userAnswer || tRes('noAnswer')}</span>
            </span>
            <span className="text-gray-300">·</span>
            <span className="text-gray-400">
              {tRes('correctAnswerShort')}: <span className="font-bold text-green-600">{question.correct_answer}</span>
            </span>
          </div>
          <button
            onClick={async () => {
              if (explainState !== 'idle') return;
              setExplainState('loading');
              try {
                const text = await explainQuestion(
                  question.question_text,
                  { a: question.option_a, b: question.option_b, c: question.option_c, d: question.option_d },
                  question.correct_answer,
                  userAnswer || '—',
                  subjectName,
                  language,
                );
                setExplainText(text);
              } catch {
                setExplainText(language === 'kz' ? 'Түсіндіру қатесі' : 'Ошибка объяснения');
              }
              setExplainState('done');
            }}
            className="mt-2 flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-700 font-medium transition-colors"
          >
            <Sparkles className="w-3 h-3" />
            {explainState === 'loading' ? tRes('explaining') : tRes('explainThis')}
          </button>
          {explainText && (
            <div className="mt-2 p-3 bg-blue-50 rounded-lg text-xs text-gray-700 leading-relaxed">
              {explainText}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function TestsPage() {
  const { user, profile } = useAuth();
  const { t, language } = useLanguage();
  const [stage, setStage] = useState<Stage>('dashboard');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ testsCompleted: 0, averageScore: 0, bestResult: 0 });
  const [aiRecommendation, setAiRecommendation] = useState<string>('');
  const [loadingRecommendation, setLoadingRecommendation] = useState(false);
  const [variantResults, setVariantResults] = useState<Record<number, { score: number; total_score: number } | null>>({});
  const [showAnswerCard, setShowAnswerCard] = useState(false);
  const [streak, setStreak] = useState(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myRank, setMyRank] = useState<MyRank | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const subjectLabel = useSubjectLabel();
  const { t: tTest } = useTranslation('test');
  const { t: tRes } = useTranslation('results');
  const [timeLeft, setTimeLeft] = useState(0);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const [offline, setOffline] = useState(false);
  const finishingRef = useRef(false);

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

  function getOptionText(question: Question, option: string): string {
    switch (option) {
      case 'A': return question.option_a;
      case 'B': return question.option_b;
      case 'C': return question.option_c;
      case 'D': return question.option_d;
      default: return '';
    }
  }

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
    if (stage === 'dashboard' && isAIConfigured() && stats.testsCompleted > 0 && !aiRecommendation) {
      loadRecommendation();
    }
  }, [stats, stage]);

  // Load streak + leaderboard on dashboard
  useEffect(() => {
    if (stage !== 'dashboard') return;
    let active = true;
    (async () => {
      try {
        const [s, lb, rank] = await Promise.all([
          getUserStreak().catch(() => 0),
          getLeaderboard().catch(() => []),
          getMyRank().catch(() => null),
        ]);
        if (!active) return;
        setStreak(s);
        setLeaderboard(lb);
        setMyRank(rank);
      } catch { /* ignore */ }
    })();
    return () => { active = false; };
  }, [stage]);

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
      const questionsData = await getQuestionsByVariantId(variant.id);
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

  // Exam countdown timer (1 minute per question)
  const timerInitRef = useRef(false);
  useEffect(() => {
    if (stage !== 'test') {
      timerInitRef.current = false;
      return;
    }
    if (questions.length > 0 && !finishingRef.current && !timerInitRef.current) {
      timerInitRef.current = true;
      setTimeLeft(questions.length * 60);
      setTimeUp(false);
    }
  }, [stage, questions.length]);

  useEffect(() => {
    if (stage !== 'test' || timeLeft <= 0) return;
    const t = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    return () => clearInterval(t);
  }, [stage, timeLeft]);

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

  // Keyboard navigation: 1-4 select answer, Enter next
  useEffect(() => {
    if (stage !== 'test') return;
    const handler = (e: KeyboardEvent) => {
      const key = e.key;
      if (key >= '1' && key <= '4') {
        const option = (['A', 'B', 'C', 'D'] as const)[Number(key) - 1];
        if (option) selectAnswer(option);
      } else if (key === 'Enter') {
        e.preventDefault();
        if (currentQuestion < questions.length - 1) {
          setCurrentQuestion(p => Math.min(questions.length - 1, p + 1));
        } else {
          setShowFinishConfirm(true);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [stage, currentQuestion, questions.length, answers]);

  function selectAnswer(answer: string) {
    const wasAnswered = answers[currentQuestion];
    setAnswers(prev => ({ ...prev, [currentQuestion]: answer }));
    if (answer !== wasAnswered) {
      if (answer === questions[currentQuestion]?.correct_answer) {
        playCorrect();
      } else {
        playWrong();
      }
    }
  }

  function goBackToVariants() {
    if (selectedSubject) {
      setStage('variants');
    } else {
      reset();
    }
  }

  async function finishTest() {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setShowFinishConfirm(false);

    let finalScore = 0;
    questions.forEach((q, i) => {
      if (answers[i] === q.correct_answer) {
        finalScore++;
      }
    });
    setScore(finalScore);

    if (user && selectedVariant) {
      try {
        const answersById: Record<string, string> = {};
        questions.forEach((q, i) => {
          if (answers[i]) answersById[q.id] = answers[i];
        });
        await saveTestResult({
          student_id: user.id,
          variant_id: selectedVariant.id,
          score: finalScore,
          total_score: selectedVariant.total_score,
          answers: answersById,
        });
        // Refresh stats
        const userStats = await getUserStats(user.id);
        setStats(userStats);
        playFinish();
      } catch (err) {
        console.error('Error saving result:', err);
      }
    } else {
      playFinish();
    }
    try {
      if (selectedVariant) localStorage.removeItem(`exam_answers_${user?.id ?? 'guest'}_${selectedVariant.id}`);
    } catch { /* ignore */ }
    setStage('result');
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

        {/* AI Recommendation Card */}
        {isAIConfigured() && (
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
        {leaderboard.length > 0 && (
          <div className="mt-8">
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="w-5 h-5 text-amber-500" />
              <h2 className="text-xl font-bold text-gray-900">
                {language === 'kz' ? 'Лидерборд' : 'Лидерборд'}
              </h2>
            </div>
            <div className="card p-2 divide-y divide-gray-100">
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
                      <span className="text-sm text-gray-400 hidden sm:inline">{tTest('best')}: {entry.best_percent}%</span>
                      <span className="text-sm font-bold text-gray-900">{entry.avg_percent}%</span>
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
                  <span className="text-sm font-bold text-gray-900 flex-shrink-0">{myRank.avg_percent}%</span>
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
                      <div className="flex items-center gap-2">
                        <FileQuestion className="w-4 h-4 text-gray-400" />
                        <span>{variant.total_score} {tTest('questions')}</span>
                      </div>
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
              <p className="text-gray-500 text-sm mb-6">{t('retakeConfirmDesc')}</p>
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

  // ── Full-screen exam (testcenter.kz style) ──────────────────────────────────
  if (stage === 'test' && selectedVariant) {
    if (loading) {
      return (
        <div className="fixed inset-0 z-50 bg-slate-100 flex items-center justify-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#2563eb]" />
        </div>
      );
    }

    if (questions.length === 0) {
      return (
        <div className="fixed inset-0 z-50 bg-slate-100 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-8 text-center max-w-md mx-4">
            <AlertCircle className="w-12 h-12 text-amber-400 mx-auto mb-3" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">{t('noQuestions')}</h2>
            <p className="text-gray-500 mb-4">{t('noQuestionsDesc')}</p>
            <button onClick={reset} className="px-6 py-2.5 bg-[#2563eb] text-white rounded-xl font-medium">{t('backToMain')}</button>
          </div>
        </div>
      );
    }

    const question = questions[currentQuestion];
    if (!question) {
      return (
        <div className="fixed inset-0 z-50 bg-slate-100 flex items-center justify-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#2563eb]" />
        </div>
      );
    }
    const answeredCount = questions.filter((_, i) => i in answers).length;
    const isAnswered = currentQuestion in answers;

    const sidebarItems = [
      { icon: User,     label: profile?.first_name || 'Мирас', id: 'profile' },
      { icon: Layers,   label: tTest('sections'), id: 'sections' },
      { icon: Grid3x3,  label: tTest('answerCard'), id: 'answerCard' },
      { icon: Calculator, label: tTest('calculator'), id: 'calc' },
      { icon: Atom,     label: tTest('mendeleev'), id: 'mendeleev' },
      { icon: Droplets, label: tTest('solubility'), id: 'solubility' },
    ];

    return (
      <div className="fixed inset-0 z-50 bg-slate-100 flex overflow-hidden overflow-x-hidden">
        {/* ── Left sidebar ─────────────────────────────────────────────── */}
        <aside className="w-16 lg:w-28 bg-[#DCEEFC] flex-shrink-0 flex flex-col items-center py-4 gap-4 overflow-y-auto border-r border-blue-200">
          {sidebarItems.map(item => {
            const Icon = item.icon;
            const isProfile = item.id === 'profile';
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (item.id === 'answerCard') setShowAnswerCard(true);
                }}
                className={`flex flex-col items-center gap-1 w-full px-2 py-2 rounded-xl transition-colors ${
                  isProfile ? 'cursor-default' : 'hover:bg-blue-200/50'
                }`}
                title={item.label}
              >
                <Icon className={`w-5 h-5 ${isProfile ? 'text-[#2563eb]' : 'text-[#2563eb]'}`} />
                <span className="text-[10px] lg:text-[11px] text-gray-700 font-medium text-center leading-tight">
                  {item.label}
                </span>
              </button>
            );
          })}
        </aside>

        {/* ── Main area ────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <header className="bg-gradient-to-r from-[#2563eb] to-[#1e3a8a] flex items-center px-3 sm:px-4 py-2.5 sm:py-3 flex-shrink-0 gap-2 sm:gap-3">
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <button onClick={() => goBackToVariants()} className="text-white/80 hover:text-white" aria-label="Menu">
                <Menu className="w-5 h-5" />
              </button>
              <span className="text-white font-semibold text-sm hidden sm:inline">
                {[profile?.last_name, profile?.first_name].filter(Boolean).join(' ')}
              </span>
            </div>

            <div className="flex-1 flex justify-center min-w-0">
              <button
                onClick={() => setShowFinishConfirm(true)}
                className="px-3 sm:px-5 py-1.5 bg-white text-red-500 border-2 border-red-500 rounded-lg text-xs sm:text-sm font-bold hover:bg-red-500 hover:text-white transition-all whitespace-nowrap"
              >
                {t('finishTest')}
              </button>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <CircularTimer seconds={timeLeft} total={questions.length * 60} />
              <button onClick={goBackToVariants} className="flex items-center gap-1 text-white/80 hover:text-white text-sm font-medium">
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden sm:inline">{tTest('previousSubject')}</span>
              </button>
            </div>
          </header>

          {/* Offline warning bar */}
          {offline && (
            <div className="flex-shrink-0 bg-amber-50 border-b border-amber-200 text-amber-700 text-xs font-medium px-4 py-1.5 text-center">
              {language === 'kz'
                ? '⚠ Байланыс жоқ, жауаптар жергілікті сақталуда...'
                : '⚠ Нет соединения, ответы сохраняются локально...'}
            </div>
          )}

          {/* Question number nav */}
          <div className="bg-white border-b border-gray-200 px-3 py-2 flex items-center gap-1.5 overflow-x-auto flex-shrink-0">
            {questions.map((_, i) => {
              const isAns = i in answers;
              const isCur = i === currentQuestion;
              return (
                <button
                  key={i}
                  onClick={() => setCurrentQuestion(i)}
                  className={`min-w-[32px] h-8 px-1.5 rounded-lg text-xs font-bold flex-shrink-0 transition-all border-2 ${
                    isCur
                      ? 'bg-[#DCEEFC] border-gray-800 text-gray-800'
                      : isAns
                        ? 'bg-[#DCEEFC] border-transparent text-[#2563eb]'
                        : 'bg-gray-50 border-transparent text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
              {/* Question card with slide transition */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentQuestion}
                  initial={{ opacity: 0, x: 40 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -40 }}
                  transition={{ duration: 0.28, ease: 'easeInOut' }}
                  className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                >
                  {/* Top row: question number + next button */}
                  <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-100">
                    <span className="text-sm font-bold text-gray-700">
                      {t('question')} {currentQuestion + 1} {t('of')} {questions.length}
                    </span>
                    <button
                      onClick={() => {
                        if (currentQuestion < questions.length - 1) {
                          setCurrentQuestion(p => p + 1);
                        } else {
                          setShowFinishConfirm(true);
                        }
                      }}
                      disabled={!isAnswered && currentQuestion < questions.length - 1}
                      className={`flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-bold transition-colors ${
                        isAnswered || currentQuestion === questions.length - 1
                          ? 'bg-[#2563eb] text-white hover:bg-[#1e3a8a]'
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {currentQuestion < questions.length - 1 ? (
                        <>{tTest('nextQuestion')} <ArrowRight className="w-4 h-4" /></>
                      ) : (
                        tTest('finish')
                      )}
                    </button>
                  </div>

                  {/* Question text */}
                  <div className="px-4 sm:px-6 py-5">
                    <p className="text-lg font-medium text-gray-900 leading-relaxed">{question.question_text}</p>
                  </div>

                  {/* Answers as checkboxes */}
                  <div className="border-t border-gray-100 divide-y divide-gray-100">
                    {(['A', 'B', 'C', 'D'] as const).map(option => {
                      const optionText = getOptionText(question, option);
                      const isSelected = answers[currentQuestion] === option;
                      return (
                        <button
                          key={option}
                          onClick={() => selectAnswer(option)}
className={`w-full flex items-center gap-4 px-4 sm:px-6 py-4 text-left transition-colors hover:bg-gray-50 ${
                          isSelected ? 'bg-blue-50' : ''
                        }`}
                        >
                          <div className={`w-5 h-5 flex-shrink-0 rounded border-2 flex items-center justify-center transition-colors ${
                            isSelected
                              ? 'border-[#2563eb] bg-[#2563eb]'
                              : 'border-gray-300'
                          }`}>
                            {isSelected && <Check className="w-3.5 h-3.5 text-white checkbox-bounce" />}
                          </div>
                          <span className="text-sm font-medium text-gray-700 min-w-[16px] flex-shrink-0">{option})</span>
                          <span className={`text-sm ${isSelected ? 'text-gray-900 font-semibold' : 'text-gray-700'}`}>{optionText}</span>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* ── Right-side tools ──────────────────────────────────────────── */}
        <div className="hidden sm:flex flex-col items-center gap-3 w-10 lg:w-16 flex-shrink-0 bg-white border-l border-gray-200 py-4">
          <LanguageSwitcher />
          <button
            onClick={() => {
              if (confirm(tTest('resetAnswers'))) {
                setAnswers({});
              }
            }}
            className="flex flex-col items-center gap-1 text-gray-500 hover:text-gray-700 transition-colors"
            title={tTest('reset')}
          >
            <RotateCcw className="w-5 h-5" />
            <span className="hidden lg:inline text-[10px] font-medium">Reset</span>
          </button>
        </div>

        {/* ── Answer Card Modal ─────────────────────────────────────────── */}
        {showAnswerCard && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={() => setShowAnswerCard(false)}>
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-900">{tTest('answerCard')}</h3>
                <button onClick={() => setShowAnswerCard(false)} className="p-1 text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {questions.map((_, i) => {
                  const isAns = i in answers;
                  const isCur = i === currentQuestion;
                  return (
                    <button
                      key={i}
                      onClick={() => { setCurrentQuestion(i); setShowAnswerCard(false); }}
                      className={`w-10 h-10 rounded-lg text-sm font-bold transition-all ${
                        isCur
                          ? 'bg-gray-800 text-white'
                          : isAns
                            ? 'bg-[#2563eb] text-white'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Finish confirmation modal ─────────────────────────────────── */}
        {showFinishConfirm && (
          <div
            className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4"
            onClick={() => setShowFinishConfirm(false)}
          >
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
              <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
                <AlertCircle className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                {t('finishTest')}
              </h3>
              <p className="text-gray-500 text-sm mb-6">
                {tTest('finishConfirmAnswered', { answered: answeredCount, skipped: questions.length - answeredCount })}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowFinishConfirm(false)}
                  className="flex-1 py-2.5 border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium rounded-xl transition-all"
                >
                  {tTest('goBack')}
                </button>
                <button
                  onClick={finishTest}
                  className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white font-medium rounded-xl transition-all"
                >
                  {tTest('yesFinish')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Time-up modal ─────────────────────────────────────────────── */}
        {timeUp && (
          <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
                <Clock className="w-7 h-7 text-amber-500" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                {tTest('timeUp')}
              </h3>
              <p className="text-gray-500 text-sm">
                {tTest('timeUpSaved')}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }
  if (stage === 'result' && selectedVariant) {
    const totalQuestions = questions.length || selectedVariant.total_score;
    const answeredCount = questions.filter((_, i) => i in answers).length;
    const fullName = [profile?.last_name, profile?.first_name].filter(Boolean).join(' ') || '—';
    const userCode = profile?.phone?.replace(/\D/g, '') || deriveCode(user?.id || '');
    const sections = [{ name: selectedSubject?.name || '—', score }];

    let correct = 0;
    let wrong = 0;
    let skipped = 0;
    questions.forEach((q, i) => {
      if (!(i in answers)) skipped++;
      else if (answers[i] === q.correct_answer) correct++;
      else wrong++;
    });
    const totalPct = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;
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
                <span className="text-sm text-gray-400 mt-2">{tRes('questionsCount', { count: totalQuestions })}</span>
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
                <p className="font-semibold text-gray-800">{selectedSubject?.name || '—'}</p>
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
                        <td key={i} className={`border border-gray-200 px-2 py-2 text-center font-medium ${answers[i] ? 'text-gray-800' : 'text-gray-300'}`}>
                          {answers[i] || '-'}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="border border-gray-200 px-3 py-2 bg-gray-50 font-semibold text-gray-700 whitespace-nowrap">
                        {tRes('testResult')}
                      </td>
                      {questions.map((_, i) => {
                        const ok = answers[i] === questions[i].correct_answer;
                        return (
                          <td key={i} className={`border border-gray-200 px-2 py-2 text-center font-bold ${ok ? 'text-green-600' : 'text-red-500'}`}>
                            {ok ? 1 : 0}
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
                    userAnswer={answers[i] || null}
                    subjectName={selectedSubject?.name || ''}
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
              <p className="text-gray-500 text-sm mb-6">{t('retakeConfirmDesc')}</p>
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
