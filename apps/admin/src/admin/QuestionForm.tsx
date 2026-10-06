import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Check, AlertCircle, Loader2, ImagePlus, Trash2 } from 'lucide-react';
import { useLanguage, createQuestion, updateQuestion, uploadQuestionImage } from '@baiqautest/shared';
import type { Question, Variant } from '@baiqautest/shared';

type Answer = 'A' | 'B' | 'C' | 'D';
type OptionKey = 'option_a' | 'option_b' | 'option_c' | 'option_d';
type OptionKzKey = `${OptionKey}_kz`;

const OPTIONS: { key: OptionKey; kzKey: OptionKzKey; label: 'optionA' | 'optionB' | 'optionC' | 'optionD' }[] = [
  { key: 'option_a', kzKey: 'option_a_kz', label: 'optionA' },
  { key: 'option_b', kzKey: 'option_b_kz', label: 'optionB' },
  { key: 'option_c', kzKey: 'option_c_kz', label: 'optionC' },
  { key: 'option_d', kzKey: 'option_d_kz', label: 'optionD' },
];

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const inputClass = 'w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb] bg-gray-50';
const textareaClass = 'w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb] resize-none bg-gray-50';

// Форма создания/редактирования вопроса: основной текст (RU), казахская версия,
// тема, сложность, картинка и объяснение.
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
    question_text: question?.question_text ?? '',
    option_a: question?.option_a ?? '',
    option_b: question?.option_b ?? '',
    option_c: question?.option_c ?? '',
    option_d: question?.option_d ?? '',
    correct_answer: (question?.correct_answer ?? 'A') as Answer,
    question_text_kz: question?.question_text_kz ?? '',
    option_a_kz: question?.option_a_kz ?? '',
    option_b_kz: question?.option_b_kz ?? '',
    option_c_kz: question?.option_c_kz ?? '',
    option_d_kz: question?.option_d_kz ?? '',
    topic: question?.topic ?? '',
    difficulty: (question?.difficulty ?? null) as 1 | 2 | 3 | null,
    image_url: question?.image_url ?? '',
    explanation_ru: question?.explanation_ru ?? '',
    explanation_kz: question?.explanation_kz ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm(prev => ({ ...prev, [key]: value }));

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

  async function handleSave() {
    if (!form.question_text || !form.option_a || !form.option_b || !form.option_c || !form.option_d) {
      setError(t('fillAllFields'));
      return;
    }

    setSaving(true);
    setError(null);

    // Пустые необязательные поля храним как NULL
    const orNull = (value: string) => value.trim() || null;
    const fields = {
      question_text: form.question_text,
      option_a: form.option_a,
      option_b: form.option_b,
      option_c: form.option_c,
      option_d: form.option_d,
      correct_answer: form.correct_answer,
      question_text_kz: orNull(form.question_text_kz),
      option_a_kz: orNull(form.option_a_kz),
      option_b_kz: orNull(form.option_b_kz),
      option_c_kz: orNull(form.option_c_kz),
      option_d_kz: orNull(form.option_d_kz),
      topic: orNull(form.topic),
      difficulty: form.difficulty,
      image_url: orNull(form.image_url),
      explanation_ru: orNull(form.explanation_ru),
      explanation_kz: orNull(form.explanation_kz),
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
            {OPTIONS.map(opt => (
              <div key={opt.key}>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t(opt.label)}</label>
                <input
                  type="text"
                  value={form[opt.key]}
                  onChange={e => set(opt.key, e.target.value)}
                  className={inputClass}
                  placeholder={t(opt.label)}
                />
              </div>
            ))}
          </div>

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
              {OPTIONS.map(opt => (
                <input
                  key={opt.kzKey}
                  type="text"
                  value={form[opt.kzKey]}
                  onChange={e => set(opt.kzKey, e.target.value)}
                  className={inputClass}
                  placeholder={`${t(opt.label)} (KZ)`}
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
              disabled={saving || uploading}
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
