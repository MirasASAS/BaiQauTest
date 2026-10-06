import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, ArrowLeft, ArrowRight, Atom, Calculator, Clock, Droplets, Grid3x3, LogOut, RotateCcw, WifiOff, Wrench, X } from 'lucide-react';
import { useLanguage, LanguageSwitcher, localizeQuestion, MathText, ANSWER_LETTERS, isAnswered, formatAnswer, questionType } from '@baiqautest/shared';
import type { AnswerValue, TestQuestion } from '@baiqautest/shared';
import { Calculator as CalculatorTool, PeriodicTable, SolubilityTable } from './exam-tools';
import { QuestionAnswer, PassageBlock, pickLetter } from './QuestionAnswer';

// Раздел полного ЕНТ: вопросы идут одним списком, раздел — его отрезок
export interface ExamScreenSection {
  name: string;
  start: number;
  count: number;
}

// Кнопки с глобальным hover-масштабом (index.css) здесь не должны «прыгать»
const FLAT = 'hover:!transform-none active:!transform-none';

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const mm = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const ss = (seconds % 60).toString().padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

interface ExamScreenProps {
  loading: boolean;
  studentName: string;
  subjectName: string;
  variantName: string;
  questions: TestQuestion[];
  currentQuestion: number;
  onNavigate: (index: number) => void;
  // Разделы (только полный ЕНТ); без них тест — один предмет
  sections?: ExamScreenSection[];
  // Ответы по индексу вопроса
  answers: Record<number, AnswerValue>;
  // null — ответ на текущий вопрос снят
  onSelectAnswer: (answer: AnswerValue | null) => void;
  onResetAnswers: () => void;
  timeLeft: number;
  totalSeconds: number;
  offline: boolean;
  // Выйти из теста к списку вариантов (попытка и ответы сохраняются)
  onExit: () => void;
  onBackHome: () => void;
  showFinishConfirm: boolean;
  onFinishConfirmChange: (open: boolean) => void;
  onFinish: () => void;
  submitError: string | null;
  onDismissSubmitError: () => void;
  timeUp: boolean;
}

// Полноэкранный экзамен в стиле testcenter.kz: шапка с таймером, панель инструментов,
// лента номеров, крупная карточка вопроса и нижняя навигация.
export function ExamScreen({
  loading,
  studentName,
  subjectName,
  variantName,
  questions,
  sections,
  currentQuestion,
  onNavigate,
  answers,
  onSelectAnswer,
  onResetAnswers,
  timeLeft,
  totalSeconds,
  offline,
  onExit,
  onBackHome,
  showFinishConfirm,
  onFinishConfirmChange,
  onFinish,
  submitError,
  onDismissSubmitError,
  timeUp,
}: ExamScreenProps) {
  const { t, language } = useLanguage();
  const { t: tTest } = useTranslation('test');
  const [showAnswerCard, setShowAnswerCard] = useState(false);
  const [openTool, setOpenTool] = useState<'calc' | 'mendeleev' | 'solubility' | null>(null);
  // Панель инструментов на телефоне: боковой панели там нет
  const [showToolSheet, setShowToolSheet] = useState(false);

  // Клавиатура: 1–6 — ответ, ←/→ — соседний вопрос, Enter — дальше.
  // Пока открыто любое окно (калькулятор, карта ответов, подтверждение) клавиши экзамена молчат,
  // иначе цифры калькулятора выбирали бы ответы.
  const modalOpen = showAnswerCard || showToolSheet || openTool !== null || showFinishConfirm || !!submitError || timeUp;
  useEffect(() => {
    if (loading || modalOpen || questions.length === 0) return;
    const handler = (e: KeyboardEvent) => {
      const last = questions.length - 1;
      if (e.key === 'ArrowRight') {
        onNavigate(Math.min(last, currentQuestion + 1));
      } else if (e.key === 'ArrowLeft') {
        onNavigate(Math.max(0, currentQuestion - 1));
      } else if (e.key >= '1' && e.key <= '6') {
        // в вопросе на соответствие буква без утверждения ничего не значит
        const target = questions[currentQuestion];
        if (!target || questionType(target) === 'matching') return;
        const next = pickLetter(target, answers[currentQuestion], ANSWER_LETTERS[Number(e.key) - 1]);
        if (next !== undefined && next !== answers[currentQuestion]) onSelectAnswer(next);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (currentQuestion < last) onNavigate(currentQuestion + 1);
        else onFinishConfirmChange(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [loading, modalOpen, questions, answers, currentQuestion, onNavigate, onSelectAnswer, onFinishConfirmChange]);
  const currentNavRef = useRef<HTMLButtonElement>(null);

  // Текущий номер всегда виден в ленте, даже когда вопросов много
  useEffect(() => {
    currentNavRef.current?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [currentQuestion]);

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
          <button onClick={onBackHome} className="px-6 py-2.5 bg-[#2563eb] text-white rounded-xl font-medium">{t('backToMain')}</button>
        </div>
      </div>
    );
  }

  const rawQuestion = questions[currentQuestion];
  if (!rawQuestion) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#2563eb]" />
      </div>
    );
  }
  const question = localizeQuestion(rawQuestion, language);
  const answered = (index: number) => isAnswered(answers[index]);
  const sectionIndex = sections ? sections.findIndex(s => currentQuestion >= s.start && currentQuestion < s.start + s.count) : -1;
  const currentSection = sections && sectionIndex >= 0 ? sections[sectionIndex] : null;

  const total = questions.length;
  const answeredCount = questions.filter((_, i) => answered(i)).length;
  const isLast = currentQuestion === total - 1;
  const isDanger = timeLeft <= 60;
  const isWarn = !isDanger && timeLeft <= 300;
  const timePct = totalSeconds > 0 ? Math.max(0, Math.min(100, (timeLeft / totalSeconds) * 100)) : 0;

  const goNext = () => (isLast ? onFinishConfirmChange(true) : onNavigate(currentQuestion + 1));
  const goPrev = () => onNavigate(Math.max(0, currentQuestion - 1));

  const tools: { id: string; icon: typeof Calculator; label: string; onClick: () => void }[] = [
    { id: 'answerCard', icon: Grid3x3, label: tTest('answerCard'), onClick: () => setShowAnswerCard(true) },
    { id: 'calc', icon: Calculator, label: tTest('calculator'), onClick: () => setOpenTool('calc') },
    { id: 'mendeleev', icon: Atom, label: tTest('mendeleev'), onClick: () => setOpenTool('mendeleev') },
    { id: 'solubility', icon: Droplets, label: tTest('solubility'), onClick: () => setOpenTool('solubility') },
  ];

  const navButtonClass = (index: number) => {
    if (index === currentQuestion) return 'bg-[#2563eb] border-[#2563eb] text-white shadow-md shadow-blue-200';
    if (answered(index)) return 'bg-blue-50 border-blue-200 text-[#2563eb]';
    return 'bg-white border-gray-200 text-gray-500 hover:border-gray-300';
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-100 flex flex-col overflow-hidden">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 bg-gradient-to-r from-[#1e3a8a] to-[#2563eb] text-white">
        <div className="flex items-center gap-3 sm:gap-4 px-3 sm:px-6 h-16 sm:h-20">
          <button
            onClick={onExit}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-medium flex-shrink-0"
            title={tTest('exit')}
          >
            <LogOut className="w-5 h-5 rotate-180" />
            <span className="hidden md:inline">{tTest('exit')}</span>
          </button>

          <div className="min-w-0 flex-1">
            <p className="text-base sm:text-xl font-bold leading-tight truncate">{currentSection?.name || subjectName}</p>
            <p className="text-xs sm:text-sm text-blue-100 truncate">
              {variantName}
              {studentName && <span className="hidden sm:inline"> · {studentName}</span>}
            </p>
          </div>

          {/* Переключатель рассчитан на светлый фон — кладём его на белую плашку */}
          <div className="hidden sm:block flex-shrink-0 bg-white rounded-xl">
            <LanguageSwitcher />
          </div>

          <div
            role="timer"
            aria-label={tTest('timeLeft')}
            className={`flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-2 rounded-2xl flex-shrink-0 transition-colors ${
              isDanger ? 'bg-red-500 animate-pulse' : isWarn ? 'bg-amber-400 text-slate-900' : 'bg-white/15'
            }`}
          >
            <Clock className="w-5 h-5 sm:w-6 sm:h-6" />
            <div className="leading-none">
              <p className={`hidden sm:block text-[11px] uppercase tracking-wide mb-1 ${isWarn ? 'text-slate-700' : 'text-blue-100'}`}>
                {tTest('timeLeft')}
              </p>
              <p className="text-xl sm:text-3xl font-bold tabular-nums">{formatTime(timeLeft)}</p>
            </div>
          </div>

          <button
            onClick={() => onFinishConfirmChange(true)}
            className="px-3 sm:px-6 py-2.5 sm:py-3 bg-red-500 hover:bg-red-600 rounded-xl text-sm sm:text-base font-bold whitespace-nowrap shadow-lg shadow-red-900/20 flex-shrink-0"
          >
            <span className="sm:hidden">{tTest('finish')}</span>
            <span className="hidden sm:inline">{t('finishTest')}</span>
          </button>
        </div>
        {/* Полоса оставшегося времени */}
        <div className="h-1.5 bg-white/20">
          <div
            className={`h-full ${isDanger ? 'bg-red-400' : isWarn ? 'bg-amber-300' : 'bg-sky-300'}`}
            style={{ width: `${timePct}%`, transition: 'width 1s linear' }}
          />
        </div>
      </header>

      {/* Offline warning bar */}
      {offline && (
        <div className="flex-shrink-0 flex items-center justify-center gap-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-sm font-medium px-4 py-2">
          <WifiOff className="w-4 h-4" />
          {tTest('noConnection')}
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        {/* ── Tools sidebar ──────────────────────────────────────────── */}
        <aside className="hidden sm:flex w-24 lg:w-32 flex-shrink-0 flex-col items-stretch gap-2 bg-[#DCEEFC] border-r border-blue-200 px-2 py-4 overflow-y-auto">
          {tools.map(tool => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                onClick={tool.onClick}
                title={tool.label}
                className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-2xl text-center bg-white/70 hover:bg-white text-[#1e3a8a] shadow-sm ${FLAT}`}
              >
                <Icon className="w-7 h-7" />
                <span className="text-xs font-medium leading-tight">{tool.label}</span>
              </button>
            );
          })}
          <button
            onClick={() => { if (confirm(tTest('resetAnswers'))) onResetAnswers(); }}
            className={`mt-auto flex flex-col items-center gap-1.5 px-2 py-3 rounded-2xl text-slate-500 hover:bg-white/70 hover:text-slate-700 ${FLAT}`}
            title={tTest('reset')}
          >
            <RotateCcw className="w-6 h-6" />
            <span className="text-xs font-medium leading-tight">{tTest('reset')}</span>
          </button>
        </aside>

        {/* ── Main area ──────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Разделы полного ЕНТ */}
          {sections && sections.length > 1 && (
            <div className="flex-shrink-0 bg-[#f1f5f9] border-b border-gray-200 px-3 sm:px-6 py-2 flex items-center gap-2 overflow-x-auto">
              {sections.map((section, i) => {
                const done = questions.slice(section.start, section.start + section.count).filter((_, k) => answered(section.start + k)).length;
                return (
                  <button
                    key={i}
                    onClick={() => onNavigate(section.start)}
                    aria-current={i === sectionIndex ? 'true' : undefined}
                    className={`flex-shrink-0 px-3.5 py-2 rounded-xl text-sm font-bold whitespace-nowrap ${FLAT} ${
                      i === sectionIndex ? 'bg-[#1e3a8a] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {section.name}
                    <span className={`ml-2 font-medium tabular-nums ${i === sectionIndex ? 'text-blue-200' : 'text-gray-400'}`}>{done}/{section.count}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Question number strip */}
          <div className="flex-shrink-0 bg-white border-b border-gray-200 px-3 sm:px-6 py-3">
            <div className="flex items-center justify-between gap-3 mb-2.5">
              <p className="text-sm font-medium text-gray-600">
                {tTest('answeredOf', { answered: answeredCount, total })}
              </p>
              <div className="flex items-center gap-3">
                <div className="hidden sm:block w-40 lg:w-64 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#2563eb] rounded-full transition-all duration-300"
                    style={{ width: `${(answeredCount / total) * 100}%` }}
                  />
                </div>
                <button
                  onClick={() => setShowToolSheet(true)}
                  className="sm:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-[#2563eb] text-sm font-medium"
                >
                  <Wrench className="w-4 h-4" />
                  {tTest('tools')}
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {/* в полном ЕНТ лента показывает вопросы текущего раздела с нумерацией внутри него */}
              {questions.map((_, i) => (currentSection && (i < currentSection.start || i >= currentSection.start + currentSection.count) ? null : (
                <button
                  key={i}
                  ref={i === currentQuestion ? currentNavRef : undefined}
                  onClick={() => onNavigate(i)}
                  aria-current={i === currentQuestion ? 'step' : undefined}
                  className={`min-w-[44px] h-11 px-2 rounded-xl text-base font-bold flex-shrink-0 border-2 ${FLAT} ${navButtonClass(i)}`}
                >
                  {i + 1 - (currentSection?.start ?? 0)}
                </button>
              )))}
            </div>
          </div>

          {/* Question */}
          <div className="flex-1 overflow-y-auto">
            <div className="w-full max-w-[1400px] px-3 sm:px-6 py-5 sm:py-8">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentQuestion}
                  initial={{ opacity: 0, x: 32 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -32 }}
                  transition={{ duration: 0.22, ease: 'easeInOut' }}
                  className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden"
                >
                  <div className="px-5 sm:px-10 pt-6 sm:pt-9 pb-5 sm:pb-7">
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      <span className="inline-flex items-center px-3.5 py-1.5 rounded-full bg-blue-50 text-[#2563eb] text-sm font-bold">
                        {tTest('question')} {currentQuestion + 1 - (currentSection?.start ?? 0)} {tTest('of')} {currentSection?.count ?? total}
                      </span>
                      {(question.score ?? 1) > 1 && (
                        <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 text-sm font-bold">
                          {tTest('pointsBadge', { count: question.score })}
                        </span>
                      )}
                    </div>
                    {rawQuestion.passage && <PassageBlock passage={rawQuestion.passage} language={language} />}
                    <p className="text-xl sm:text-2xl font-semibold text-gray-900 leading-relaxed whitespace-pre-line">
                      <MathText text={question.question_text} />
                    </p>
                    {question.image_url && (
                      <img src={question.image_url} alt="" className="mt-5 max-h-80 max-w-full rounded-2xl border border-gray-200" />
                    )}
                  </div>

                  <div className="px-4 sm:px-8 pb-6 sm:pb-9">
                    <QuestionAnswer
                      question={rawQuestion}
                      language={language}
                      value={answers[currentQuestion]}
                      onChange={onSelectAnswer}
                      showKeys
                    />
                  </div>
                </motion.div>
              </AnimatePresence>
              <p className="hidden lg:block text-xs text-gray-400 mt-4 px-2">{tTest('keyboardHint')}</p>
            </div>
          </div>

          {/* Bottom navigation */}
          <div className="flex-shrink-0 bg-white border-t border-gray-200 px-3 sm:px-6 py-3 sm:py-4">
            <div className="w-full max-w-[1400px] flex items-center justify-between gap-3">
              <button
                onClick={goPrev}
                disabled={currentQuestion === 0}
                className="flex items-center gap-2 px-4 sm:px-6 py-3 sm:py-3.5 rounded-xl border-2 border-gray-200 text-gray-700 text-sm sm:text-base font-bold hover:border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="hidden sm:inline">{tTest('prevQuestion')}</span>
              </button>
              <span className="text-sm sm:text-base font-bold text-gray-500 tabular-nums">
                {currentQuestion + 1} / {total}
              </span>
              <button
                onClick={goNext}
                className={`flex items-center gap-2 px-5 sm:px-8 py-3 sm:py-3.5 rounded-xl text-white text-sm sm:text-base font-bold shadow-md ${
                  isLast ? 'bg-red-500 hover:bg-red-600 shadow-red-200' : 'bg-[#2563eb] hover:bg-[#1e3a8a] shadow-blue-200'
                }`}
              >
                {isLast ? tTest('finish') : tTest('nextQuestion')}
                {!isLast && <ArrowRight className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Answer card modal ───────────────────────────────────────── */}
      {showAnswerCard && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={() => setShowAnswerCard(false)}>
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-xl w-full max-h-[85vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xl font-bold text-gray-900">{tTest('answerCard')}</h3>
              <button onClick={() => setShowAnswerCard(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl" aria-label={tTest('close')}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-5">{tTest('answeredOf', { answered: answeredCount, total })}</p>
            {(sections && sections.length > 1 ? sections : [{ name: '', start: 0, count: total }]).map((section, s) => (
              <div key={s} className="mb-4 last:mb-0">
                {section.name && <p className="text-sm font-bold text-gray-700 mb-2">{section.name}</p>}
                <div className="grid grid-cols-5 sm:grid-cols-8 gap-2.5">
                  {questions.slice(section.start, section.start + section.count).map((_, k) => {
                    const i = section.start + k;
                    const text = formatAnswer(answers[i]);
                    return (
                      <button
                        key={i}
                        onClick={() => { onNavigate(i); setShowAnswerCard(false); }}
                        className={`h-12 rounded-xl border-2 flex flex-col items-center justify-center leading-none ${FLAT} ${navButtonClass(i)}`}
                      >
                        <span className="text-sm font-bold">{k + 1}</span>
                        {/* длинный ответ (несколько букв, соответствие) в клетку не влезает */}
                        <span className="text-[11px] font-semibold mt-0.5 opacity-80">{!text ? '–' : text.length <= 2 ? text : '✓'}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-6 text-xs text-gray-500">
              <span className="flex items-center gap-2"><span className="w-4 h-4 rounded-md bg-[#2563eb]" />{tTest('legendCurrent')}</span>
              <span className="flex items-center gap-2"><span className="w-4 h-4 rounded-md bg-blue-50 border-2 border-blue-200" />{tTest('legendAnswered')}</span>
              <span className="flex items-center gap-2"><span className="w-4 h-4 rounded-md bg-white border-2 border-gray-200" />{tTest('legendUnanswered')}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Инструменты на телефоне: нижняя панель ─────────────────── */}
      {showToolSheet && (
        <div className="sm:hidden fixed inset-0 z-[60] bg-black/50 flex items-end" onClick={() => setShowToolSheet(false)}>
          <div className="w-full bg-white rounded-t-3xl p-5 pb-7 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">{tTest('tools')}</h3>
              <button onClick={() => setShowToolSheet(false)} className="p-2 text-gray-400 hover:bg-gray-100 rounded-xl" aria-label={tTest('close')}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {tools.map(tool => {
                const Icon = tool.icon;
                return (
                  <button
                    key={tool.id}
                    onClick={() => { setShowToolSheet(false); tool.onClick(); }}
                    className={`flex flex-col items-center gap-2 px-3 py-4 rounded-2xl bg-[#DCEEFC] text-[#1e3a8a] ${FLAT}`}
                  >
                    <Icon className="w-7 h-7" />
                    <span className="text-sm font-medium leading-tight text-center">{tool.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between gap-3 mt-4">
              <div className="bg-slate-100 rounded-xl">
                <LanguageSwitcher />
              </div>
              <button
                onClick={() => { if (confirm(tTest('resetAnswers'))) { onResetAnswers(); setShowToolSheet(false); } }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-100 ${FLAT}`}
              >
                <RotateCcw className="w-4 h-4" />
                {tTest('reset')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Exam tools ──────────────────────────────────────────────── */}
      {openTool === 'calc' && <CalculatorTool onClose={() => setOpenTool(null)} />}
      {openTool === 'mendeleev' && <PeriodicTable onClose={() => setOpenTool(null)} />}
      {openTool === 'solubility' && <SolubilityTable onClose={() => setOpenTool(null)} />}

      {/* ── Finish confirmation modal ───────────────────────────────── */}
      {showFinishConfirm && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={() => onFinishConfirmChange(false)}>
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-md p-7" onClick={e => e.stopPropagation()}>
            <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
              <AlertCircle className="w-7 h-7 text-red-500" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">{t('finishTest')}</h3>
            <p className="text-gray-600 mb-6">
              {tTest('finishConfirmAnswered', { answered: answeredCount, skipped: total - answeredCount })}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => onFinishConfirmChange(false)}
                className="flex-1 py-3 border-2 border-gray-200 hover:bg-gray-50 text-gray-700 font-bold rounded-xl"
              >
                {tTest('goBack')}
              </button>
              <button
                onClick={onFinish}
                className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl"
              >
                {tTest('yesFinish')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Submit error modal ──────────────────────────────────────── */}
      {submitError && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-md p-7">
            <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
              <AlertCircle className="w-7 h-7 text-red-500" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              {language === 'kz' ? 'Нәтиже сақталмады' : 'Результат не сохранён'}
            </h3>
            <p className="text-gray-600 mb-2">
              {language === 'kz'
                ? 'Жауаптарыңыз осы құрылғыда сақтаулы. Байланысты тексеріп, қайталап көріңіз.'
                : 'Ваши ответы сохранены на этом устройстве. Проверьте соединение и попробуйте ещё раз.'}
            </p>
            <p className="text-xs text-gray-400 mb-6 break-words">{submitError}</p>
            <div className="flex gap-3">
              <button
                onClick={onDismissSubmitError}
                className="flex-1 py-3 border-2 border-gray-200 hover:bg-gray-50 text-gray-700 font-bold rounded-xl"
              >
                {tTest('goBack')}
              </button>
              <button
                onClick={onFinish}
                className="flex-1 py-3 bg-[#2563eb] hover:bg-[#1e3a8a] text-white font-bold rounded-xl"
              >
                {language === 'kz' ? 'Қайталау' : 'Повторить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Time-up modal ───────────────────────────────────────────── */}
      {timeUp && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-md p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8 text-amber-500" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">{tTest('timeUp')}</h3>
            <p className="text-gray-600">{tTest('timeUpSaved')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
