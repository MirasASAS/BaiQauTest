import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { explainQuestion, localizeQuestion, MathText } from '@baiqautest/shared';
import type { TestQuestion } from '@baiqautest/shared';

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
  userAnswer: string | null;
  language: 'kz' | 'ru';
  tRes: (key: string) => string;
}) {
  const question = localizeQuestion(source, language);
  // Объяснение, уже сохранённое в вопросе, показываем сразу — без запроса к ИИ
  const saved = (language === 'kz' ? question.explanation_kz : question.explanation_ru) || '';
  const [explainState, setExplainState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [explainText, setExplainText] = useState('');
  const shownText = explainText || saved;

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
            {index + 1}. <MathText text={question.question_text} />
          </p>
          {question.image_url && (
            <img src={question.image_url} alt="" className="max-h-48 rounded-lg border border-gray-200 mb-2" />
          )}
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
                  <span className="font-semibold mr-1">{opt})</span><MathText text={optText} />
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
