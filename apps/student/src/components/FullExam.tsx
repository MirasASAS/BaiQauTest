import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ArrowLeft, Check, ChevronDown, GraduationCap, Loader2 } from 'lucide-react';
import { useAuth, useLanguage, useSubjectLabel, getFullExamOptions, getOpenFullExam, startFullExam, submitFullExam, isAnswered, formatAnswer, withAnswerKey, playSelect, playFinish } from '@baiqautest/shared';
import type { AnswerValue, ExamSection, ExamSession, FullExamOption, TestResult } from '@baiqautest/shared';
import { ExamScreen, type ExamScreenSection } from './ExamScreen';
import { ReviewItem } from './ReviewItem';

type Stage = 'loading' | 'setup' | 'exam' | 'result';

// Полный ЕНТ: обязательные предметы + два профильных в одной попытке с общим таймером.
// Состав, время и подсчёт — на сервере (start_full_exam / submit_full_exam, SQL 12).
export function FullExam({ onClose }: { onClose: () => void }) {
  const { user, profile } = useAuth();
  const { t, language } = useLanguage();
  const { t: tTest } = useTranslation('test');
  const { t: tRes } = useTranslation('results');
  const subjectLabel = useSubjectLabel();

  const [stage, setStage] = useState<Stage>('loading');
  const [options, setOptions] = useState<FullExamOption[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const [session, setSession] = useState<ExamSession | null>(null);
  const [sections, setSections] = useState<ExamSection[]>([]);
  const [current, setCurrent] = useState(0);
  // Ответы по индексу вопроса в общем списке
  const [answers, setAnswers] = useState<Record<number, AnswerValue>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const [offline, setOffline] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [results, setResults] = useState<TestResult[]>([]);
  const [openReview, setOpenReview] = useState<number | null>(null);
  const finishingRef = useRef(false);
  // Дедлайн по часам устройства; сам срок задаёт сервер
  const deadlineRef = useRef(0);

  const questions = useMemo(() => sections.flatMap(s => s.questions), [sections]);
  const ranges: ExamScreenSection[] = useMemo(() => {
    let start = 0;
    return sections.map(s => {
      const range = { name: subjectLabel(s.subject), start, count: s.questions.length };
      start += s.questions.length;
      return range;
    });
    // subjectLabel меняется вместе с языком
  }, [sections, language]);

  const storageKey = session ? `full_exam_answers_${user?.id ?? 'guest'}_${session.id}` : null;

  // Незавершённый тест продолжается сразу, иначе — выбор профильных предметов
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const open = user ? await getOpenFullExam(user.id) : null;
        if (!active) return;
        if (open) {
          await begin(null);
          return;
        }
        const list = await getFullExamOptions();
        if (!active) return;
        setOptions(list);
        setStage('setup');
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
        setStage('setup');
      }
    })();
    return () => { active = false; };
  }, [user?.id]);

  async function begin(profileIds: number[] | null) {
    setStarting(true);
    setError(null);
    try {
      const data = await startFullExam(profileIds);
      finishingRef.current = false;
      deadlineRef.current = Date.now() + data.msLeft;
      setTotalSeconds(Math.round((new Date(data.session.expires_at).getTime() - new Date(data.session.started_at).getTime()) / 1000));
      setTimeLeft(Math.ceil(data.msLeft / 1000));
      setSession(data.session);
      setSections(data.sections);
      setCurrent(0);
      setTimeUp(false);

      // Ответы, сохранённые на устройстве до перезагрузки страницы (по id вопроса)
      const restored: Record<number, AnswerValue> = {};
      try {
        const saved = JSON.parse(localStorage.getItem(`full_exam_answers_${user?.id ?? 'guest'}_${data.session.id}`) || '{}');
        data.sections.flatMap(s => s.questions).forEach((q, i) => {
          if (isAnswered(saved?.[q.id])) restored[i] = saved[q.id];
        });
      } catch { /* ignore */ }
      setAnswers(restored);
      setStage('exam');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage('setup');
    }
    setStarting(false);
  }

  // Отсчёт до серверного дедлайна: считается от дедлайна, а не тиками
  useEffect(() => {
    if (stage !== 'exam') return;
    const tick = () => setTimeLeft(Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [stage, session?.id]);

  // Автосдача, когда время вышло (только если таймер реально тикал)
  const prevTimeRef = useRef(-1);
  useEffect(() => {
    if (stage === 'exam' && timeLeft === 0 && questions.length > 0 && !finishingRef.current && prevTimeRef.current > 0) {
      setTimeUp(true);
      finish();
    }
    prevTimeRef.current = timeLeft;
  }, [timeLeft, stage]);

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

  function answersById(): Record<string, AnswerValue> {
    const byId: Record<string, AnswerValue> = {};
    questions.forEach((q, i) => {
      if (isAnswered(answers[i])) byId[q.id] = answers[i];
    });
    return byId;
  }

  // Автосохранение ответов на устройстве (debounce 500 мс)
  useEffect(() => {
    if (stage !== 'exam' || !storageKey) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(answersById()));
      } catch { /* ignore */ }
    }, 500);
    return () => clearTimeout(timer);
  }, [answers, stage, storageKey]);

  function selectAnswer(answer: AnswerValue | null) {
    setAnswers(prev => {
      const next = { ...prev };
      if (answer === null) delete next[current];
      else next[current] = answer;
      return next;
    });
    if (answer !== null && formatAnswer(answer) !== formatAnswer(answers[current])) playSelect();
  }

  async function finish() {
    if (finishingRef.current || !session) return;
    finishingRef.current = true;
    setShowFinishConfirm(false);
    setSubmitError(null);
    try {
      const data = await submitFullExam(session.id, answersById());
      setSession(data.session);
      setResults(data.results);
      setSections(prev => prev.map(s => ({ ...s, questions: s.questions.map(q => withAnswerKey(q, data.answerKey[q.id])) })));
    } catch (err) {
      // Не сохранилось — остаёмся в тесте, ответы лежат на устройстве, можно повторить
      console.error('Error saving full exam:', err);
      finishingRef.current = false;
      setTimeUp(false);
      setSubmitError(err instanceof Error ? err.message : String(err));
      return;
    }
    playFinish();
    try {
      if (storageKey) localStorage.removeItem(storageKey);
    } catch { /* ignore */ }
    setStage('result');
  }

  if (stage === 'loading') {
    return (
      <div className="fixed inset-0 z-50 bg-slate-100 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-[#2563eb] animate-spin" />
      </div>
    );
  }

  if (stage === 'setup') {
    const required = options.filter(o => o.required);
    const profileOptions = options.filter(o => !o.required);
    // предмет без варианта по структуре ЕНТ попадёт в тест с другим числом заданий
    const offSpec = (o: FullExamOption) => o.ent_variants === 0;
    const toggle = (id: number) => setPicked(prev => (
      prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 2 ? [...prev, id] : prev
    ));
    return (
      <div className="max-w-3xl mx-auto">
        <button onClick={onClose} className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          {t('back')}
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-[#1e3a8a] flex items-center justify-center">
            <GraduationCap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{tTest('fullExamTitle')}</h1>
            <p className="text-gray-500">{tTest('fullExamRules')}</p>
          </div>
        </div>

        {/* Структура ЕНТ */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            ['120', tTest('fullExamStatQuestions')],
            ['140', tTest('fullExamStatPoints')],
            ['240', tTest('fullExamStatMinutes')],
          ].map(([value, label]) => (
            <div key={label} className="card px-4 py-3 text-center">
              <p className="text-2xl font-bold text-[#1e3a8a] leading-none">{value}</p>
              <p className="text-xs text-gray-500 mt-1.5">{label}</p>
            </div>
          ))}
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3 mb-5">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span className="break-words">{error}</span>
          </div>
        )}

        <div className="card p-5 mb-5">
          <h2 className="font-bold text-gray-900 mb-1">{tTest('fullExamRequired')}</h2>
          <p className="text-sm text-gray-500 mb-3">{tTest('fullExamRequiredDesc')}</p>
          {required.length === 0 ? (
            <p className="text-sm text-amber-600">{tTest('fullExamNoRequired')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {required.map(o => (
                <span key={o.subject_id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 text-[#1e3a8a] text-sm font-medium">
                  <Check className="w-4 h-4" />
                  {subjectLabel(o.subject)}
                  {o.questions != null && !offSpec(o) && <span className="text-[#2563eb]/70 font-normal">· {o.questions}</span>}
                  {offSpec(o) && <span className="text-amber-600 font-normal">· {tTest('fullExamOffSpec')}</span>}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5 mb-6">
          <h2 className="font-bold text-gray-900 mb-1">{tTest('fullExamProfile')}</h2>
          <p className="text-sm text-gray-500 mb-3">{tTest('fullExamProfileDesc', { picked: picked.length })}</p>
          {profileOptions.length < 2 ? (
            <p className="text-sm text-amber-600">{tTest('fullExamNotEnough')}</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {profileOptions.map(o => {
                const isPicked = picked.includes(o.subject_id);
                return (
                  <button
                    key={o.subject_id}
                    onClick={() => toggle(o.subject_id)}
                    aria-pressed={isPicked}
                    className={`px-4 py-3 rounded-xl border-2 text-left ${
                      isPicked ? 'border-[#2563eb] bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-200'
                    }`}
                  >
                    <span className={`block font-semibold ${isPicked ? 'text-[#1e3a8a]' : 'text-gray-900'}`}>{subjectLabel(o.subject)}</span>
                    <span className="block text-xs text-gray-500 mt-0.5">
                      {offSpec(o)
                        ? <span className="text-amber-600">{tTest('fullExamOffSpec')}</span>
                        : o.questions != null
                        ? tTest('fullExamSection', { questions: o.questions, points: o.points })
                        : <>{o.variants} {t('variantsCount')}</>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <button
          onClick={() => begin(picked)}
          disabled={picked.length !== 2 || starting}
          className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#2563eb] hover:bg-[#1e3a8a] text-white font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {starting && <Loader2 className="w-5 h-5 animate-spin" />}
          {tTest('fullExamStart')}
        </button>
      </div>
    );
  }

  if (stage === 'exam') {
    return (
      <ExamScreen
        loading={false}
        studentName={[profile?.last_name, profile?.first_name].filter(Boolean).join(' ')}
        subjectName={tTest('fullExamTitle')}
        variantName={tTest('fullExamTitle')}
        questions={questions}
        sections={ranges}
        currentQuestion={current}
        onNavigate={setCurrent}
        answers={answers}
        onSelectAnswer={selectAnswer}
        onResetAnswers={() => setAnswers({})}
        timeLeft={timeLeft}
        totalSeconds={totalSeconds}
        offline={offline}
        onExit={onClose}
        onBackHome={onClose}
        showFinishConfirm={showFinishConfirm}
        onFinishConfirmChange={setShowFinishConfirm}
        onFinish={finish}
        submitError={submitError}
        onDismissSubmitError={() => setSubmitError(null)}
        timeUp={timeUp}
      />
    );
  }

  // ── Результат ────────────────────────────────────────────────────────
  const score = session?.score ?? 0;
  const total = session?.total_score ?? 0;
  const percent = total > 0 ? Math.round((score / total) * 100) : 0;
  const anyUnranked = results.some(r => r.is_ranked === false);

  return (
    <div className="fixed inset-0 z-50 watermark-page flex flex-col overflow-y-auto overflow-x-hidden">
      <header className="watermark-header flex-shrink-0 px-5 py-4 flex items-center justify-between gap-3 text-white">
        <div className="flex items-center text-sm uppercase tracking-wide min-w-0">
          <span className="text-blue-200 font-medium truncate">{tTest('fullExamTitle')}</span>
          <span className="mx-2 text-blue-200">›</span>
          <span className="font-bold">{tRes('breadcrumbEnd')}</span>
        </div>
        <button onClick={onClose} className="flex-shrink-0 bg-[#2563eb] hover:bg-[#1d4ed8] text-white px-4 py-2 rounded-lg text-sm font-medium transition-all">
          {tRes('backHome')}
        </button>
      </header>

      <div className="flex-1 w-full max-w-5xl mx-auto px-4 py-6">
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-6 mb-6 flex items-center gap-6 flex-wrap">
          <div>
            <p className="text-sm font-bold text-gray-500 mb-1">{tRes('total')}:</p>
            <p className="text-5xl font-bold text-[#2563eb] leading-none">
              {score}<span className="text-2xl text-gray-400"> / {total}</span>
            </p>
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-gray-500">{[profile?.last_name, profile?.first_name].filter(Boolean).join(' ') || '—'}</span>
              <span className="font-bold text-gray-900">{percent}%</span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${percent >= 70 ? 'bg-green-500' : percent >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        </div>

        {anyUnranked && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3 mb-6">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{tRes('fullExamPartlyUnranked')}</span>
          </div>
        )}

        <div className="space-y-4 mb-6">
          {sections.map((section, s) => {
            const result = results.find(r => r.variant_id === section.variant_id);
            const range = ranges[s];
            const isOpen = openReview === s;
            return (
              <div key={section.variant_id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setOpenReview(isOpen ? null : s)}
                  className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-50 hover:!transform-none"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 truncate">{subjectLabel(section.subject)}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {tRes('questionsCount', { count: section.questions.length })}
                      {result?.is_ranked === false && <span className="ml-2 text-gray-400">· {tRes('unranked')}</span>}
                    </p>
                  </div>
                  <span className="text-lg font-bold text-[#2563eb] tabular-nums flex-shrink-0">
                    {result ? `${result.score} / ${result.total_score}` : '—'}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <div className="divide-y divide-gray-100 border-t border-gray-100">
                    {section.questions.map((q, k) => (
                      <ReviewItem
                        key={q.id}
                        question={q}
                        index={k}
                        userAnswer={answers[range.start + k] ?? null}
                        language={language}
                        tRes={tRes}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button onClick={onClose} className="w-full py-3 bg-[#2563eb] hover:bg-[#1e3a8a] text-white font-medium rounded-xl transition-colors">
          {t('backToMain')}
        </button>
      </div>
    </div>
  );
}
