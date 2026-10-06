import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { explainQuestion, localizeQuestion, MathText, questionType, questionOptions, questionKey, matchLeft, scoreAnswer, maxScore, isAnswered, formatAnswer } from '@baiqautest/shared';
import type { AnswerValue, TestQuestion } from '@baiqautest/shared';
import { PassageBlock } from './QuestionAnswer';

// Один вопрос в разборе сданной попытки: ответ ученика, правильный ответ, объяснение ИИ.
// Используется на странице результата и в истории.
export function ReviewItem({
  question: source,
  index,
  userAnswer,
  language,
  tRes,
}: {
  question: TestQuestion;
  index: number;
  userAnswer: AnswerValue | null;
  language: 'kz' | 'ru';
  tRes: (key: string) => string;
}) {
  const question = localizeQuestion(source, language);
  // Объяснение, уже сохранённое в вопросе, показываем сразу — без запроса к ИИ
  const saved = (language === 'kz' ? question.explanation_kz : question.explanation_ru) || '';
  const [explainState, setExplainState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [explainText, setExplainText] = useState('');
  const shownText = explainText || saved;

  const type = questionType(question);
  const options = questionOptions(question);
  const key = questionKey(question);
  const answered = isAnswered(userAnswer);
  const max = maxScore(question);
  const got = scoreAnswer(question, userAnswer);
  const isCorrect = got === max;
  const isPartial = got > 0 && got < max;

  const pickedLetters: string[] = Array.isArray(userAnswer) ? userAnswer : typeof userAnswer === 'string' ? [userAnswer] : [];
  const keyLetters: string[] = Array.isArray(key) ? key : typeof key === 'string' ? [key] : [];
  const pairs = userAnswer && typeof userAnswer === 'object' && !Array.isArray(userAnswer) ? userAnswer : {};
  const keyPairs = key && typeof key === 'object' && !Array.isArray(key) ? key : {};

  return (
    <div className="px-5 py-4">
      <div className="flex items-start gap-3">
        <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
          !answered
            ? 'bg-slate-100 text-slate-400'
            : isCorrect
            ? 'bg-green-100 text-green-700'
            : isPartial
            ? 'bg-amber-100 text-amber-700'
            : 'bg-red-100 text-red-700'
        }`}>
          {!answered ? '–' : isCorrect ? '✓' : isPartial ? '½' : '✗'}
        </span>
        <div className="flex-1 min-w-0">
          {source.passage && <PassageBlock passage={source.passage} language={language} defaultOpen={false} />}
          <p className="text-sm font-semibold text-gray-800 mb-2">
            {index + 1}. <MathText text={question.question_text} />
          </p>
          {question.image_url && (
            <img src={question.image_url} alt="" className="max-h-48 rounded-lg border border-gray-200 mb-2" />
          )}
          <div className="grid grid-cols-2 gap-1.5 mb-2">
            {options.map(opt => {
              // в вопросе на соответствие варианты — справочный список, подсветка идёт по парам ниже
              const isUserAns = type !== 'matching' && pickedLetters.includes(opt.letter);
              const isCorrectAns = type !== 'matching' && keyLetters.includes(opt.letter);
              return (
                <div key={opt.letter} className={`px-3 py-1.5 rounded-lg text-xs border ${
                  isUserAns && isCorrectAns
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : isUserAns && !isCorrectAns
                    ? 'bg-red-50 border-red-200 text-red-600'
                    : isCorrectAns
                    ? 'bg-green-50/50 border-green-100 text-green-600'
                    : 'bg-white border-gray-200 text-gray-600'
                } ${isUserAns ? 'font-bold' : ''}`}>
                  <span className="font-semibold mr-1">{opt.letter})</span><MathText text={opt.text} />
                </div>
              );
            })}
          </div>
          {type === 'matching' && (
            <div className="space-y-1.5 mb-2">
              {matchLeft(question, language).map((statement, i) => {
                const id = String(i + 1);
                const ok = pairs[id] !== undefined && pairs[id] === keyPairs[id];
                return (
                  <div key={id} className={`px-3 py-1.5 rounded-lg text-xs border ${
                    ok ? 'bg-green-50 border-green-200' : pairs[id] ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'
                  }`}>
                    <span className="font-semibold mr-1">{id}.</span><MathText text={statement} />
                    <span className="ml-2 font-bold whitespace-nowrap">
                      <span className={ok ? 'text-green-700' : 'text-red-600'}>{pairs[id] || '–'}</span>
                      {!ok && keyPairs[id] && <span className="text-green-700"> → {keyPairs[id]}</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="text-gray-400">
              {tRes('yourAnswer')}: <span className={`font-bold ${answered ? (isCorrect ? 'text-green-600' : isPartial ? 'text-amber-600' : 'text-red-500') : 'text-gray-400'}`}>{formatAnswer(userAnswer) || tRes('noAnswer')}</span>
            </span>
            <span className="text-gray-300">·</span>
            <span className="text-gray-400">
              {tRes('correctAnswerShort')}: <span className="font-bold text-green-600">{formatAnswer(key)}</span>
            </span>
            {max > 1 && (
              <>
                <span className="text-gray-300">·</span>
                <span className="text-gray-400">{tRes('pointsOf')}: <span className="font-bold text-gray-700">{got}/{max}</span></span>
              </>
            )}
          </div>
          {!shownText && (
            <button
              onClick={async () => {
                if (explainState !== 'idle') return;
                setExplainState('loading');
                try {
                  setExplainText(await explainQuestion(question.id, language));
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
          )}
          {shownText && (
            <div className="mt-2 p-3 bg-blue-50 rounded-lg text-xs text-gray-700 leading-relaxed whitespace-pre-line">
              <MathText text={shownText} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
