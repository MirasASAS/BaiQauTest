import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Check, AlertCircle, Loader2, ImagePlus, Trash2, Plus } from 'lucide-react';
import { useLanguage, createQuestion, updateQuestion, uploadQuestionImage, getPassages, createPassage, updatePassage, questionType } from '@baiqautest/shared';
import type { Passage, Question, QuestionType, Variant } from '@baiqautest/shared';

type Answer = 'A' | 'B' | 'C' | 'D';
type Letter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
type OptionKey = 'option_a' | 'option_b' | 'option_c' | 'option_d' | 'option_e' | 'option_f';
type OptionKzKey = `${OptionKey}_kz`;

// Варианты E и F есть только у вопросов «несколько ответов» и «соответствие», и они необязательны
const OPTIONS: { letter: Letter; key: OptionKey; kzKey: OptionKzKey; label: string; extra: boolean }[] = [
  { letter: 'A', key: 'option_a', kzKey: 'option_a_kz', label: 'optionA', extra: false },
  { letter: 'B', key: 'option_b', kzKey: 'option_b_kz', label: 'optionB', extra: false },
  { letter: 'C', key: 'option_c', kzKey: 'option_c_kz', label: 'optionC', extra: false },
  { letter: 'D', key: 'option_d', kzKey: 'option_d_kz', label: 'optionD', extra: false },
  { letter: 'E', key: 'option_e', kzKey: 'option_e_kz', label: 'optionE', extra: true },
  { letter: 'F', key: 'option_f', kzKey: 'option_f_kz', label: 'optionF', extra: true },
];

const TYPES: QuestionType[] = ['single', 'multiple', 'matching'];
const TYPE_LABEL: Record<QuestionType, string> = { single: 'typeSingle', multiple: 'typeMultiple', matching: 'typeMatching' };

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_STATEMENTS = 6;

const inputClass = 'w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb] bg-gray-50';
const textareaClass = 'w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb] resize-none bg-gray-50';

interface Statement {
  ru: string;
  kz: string;
  answer: Letter | '';
}

function initialStatements(question: Question | null): Statement[] {
  const key = question?.correct_key && !Array.isArray(question.correct_key) ? question.correct_key : {};
  const rows = (question?.match_left || []).map((item, i) => ({
    ru: item.ru ?? '',
    kz: item.kz ?? '',
    answer: (key[String(i + 1)] ?? '') as Letter | '',
  }));
  while (rows.length < 2) rows.push({ ru: '', kz: '', answer: '' });
  return rows;
}

// Форма создания/редактирования вопроса: тип вопроса, основной текст (RU), казахская версия,
// контекстный текст, тема, сложность, картинка и объяснение.
export function QuestionForm({
  variant,
  question,
  nextOrderNum,
  topicSuggestions,
  onClose,
  onSaved,
}: {
  variant: Variant;
  // null — создаётся новый вопрос
  question: Question | null;
  nextOrderNum: number;
  topicSuggestions: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const { t: tAdmin } = useTranslation('admin');
  const [form, setForm] = useState({
    question_type: (question ? questionType(question) : 'single') as QuestionType,
    question_text: question?.question_text ?? '',
    option_a: question?.option_a ?? '',
    option_b: question?.option_b ?? '',
    option_c: question?.option_c ?? '',
    option_d: question?.option_d ?? '',
    option_e: question?.option_e ?? '',
    option_f: question?.option_f ?? '',
    correct_answer: (question?.correct_answer ?? 'A') as Answer,
    question_text_kz: question?.question_text_kz ?? '',
    option_a_kz: question?.option_a_kz ?? '',
    option_b_kz: question?.option_b_kz ?? '',
    option_c_kz: question?.option_c_kz ?? '',
    option_d_kz: question?.option_d_kz ?? '',
    option_e_kz: question?.option_e_kz ?? '',
    option_f_kz: question?.option_f_kz ?? '',
    topic: question?.topic ?? '',
    difficulty: (question?.difficulty ?? null) as 1 | 2 | 3 | null,
    image_url: question?.image_url ?? '',
    explanation_ru: question?.explanation_ru ?? '',
    explanation_kz: question?.explanation_kz ?? '',
    passage_id: (question?.passage_id ?? null) as number | null,
  });
  // Верные ответы вопроса «несколько ответов»
  const [correctLetters, setCorrectLetters] = useState<Letter[]>(
    Array.isArray(question?.correct_key) ? (question.correct_key as Letter[]) : [],
  );
  // Утверждения вопроса «соответствие» и буква варианта для каждого
  const [statements, setStatements] = useState<Statement[]>(() => initialStatements(question));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Контекстные тексты варианта и редактор текста (null — редактор закрыт)
  const [passages, setPassages] = useState<Passage[]>([]);
  const [passageDraft, setPassageDraft] = useState<{ id: number | null; title: string; text_ru: string; text_kz: string } | null>(null);
  const [passageSaving, setPassageSaving] = useState(false);

  useEffect(() => {
    let active = true;
    getPassages(variant.id)
      .then(rows => { if (active) setPassages(rows); })
      .catch(() => { /* SQL 12 ещё не применён — вопросы без текстов работают как раньше */ });
    return () => { active = false; };
  }, [variant.id]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm(prev => ({ ...prev, [key]: value }));
  const type = form.question_type;
  const shownOptions = OPTIONS.filter(opt => !opt.extra || type !== 'single');
  // буквы, которые можно выбрать в ключе: только заполненные варианты
  const filledLetters = shownOptions.filter(opt => form[opt.key].trim()).map(opt => opt.letter);

  async function handleImage(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > MAX_IMAGE_BYTES) {
      setError(tAdmin('imageError'));
      return;
    }
    setUploading(true);
    setError(null);
    try {
      set('image_url', await uploadQuestionImage(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : tAdmin('imageError'));
    }
    setUploading(false);
  }

  async function handleSavePassage() {
    if (!passageDraft || passageSaving) return;
    if (!passageDraft.text_ru.trim()) {
      setError(t('fillAllFields'));
      return;
    }
    setPassageSaving(true);
    setError(null);
    const fields = {
      title: passageDraft.title.trim() || null,
      text_ru: passageDraft.text_ru.trim(),
      text_kz: passageDraft.text_kz.trim() || null,
    };
    try {
      const saved = passageDraft.id === null
        ? await createPassage({ variant_id: variant.id, ...fields })
        : await updatePassage(passageDraft.id, fields);
      setPassages(prev => (prev.some(p => p.id === saved.id) ? prev.map(p => (p.id === saved.id ? saved : p)) : [...prev, saved]));
      set('passage_id', saved.id);
      setPassageDraft(null);
    } catch {
      setError(tAdmin('passageError'));
    }
    setPassageSaving(false);
  }

  async function handleSave() {
    if (!form.question_text || !form.option_a || !form.option_b || !form.option_c || !form.option_d) {
      setError(t('fillAllFields'));
      return;
    }

    let correctKey: string[] | Record<string, string> | null = null;
    let matchLeft: { ru: string; kz: string | null }[] | null = null;
    if (type === 'multiple') {
      const letters = correctLetters.filter(l => filledLetters.includes(l)).sort();
      if (letters.length < 1 || letters.length > 3) {
        setError(tAdmin('multipleError'));
        return;
      }
      correctKey = letters;
    } else if (type === 'matching') {
      const rows = statements.filter(s => s.ru.trim());
      if (rows.length < 2 || rows.some(s => !s.answer || !filledLetters.includes(s.answer))) {
        setError(tAdmin('matchingError'));
        return;
      }
      matchLeft = rows.map(s => ({ ru: s.ru.trim(), kz: s.kz.trim() || null }));
      correctKey = Object.fromEntries(rows.map((s, i) => [String(i + 1), s.answer]));
    }

    setSaving(true);
    setError(null);

    // Пустые необязательные поля храним как NULL
    const orNull = (value: string) => value.trim() || null;
    const extra = type !== 'single';
    const fields = {
      question_type: type,
      question_text: form.question_text,
      option_a: form.option_a,
      option_b: form.option_b,
      option_c: form.option_c,
      option_d: form.option_d,
      option_e: extra ? orNull(form.option_e) : null,
      option_f: extra ? orNull(form.option_f) : null,
      // у вопросов с ключом в correct_key одиночного ответа нет
      correct_answer: type === 'single' ? form.correct_answer : null,
      correct_key: correctKey,
      match_left: matchLeft,
      question_text_kz: orNull(form.question_text_kz),
      option_a_kz: orNull(form.option_a_kz),
      option_b_kz: orNull(form.option_b_kz),
      option_c_kz: orNull(form.option_c_kz),
      option_d_kz: orNull(form.option_d_kz),
      option_e_kz: extra ? orNull(form.option_e_kz) : null,
      option_f_kz: extra ? orNull(form.option_f_kz) : null,
      topic: orNull(form.topic),
      difficulty: form.difficulty,
      image_url: orNull(form.image_url),
      explanation_ru: orNull(form.explanation_ru),
      explanation_kz: orNull(form.explanation_kz),
      passage_id: form.passage_id,
    };

    try {
      if (question) {
        await updateQuestion(question.id, fields);
      } else {
        await createQuestion({ variant_id: variant.id, ...fields, order_num: nextOrderNum });
      }
      onSaved();
    } catch {
      setError(t('saveError'));
    }
    setSaving(false);
  }

  const optionLabel = (opt: (typeof OPTIONS)[number]) => (opt.extra ? tAdmin(opt.label) : t(opt.label as 'optionA'));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {question ? t('editQuestion') : t('newQuestion')}
            </h2>
            <p className="text-sm text-gray-500">{variant.variant_name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Тип вопроса */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{tAdmin('questionType')}</label>
            <div className="flex gap-2">
              {TYPES.map(value => (
                <button
                  key={value}
                  type="button"
                  onClick={() => set('question_type', value)}
                  className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                    type === value
                      ? 'border-[#2563eb] bg-blue-50 text-[#2563eb]'
                      : 'border-gray-200 hover:border-gray-300 text-gray-600'
                  }`}
                >
                  {tAdmin(TYPE_LABEL[value])}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">{tAdmin(`${TYPE_LABEL[type]}Hint`)}</p>
          </div>

          {/* Контекстный текст */}
          <div className="border border-gray-200 rounded-xl p-4 space-y-3">
            <div>
              <p className="text-sm font-bold text-gray-800">{tAdmin('passage')}</p>
              <p className="text-xs text-gray-500">{tAdmin('passageHint')}</p>
            </div>
            {passageDraft ? (
              <div className="space-y-3">
                <input
                  type="text"
                  value={passageDraft.title}
                  onChange={e => setPassageDraft({ ...passageDraft, title: e.target.value })}
                  maxLength={120}
                  className={inputClass}
                  placeholder={tAdmin('passageTitle')}
                />
                <textarea
                  value={passageDraft.text_ru}
                  onChange={e => setPassageDraft({ ...passageDraft, text_ru: e.target.value })}
                  rows={5}
                  className={textareaClass}
                  placeholder={tAdmin('passageTextRu')}
                />
                <textarea
                  value={passageDraft.text_kz}
                  onChange={e => setPassageDraft({ ...passageDraft, text_kz: e.target.value })}
                  rows={5}
                  className={textareaClass}
                  placeholder={tAdmin('passageTextKz')}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPassageDraft(null)}
                    className="px-4 py-2 border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-xl transition-colors"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={handleSavePassage}
                    disabled={passageSaving}
                    className="flex items-center gap-2 px-4 py-2 bg-[#2563eb] hover:bg-[#1e3a8a] text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
                  >
                    {passageSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                    {tAdmin('passageSave')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <select
                  value={form.passage_id ?? ''}
                  onChange={e => set('passage_id', e.target.value ? Number(e.target.value) : null)}
                  className={`${inputClass} flex-1 min-w-[180px]`}
                >
                  <option value="">{tAdmin('passageNone')}</option>
                  {passages.map(p => (
                    <option key={p.id} value={p.id}>{p.title || p.text_ru.slice(0, 60)}</option>
                  ))}
                </select>
                {form.passage_id !== null && (
                  <button
                    type="button"
                    onClick={() => {
                      const current = passages.find(p => p.id === form.passage_id);
                      if (current) setPassageDraft({ id: current.id, title: current.title ?? '', text_ru: current.text_ru, text_kz: current.text_kz ?? '' });
                    }}
                    className="px-4 py-2 border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-xl transition-colors"
                  >
                    {tAdmin('passageEdit')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPassageDraft({ id: null, title: '', text_ru: '', text_kz: '' })}
                  className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 hover:border-[#2563eb] hover:text-[#2563eb] text-gray-700 text-sm font-medium rounded-xl transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  {tAdmin('passageNew')}
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('questionText')} (RU)</label>
            <textarea
              value={form.question_text}
              onChange={e => set('question_text', e.target.value)}
              rows={3}
              className={textareaClass}
              placeholder={t('questionText')}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {shownOptions.map(opt => (
              <div key={opt.key}>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {optionLabel(opt)}
                  {opt.extra && <span className="ml-1 font-normal text-gray-400">({tAdmin('optionalOption')})</span>}
                </label>
                <input
                  type="text"
                  value={form[opt.key]}
                  onChange={e => set(opt.key, e.target.value)}
                  className={inputClass}
                  placeholder={optionLabel(opt)}
                />
              </div>
            ))}
          </div>

          {type === 'single' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('correctAnswer')}</label>
              <div className="flex gap-2">
                {(['A', 'B', 'C', 'D'] as const).map(option => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => set('correct_answer', option)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 font-medium transition-all ${
                      form.correct_answer === option
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                    }`}
                  >
                    {form.correct_answer === option && <Check className="w-4 h-4" />}
                    {option}
                  </button>
                ))}
              </div>
            </div>
          )}

          {type === 'multiple' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{tAdmin('correctAnswers')}</label>
              <div className="flex gap-2">
                {shownOptions.map(opt => {
                  const isOn = correctLetters.includes(opt.letter);
                  const isFilled = filledLetters.includes(opt.letter);
                  return (
                    <button
                      key={opt.letter}
                      type="button"
                      disabled={!isFilled}
                      onClick={() => setCorrectLetters(prev => (isOn ? prev.filter(l => l !== opt.letter) : [...prev, opt.letter]))}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 font-medium transition-all disabled:opacity-40 ${
                        isOn && isFilled
                          ? 'border-green-500 bg-green-50 text-green-700'
                          : 'border-gray-200 hover:border-gray-300 text-gray-600'
                      }`}
                    >
                      {isOn && isFilled && <Check className="w-4 h-4" />}
                      {opt.letter}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {type === 'matching' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{tAdmin('statements')}</label>
              <div className="space-y-3">
                {statements.map((row, i) => {
                  const update = (changes: Partial<Statement>) => setStatements(prev => prev.map((s, k) => (k === i ? { ...s, ...changes } : s)));
                  return (
                    <div key={i} className="border border-gray-200 rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 text-sm font-bold text-[#2563eb]">{i + 1}.</span>
                        <input
                          type="text"
                          value={row.ru}
                          onChange={e => update({ ru: e.target.value })}
                          className={inputClass}
                          placeholder={`${tAdmin('statement')} (RU)`}
                        />
                        <select
                          value={row.answer}
                          onChange={e => update({ answer: e.target.value as Letter | '' })}
                          className="px-3 py-2.5 border border-gray-200 rounded-xl bg-gray-50 font-medium"
                          aria-label={t('correctAnswer')}
                        >
                          <option value="">—</option>
                          {filledLetters.map(letter => <option key={letter} value={letter}>{letter}</option>)}
                        </select>
                        {statements.length > 2 && (
                          <button
                            type="button"
                            onClick={() => setStatements(prev => prev.filter((_, k) => k !== i))}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title={tAdmin('removeStatement')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        value={row.kz}
                        onChange={e => update({ kz: e.target.value })}
                        className={`${inputClass} ml-8 w-[calc(100%-2rem)]`}
                        placeholder={`${tAdmin('statement')} (KZ)`}
                      />
                    </div>
                  );
                })}
              </div>
              {statements.length < MAX_STATEMENTS && (
                <button
                  type="button"
                  onClick={() => setStatements(prev => [...prev, { ru: '', kz: '', answer: '' }])}
                  className="mt-3 flex items-center gap-1.5 text-sm text-[#2563eb] font-medium"
                >
                  <Plus className="w-4 h-4" />
                  {tAdmin('addStatement')}
                </button>
              )}
            </div>
          )}

          {/* Казахская версия */}
          <div className="border border-gray-200 rounded-xl p-4 space-y-3">
            <div>
              <p className="text-sm font-bold text-gray-800">{tAdmin('kzVersion')}</p>
              <p className="text-xs text-gray-500">{tAdmin('kzVersionHint')}</p>
            </div>
            <textarea
              value={form.question_text_kz}
              onChange={e => set('question_text_kz', e.target.value)}
              rows={2}
              className={textareaClass}
              placeholder={`${t('questionText')} (KZ)`}
            />
            <div className="grid grid-cols-2 gap-3">
              {shownOptions.map(opt => (
                <input
                  key={opt.kzKey}
                  type="text"
                  value={form[opt.kzKey]}
                  onChange={e => set(opt.kzKey, e.target.value)}
                  className={inputClass}
                  placeholder={`${optionLabel(opt)} (KZ)`}
                />
              ))}
            </div>
          </div>

          {/* Тема и сложность */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{tAdmin('topic')}</label>
              <input
                type="text"
                list="question-topic-suggestions"
                value={form.topic}
                onChange={e => set('topic', e.target.value)}
                maxLength={80}
                className={inputClass}
                placeholder={tAdmin('topicPlaceholder')}
              />
              <datalist id="question-topic-suggestions">
                {topicSuggestions.map(topic => <option key={topic} value={topic} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{tAdmin('difficulty')}</label>
              <div className="flex gap-2">
                {([1, 2, 3] as const).map(level => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => set('difficulty', form.difficulty === level ? null : level)}
                    className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                      form.difficulty === level
                        ? 'border-[#2563eb] bg-blue-50 text-[#2563eb]'
                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                    }`}
                  >
                    {tAdmin(`difficulty${level}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Картинка */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{tAdmin('image')}</label>
            {form.image_url ? (
              <div className="flex items-start gap-3">
                <img src={form.image_url} alt="" className="max-h-40 rounded-xl border border-gray-200" />
                <button
                  type="button"
                  onClick={() => set('image_url', '')}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  {tAdmin('removeImage')}
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-200 hover:border-[#2563eb] rounded-xl text-sm text-gray-500 cursor-pointer transition-colors">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                {tAdmin('uploadImage')}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={e => { handleImage(e.target.files?.[0]); e.target.value = ''; }}
                />
              </label>
            )}
          </div>

          {/* Объяснение */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{tAdmin('explanation')}</label>
            <p className="text-xs text-gray-500 mb-2">{tAdmin('explanationHint')}</p>
            <div className="space-y-3">
              <textarea
                value={form.explanation_ru}
                onChange={e => set('explanation_ru', e.target.value)}
                rows={2}
                className={textareaClass}
                placeholder={`${tAdmin('explanation')} (RU)`}
              />
              <textarea
                value={form.explanation_kz}
                onChange={e => set('explanation_kz', e.target.value)}
                rows={2}
                className={textareaClass}
                placeholder={`${tAdmin('explanation')} (KZ)`}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium rounded-xl transition-colors"
            >
              {t('cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={saving || uploading || passageDraft !== null}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#2563eb] hover:bg-[#1e3a8a] text-white font-medium rounded-xl transition-colors disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('saving')}
                </>
              ) : (
                t('save')
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
