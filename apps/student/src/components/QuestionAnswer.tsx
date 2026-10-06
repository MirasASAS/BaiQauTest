import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, Check, ChevronDown, X } from 'lucide-react';
import { localizeQuestion, localizePassage, questionOptions, questionType, matchLeft, MathText } from '@baiqautest/shared';
import type { AnswerLetter, AnswerValue, Passage, TestQuestion } from '@baiqautest/shared';

// Кнопки с глобальным hover-масштабом (index.css) здесь не должны «прыгать»
const FLAT = 'hover:!transform-none active:!transform-none';

// На ЕНТ в вопросе с несколькими ответами верных не больше трёх
const MAX_MULTIPLE_PICKS = 3;

// Следующее значение ответа после нажатия на букву (single — выбор, multiple — переключение).
// null — ответ снят. Для matching буква сама по себе ничего не значит.
export function pickLetter(question: TestQuestion, value: AnswerValue | null | undefined, letter: AnswerLetter): AnswerValue | null | undefined {
  const type = questionType(question);
  if (!questionOptions(question).some(o => o.letter === letter)) return value;
  if (type === 'single') return letter;
  if (type === 'multiple') {
    const picked = Array.isArray(value) ? value : [];
    if (picked.includes(letter)) {
      const next = picked.filter(x => x !== letter);
      return next.length ? next : null;
    }
    if (picked.length >= MAX_MULTIPLE_PICKS) return value;
    return [...picked, letter].sort();
  }
  return value;
}

// Общий текст контекстных вопросов; на телефоне сворачивается, чтобы не закрывать вопрос
export function PassageBlock({ passage, language, defaultOpen = true }: { passage: Passage; language: 'kz' | 'ru'; defaultOpen?: boolean }) {
  const { t: tTest } = useTranslation('test');
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50/60 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-2 px-4 py-3 text-left text-sm font-bold text-amber-900 ${FLAT}`}
        aria-expanded={open}
      >
        <BookOpen className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1 min-w-0 truncate">{passage.title || tTest('passage')}</span>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 max-h-72 overflow-y-auto text-base text-gray-800 leading-relaxed whitespace-pre-line">
          <MathText text={localizePassage(passage, language)} />
        </div>
      )}
    </div>
  );
}

// Поле ответа на вопрос любого типа.
// reveal — ключ вопроса: когда он передан, ввод заблокирован и видно, что верно, а что нет.
export function QuestionAnswer({
  question: source,
  language,
  value,
  onChange,
  reveal,
  showKeys = false,
}: {
  question: TestQuestion;
  language: 'kz' | 'ru';
  value: AnswerValue | null | undefined;
  onChange: (value: AnswerValue | null) => void;
  reveal?: AnswerValue | null;
  // подсказки клавиш 1–6 рядом с вариантами
  showKeys?: boolean;
}) {
  const { t: tTest } = useTranslation('test');
  const question = localizeQuestion(source, language);
  const type = questionType(question);
  const options = questionOptions(question);
  const locked = reveal != null;

  if (type === 'matching') {
    const left = matchLeft(question, language);
    const pairs = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const key = reveal && typeof reveal === 'object' && !Array.isArray(reveal) ? reveal : null;
    return (
      <div className="space-y-5">
        <p className="text-sm font-medium text-gray-500">{tTest('matchingHint')}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {options.map(option => (
            <div key={option.letter} className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-slate-50 border border-gray-200">
              <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-sm font-bold text-slate-600">
                {option.letter}
              </span>
              <span className="flex-1 min-w-0 text-base text-gray-800 leading-snug"><MathText text={option.text} /></span>
            </div>
          ))}
        </div>
        <div className="space-y-3">
          {left.map((statement, i) => {
            const id = String(i + 1);
            const picked = pairs[id];
            return (
              <div key={id} className="rounded-2xl border-2 border-gray-200 bg-white px-4 py-4">
                <p className="text-base sm:text-lg text-gray-900 leading-snug mb-3">
                  <span className="font-bold text-[#2563eb] mr-2">{id}.</span>
                  <MathText text={statement} />
                </p>
                <div className="flex flex-wrap gap-2">
                  {options.map(option => {
                    const isPicked = picked === option.letter;
                    const isRight = key !== null && key[id] === option.letter;
                    const isWrongPick = key !== null && isPicked && !isRight;
                    return (
                      <button
                        key={option.letter}
                        disabled={locked}
                        aria-pressed={isPicked}
                        onClick={() => {
                          const next = { ...pairs };
                          if (isPicked) delete next[id];
                          else next[id] = option.letter;
                          onChange(Object.keys(next).length ? next : null);
                        }}
                        className={`w-12 h-12 rounded-xl border-2 text-lg font-bold ${FLAT} ${
                          isRight
                            ? 'border-green-500 bg-green-500 text-white'
                            : isWrongPick
                            ? 'border-red-400 bg-red-500 text-white'
                            : isPicked
                            ? 'border-[#2563eb] bg-[#2563eb] text-white'
                            : 'border-gray-200 bg-white text-slate-600 hover:border-blue-200'
                        }`}
                      >
                        {option.letter}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const isMultiple = type === 'multiple';
  const pickedLetters: string[] = isMultiple ? (Array.isArray(value) ? value : []) : typeof value === 'string' ? [value] : [];
  const keyLetters: string[] | null = reveal == null ? null : Array.isArray(reveal) ? reveal : typeof reveal === 'string' ? [reveal] : [];

  return (
    <div className="space-y-3">
      {isMultiple && (
        <p className="text-sm font-medium text-gray-500">{tTest('multipleHint', { max: MAX_MULTIPLE_PICKS })}</p>
      )}
      {options.map((option, index) => {
        const isSelected = pickedLetters.includes(option.letter);
        const isRight = keyLetters !== null && keyLetters.includes(option.letter);
        const isWrongPick = keyLetters !== null && isSelected && !isRight;
        return (
          <button
            key={option.letter}
            disabled={locked}
            onClick={() => {
              const next = pickLetter(source, value, option.letter);
              if (next !== undefined) onChange(next);
            }}
            aria-pressed={isSelected}
            className={`w-full flex items-center gap-4 px-4 sm:px-5 py-4 sm:py-5 rounded-2xl border-2 text-left ${FLAT} ${
              isRight
                ? 'border-green-500 bg-green-50'
                : isWrongPick
                ? 'border-red-400 bg-red-50'
                : locked
                ? 'border-gray-200 bg-white opacity-60'
                : isSelected
                ? 'border-[#2563eb] bg-blue-50 shadow-sm'
                : 'border-gray-200 bg-white hover:border-blue-200 hover:bg-slate-50'
            }`}
          >
            <span className={`flex-shrink-0 w-11 h-11 sm:w-12 sm:h-12 flex items-center justify-center text-lg font-bold transition-colors ${
              isMultiple ? 'rounded-lg' : 'rounded-xl'
            } ${
              isRight
                ? 'bg-green-500 text-white'
                : isWrongPick
                ? 'bg-red-500 text-white'
                : isSelected
                ? 'bg-[#2563eb] text-white'
                : 'bg-slate-100 text-slate-600'
            }`}>
              {isRight && locked ? <Check className="w-5 h-5" /> : isWrongPick ? <X className="w-5 h-5" /> : option.letter}
            </span>
            <span className={`flex-1 min-w-0 text-base sm:text-lg leading-snug ${isSelected && !locked ? 'text-gray-900 font-semibold' : 'text-gray-800'}`}>
              <MathText text={option.text} />
            </span>
            {!locked && (isSelected ? (
              <span className={`flex-shrink-0 w-8 h-8 bg-[#2563eb] flex items-center justify-center ${isMultiple ? 'rounded-lg' : 'rounded-full'}`}>
                <Check className="w-5 h-5 text-white checkbox-bounce" />
              </span>
            ) : showKeys ? (
              <kbd className="hidden lg:flex flex-shrink-0 w-8 h-8 items-center justify-center rounded-lg border border-gray-200 text-xs font-semibold text-gray-400">
                {index + 1}
              </kbd>
            ) : null)}
          </button>
        );
      })}
    </div>
  );
}
