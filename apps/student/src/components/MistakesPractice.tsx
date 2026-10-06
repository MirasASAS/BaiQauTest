import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ArrowRight, Check, CheckCircle, Loader2, Sparkles, X } from 'lucide-react';
import { useLanguage, useSubjectLabel, getMyMistakes, recordMistakePractice, explainQuestion, localizeQuestion, MathText } from '@baiqautest/shared';
import type { MistakeQuestion } from '@baiqautest/shared';

const OPTIONS = ['A', 'B', 'C', 'D'] as const;
const FLAT = 'hover:!transform-none active:!transform-none';

// «Работа над ошибками»: вопросы, на которые ученик ошибся в первой попытке.
// Ответ проверяется сразу; верно отвеченный вопрос уходит из списка ошибок.
export function MistakesPractice({ subjectId, onClose }: { subjectId: number | null; onClose: () => void }) {
  const { language } = useLanguage();
  const { t: tTest } = useTranslation('test');
  const subjectLabel = useSubjectLabel();
  const [questions, setQuestions] = useState<MistakeQuestion[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [fixed, setFixed] = useState(0);
  const [explainText, setExplainText] = useState('');
  const [explaining, setExplaining] = useState(false);

  useEffect(() => {
    let active = true;
    getMyMistakes(subjectId)
      .then(data => { if (active) setQuestions(data.questions); })
      .catch(err => { if (active) setLoadError(err instanceof Error ? err.message : String(err)); });
    return () => { active = false; };
  }, [subjectId]);

  async function choose(option: string, question: MistakeQuestion) {
    if (picked || checking) return;
    setChecking(true);
    setPicked(option);
    try {
      const result = await recordMistakePractice(question.id, option);
      if (result.is_correct) setFixed(n => n + 1);
    } catch (err) {
      // Не записалось — ответ всё равно показываем, вопрос просто останется в списке ошибок
      console.error('Error saving practice answer:', err);
    }
    setChecking(false);
  }

  function next() {
    setPicked(null);
    setExplainText('');
    setIndex(i => i + 1);
  }

  const shell = (children: React.ReactNode) => (
    <div className="fixed inset-0 z-50 bg-slate-100 flex flex-col overflow-hidden">
      <header className="flex-shrink-0 bg-gradient-to-r from-[#1e3a8a] to-[#2563eb] text-white flex items-center gap-4 px-4 sm:px-6 h-16">
        <p className="flex-1 min-w-0 text-lg sm:text-xl font-bold truncate">{tTest('mistakesTitle')}</p>
        {questions && questions.length > 0 && index < questions.length && (
          <span className="text-sm font-bold tabular-nums bg-white/15 px-3 py-1.5 rounded-xl">{index + 1} / {questions.length}</span>
        )}
        <button onClick={onClose} className="p-2 rounded-xl bg-white/10 hover:bg-white/20" aria-label={tTest('close')}>
          <X className="w-5 h-5" />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="w-full max-w-4xl mx-auto px-3 sm:px-6 py-6 sm:py-8">{children}</div>
      </div>
    </div>
  );

  if (loadError) {
    return shell(
      <div className="bg-white rounded-3xl border border-gray-200 p-8 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <p className="text-gray-700 break-words">{loadError}</p>
      </div>,
    );
  }
  if (!questions) {
    return shell(<div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-[#2563eb] animate-spin" /></div>);
  }
  if (questions.length === 0 || index >= questions.length) {
    const done = questions.length > 0;
    return shell(
      <div className="bg-white rounded-3xl border border-gray-200 p-8 sm:p-10 text-center">
        <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">{tTest(done ? 'mistakesDone' : 'mistakesEmpty')}</h2>
        {done && <p className="text-gray-600 mb-6">{tTest('mistakesFixed', { fixed, total: questions.length })}</p>}
        <button onClick={onClose} className="mt-2 px-8 py-3 bg-[#2563eb] hover:bg-[#1e3a8a] text-white font-bold rounded-xl">
          {tTest('exitToMain')}
        </button>
      </div>,
    );
  }

  const source = questions[index];
  const question = localizeQuestion(source, language);
  const optionText: Record<(typeof OPTIONS)[number], string> = {
    A: question.option_a, B: question.option_b, C: question.option_c, D: question.option_d,
  };
  const savedExplanation = (language === 'kz' ? source.explanation_kz : source.explanation_ru) || '';
  const shownExplanation = explainText || savedExplanation;

  return shell(
    <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 sm:px-10 pt-6 sm:pt-9 pb-5">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="px-3.5 py-1.5 rounded-full bg-blue-50 text-[#2563eb] text-sm font-bold">{subjectLabel(source.subject)}</span>
          {source.topic && <span className="px-3.5 py-1.5 rounded-full bg-slate-100 text-slate-600 text-sm font-medium">{source.topic}</span>}
        </div>
        <p className="text-xl sm:text-2xl font-semibold text-gray-900 leading-relaxed whitespace-pre-line"><MathText text={question.question_text} /></p>
        {question.image_url && (
          <img src={question.image_url} alt="" className="mt-5 max-h-80 max-w-full rounded-2xl border border-gray-200" />
        )}
      </div>

      <div className="px-4 sm:px-8 pb-6 space-y-3">
        {OPTIONS.map(option => {
          const isRight = picked !== null && option === source.correct_answer;
          const isWrongPick = picked === option && option !== source.correct_answer;
          return (
            <button
              key={option}
              onClick={() => choose(option, source)}
              disabled={picked !== null}
              className={`w-full flex items-center gap-4 px-4 sm:px-5 py-4 rounded-2xl border-2 text-left ${FLAT} ${
                isRight
                  ? 'border-green-500 bg-green-50'
                  : isWrongPick
                  ? 'border-red-400 bg-red-50'
                  : picked !== null
                  ? 'border-gray-200 bg-white opacity-60'
                  : 'border-gray-200 bg-white hover:border-blue-200 hover:bg-slate-50'
              }`}
            >
              <span className={`flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-lg font-bold ${
                isRight ? 'bg-green-500 text-white' : isWrongPick ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                {isRight ? <Check className="w-5 h-5" /> : isWrongPick ? <X className="w-5 h-5" /> : option}
              </span>
              <span className="flex-1 min-w-0 text-base sm:text-lg leading-snug text-gray-800"><MathText text={optionText[option]} /></span>
            </button>
          );
        })}
      </div>

      {picked !== null && (
        <div className="px-5 sm:px-10 pb-7 space-y-4">
          <p className={`text-base font-bold ${picked === source.correct_answer ? 'text-green-600' : 'text-red-500'}`}>
            {tTest(picked === source.correct_answer ? 'mistakeCorrect' : 'mistakeWrong', { answer: source.correct_answer })}
          </p>
          {shownExplanation ? (
            <div className="p-4 bg-blue-50 rounded-2xl text-sm text-gray-700 leading-relaxed whitespace-pre-line"><MathText text={shownExplanation} /></div>
          ) : (
            <button
              onClick={async () => {
                if (explaining) return;
                setExplaining(true);
                try {
                  setExplainText(await explainQuestion(source.id, language));
                } catch {
                  setExplainText(language === 'kz' ? 'Түсіндіру қатесі' : 'Ошибка объяснения');
                }
                setExplaining(false);
              }}
              className="flex items-center gap-2 text-sm text-[#2563eb] font-medium"
            >
              {explaining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {tTest('mistakeExplain')}
            </button>
          )}
          <div className="flex justify-end">
            <button
              onClick={next}
              disabled={checking}
              className="flex items-center gap-2 px-8 py-3.5 bg-[#2563eb] hover:bg-[#1e3a8a] text-white font-bold rounded-xl shadow-md shadow-blue-200 disabled:opacity-50"
            >
              {tTest(index === questions.length - 1 ? 'finish' : 'nextQuestion')}
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>,
  );
}
