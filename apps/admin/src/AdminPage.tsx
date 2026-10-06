import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, X, Check, AlertCircle, Loader2, ChevronDown, ChevronUp, FileQuestion, Calculator, Monitor, Globe, Atom, FlaskConical, Dna, MapPin, BookOpen, Sparkles, Users, BarChart3, Settings2, Database, Shield, Ban, Unlock, Trophy, TrendingUp, UploadCloud, Tags } from 'lucide-react';
import { useLanguage } from '@baiqautest/shared';
import { getSubjects, getVariants, getQuestionsByVariantPaginated, createVariant, updateVariant, deleteVariant, createQuestion, updateQuestion, deleteQuestion } from '@baiqautest/shared';
import { generateTestQuestions, suggestQuestionTopics, questionType, questionKey, formatAnswer } from '@baiqautest/shared';
import { useTranslation } from 'react-i18next';
import { adminListUsers, adminSetUserRole, adminToggleBlock, adminPlatformStats, type AdminUser, type PlatformStats } from '@baiqautest/shared';
import { ImportAdmin } from './admin/ImportAdmin';
import { QuestionForm } from './admin/QuestionForm';
import type { GeneratedQuestion } from '@baiqautest/shared';
import type { Subject, Variant, Question } from '@baiqautest/shared';

// Структура раздела ЕНТ по предмету: число заданий и сумма баллов (как ent_section_spec в SQL 14)
function entSpec(subjectName: string): { questions: number; points: number } {
  if (subjectName === 'kazakhstan_history') return { questions: 20, points: 20 };
  if (subjectName === 'math_literacy' || subjectName === 'reading_literacy') return { questions: 10, points: 10 };
  return { questions: 40, points: 50 };
}

type VariantFormData = {
  subject_id: number;
  variant_number: number;
  variant_name: string;
};

export function AdminPage() {
  const { t, language } = useLanguage();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  // Ленивая загрузка вопросов по вариантам (пагинация): variant_id → вопросы
  const [questionsByVariant, setQuestionsByVariant] = useState<Record<number, Question[]>>({});
  const [questionsTotal, setQuestionsTotal] = useState<Record<number, number>>({});
  const [questionsLoading, setQuestionsLoading] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);

  const [showVariantForm, setShowVariantForm] = useState(false);
  const [editingVariant, setEditingVariant] = useState<Variant | null>(null);
  const [variantFormData, setVariantFormData] = useState<VariantFormData>({
    subject_id: 0,
    variant_number: 1,
    variant_name: '',
  });

  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const [selectedVariantForQuestion, setSelectedVariantForQuestion] = useState<Variant | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSubjects, setExpandedSubjects] = useState<Set<number>>(new Set());

  // Sub-menu tabs
  const [adminTab, setAdminTab] = useState<'bank' | 'import' | 'users' | 'stats' | 'settings'>('bank');
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState<boolean>(() => localStorage.getItem('exam_sound') === '1');

  const loadUsers = useCallback(async () => {
    setAdminLoading(true);
    setAdminError(null);
    try {
      setAdminUsers(await adminListUsers());
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : String(err));
    }
    setAdminLoading(false);
  }, []);

  const loadStats = useCallback(async () => {
    setAdminLoading(true);
    setAdminError(null);
    try {
      setPlatformStats(await adminPlatformStats());
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : String(err));
    }
    setAdminLoading(false);
  }, []);

  useEffect(() => {
    if (adminTab === 'users') loadUsers();
    if (adminTab === 'stats') loadStats();
  }, [adminTab, loadUsers, loadStats]);

  async function handleRoleChange(userId: string, role: 'student' | 'admin') {
    setBusyUserId(userId);
    try {
      await adminSetUserRole(userId, role);
      await loadUsers();
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : String(err));
    }
    setBusyUserId(null);
  }

  async function handleToggleBlock(userId: string) {
    setBusyUserId(userId);
    try {
      await adminToggleBlock(userId);
      await loadUsers();
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : String(err));
    }
    setBusyUserId(null);
  }

  // AI generation state
  const [showAIGenerateModal, setShowAIGenerateModal] = useState(false);
  const [aiGenerateSubject, setAiGenerateSubject] = useState<Subject | null>(null);
  const [aiQuestionCount, setAiQuestionCount] = useState(10);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiGeneratedQuestions, setAiGeneratedQuestions] = useState<GeneratedQuestion[]>([]);
  const [aiSavingAll, setAiSavingAll] = useState(false);
  const [aiSuccess, setAiSuccess] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Расстановка тем ИИ по вопросам предмета, у которых тема не задана
  const { t: tAdmin } = useTranslation('admin');
  const [topicJob, setTopicJob] = useState<{ subjectId: number; done: number; total: number } | null>(null);
  const [topicNotice, setTopicNotice] = useState<{ subjectId: number; text: string; isError: boolean } | null>(null);

  async function handleFillTopics(subject: Subject) {
    if (topicJob) return;
    setTopicNotice(null);
    setTopicJob({ subjectId: subject.id, done: 0, total: 0 });
    try {
      // все вопросы предмета, а не только уже раскрытые в списке
      const all: Question[] = [];
      for (const variant of variants.filter(v => v.subject_id === subject.id)) {
        for (let page = 1; ; page++) {
          const { questions: chunk, count } = await getQuestionsByVariantPaginated(variant.id, page, 200);
          all.push(...chunk);
          if (chunk.length === 0 || page * 200 >= count) break;
        }
      }
      const known = new Set(all.map(q => q.topic?.trim()).filter((v): v is string => !!v));
      const missing = all.filter(q => !q.topic?.trim());
      if (missing.length === 0) {
        setTopicNotice({ subjectId: subject.id, text: tAdmin('topicsNothing'), isError: false });
        setTopicJob(null);
        return;
      }

      let filled = 0;
      setTopicJob({ subjectId: subject.id, done: 0, total: missing.length });
      for (let i = 0; i < missing.length; i += 25) {
        const batch = missing.slice(i, i + 25);
        const topics = await suggestQuestionTopics(subject.name, batch, [...known]);
        for (const q of batch) {
          const topic = topics[q.id];
          if (!topic) continue;
          await updateQuestion(q.id, { topic });
          known.add(topic);
          filled++;
        }
        setTopicJob({ subjectId: subject.id, done: Math.min(i + 25, missing.length), total: missing.length });
      }
      setTopicNotice({ subjectId: subject.id, text: tAdmin('topicsDone', { filled, total: missing.length }), isError: false });
      await Promise.all(variants.filter(v => v.subject_id === subject.id && questionsByVariant[v.id]).map(v => reloadVariantQuestions(v.id)));
    } catch (err) {
      console.error('Topic fill error:', err);
      setTopicNotice({ subjectId: subject.id, text: `${tAdmin('topicsError')} (${err instanceof Error ? err.message : String(err)})`, isError: true });
    }
    setTopicJob(null);
  }

  const subjectIcons: Record<string, typeof Calculator> = {
    math: Calculator,
    informatics: Monitor,
    kazakhstan_history: Globe,
    world_history: BookOpen,
    physics: Atom,
    chemistry: FlaskConical,
    biology: Dna,
    geography: MapPin,
    english: Globe,
  };

  function getSubjectIcon(name: string): typeof Calculator {
    return subjectIcons[name] || FileQuestion;
  }

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [subjectsData, variantsData] = await Promise.all([
        getSubjects(),
        getVariants(),
      ]);
      setSubjects(subjectsData);
      setVariants(variantsData);
    } catch (err) {
      console.error('Error loading data:', err);
    }
    setLoading(false);
  }

  async function loadVariantQuestions(variantId: number) {
    if (questionsLoading[variantId]) return;
    const current = questionsByVariant[variantId] || [];
    const page = Math.floor(current.length / 50) + 1;
    setQuestionsLoading(prev => ({ ...prev, [variantId]: true }));
    try {
      const { questions: newQuestions, count } = await getQuestionsByVariantPaginated(variantId, page, 50);
      setQuestionsByVariant(prev => ({
        ...prev,
        [variantId]: [...(prev[variantId] || []), ...newQuestions],
      }));
      setQuestionsTotal(prev => ({ ...prev, [variantId]: count }));
    } catch (err) {
      console.error('Error loading questions:', err);
    }
    setQuestionsLoading(prev => ({ ...prev, [variantId]: false }));
  }

  async function reloadVariantQuestions(variantId: number) {
    setQuestionsLoading(prev => ({ ...prev, [variantId]: true }));
    try {
      const { questions: qs, count } = await getQuestionsByVariantPaginated(variantId, 1, 50);
      setQuestionsByVariant(prev => ({ ...prev, [variantId]: qs }));
      setQuestionsTotal(prev => ({ ...prev, [variantId]: count }));
    } catch (err) {
      console.error('Error reloading questions:', err);
    }
    setQuestionsLoading(prev => ({ ...prev, [variantId]: false }));
  }

  function toggleSubject(subjectId: number) {
    const newExpanded = new Set(expandedSubjects);
    if (newExpanded.has(subjectId)) {
      newExpanded.delete(subjectId);
    } else {
      newExpanded.add(subjectId);
      // Ленивая загрузка вопросов для вариантов раскрытого предмета
      variants
        .filter(v => v.subject_id === subjectId)
        .forEach(v => {
          if (!questionsByVariant[v.id] || questionsByVariant[v.id].length === 0) {
            loadVariantQuestions(v.id);
          }
        });
    }
    setExpandedSubjects(newExpanded);
  }

  // Variant operations
  function startCreateVariant(subjectId: number) {
    setEditingVariant(null);
    setVariantFormData({
      subject_id: subjectId,
      variant_number: 1,
      variant_name: '',
    });
    setShowVariantForm(true);
  }

  function startEditVariant(variant: Variant) {
    setEditingVariant(variant);
    setVariantFormData({
      subject_id: variant.subject_id,
      variant_number: variant.variant_number,
      variant_name: variant.variant_name || '',
    });
    setShowVariantForm(true);
  }

  async function handleSaveVariant() {
    if (!variantFormData.subject_id) {
      setError(t('fillAllFields'));
      return;
    }
    if (!variantFormData.variant_number || variantFormData.variant_number < 1) {
      setError('Номер варианта должен быть >= 1');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (editingVariant) {
        await updateVariant(editingVariant.id, {
          variant_number: variantFormData.variant_number,
          variant_name: variantFormData.variant_name || `${variantFormData.variant_number}-${language === 'kz' ? 'нұсқа' : 'вариант'}`,
        });
      } else {
        await createVariant({
          subject_id: variantFormData.subject_id,
          variant_number: variantFormData.variant_number,
          variant_name: variantFormData.variant_name || `${variantFormData.variant_number}-${language === 'kz' ? 'нұсқа' : 'вариант'}`,
        });
      }
      await loadData();
      setShowVariantForm(false);
    } catch (err) {
      setError(t('saveError'));
    }
    setSaving(false);
  }

  async function handleDeleteVariant(variant: Variant) {
    if (!confirm(t('deleteVariantConfirm'))) return;
    try {
      await deleteVariant(variant.id);
      await loadData();
    } catch (err) {
      console.error('Error deleting variant:', err);
    }
  }

  // Question operations
  function startCreateQuestion(variant: Variant) {
    setSelectedVariantForQuestion(variant);
    setEditingQuestion(null);
    setShowQuestionForm(true);
  }

  function startEditQuestion(question: Question, variant: Variant) {
    setSelectedVariantForQuestion(variant);
    setEditingQuestion(question);
    setShowQuestionForm(true);
  }

  async function handleDeleteQuestion(question: Question) {
    if (!confirm(t('deleteConfirm'))) return;
    try {
      await deleteQuestion(question.id, question.variant_id);
      await reloadVariantQuestions(question.variant_id);
    } catch (err) {
      console.error('Error deleting question:', err);
    }
  }

  // AI Generation
  function openAIGenerate(subject: Subject) {
    setAiGenerateSubject(subject);
    setAiQuestionCount(10);
    setAiGeneratedQuestions([]);
    setAiSuccess(false);
    setAiError(null);
    setShowAIGenerateModal(true);
  }

  async function handleAIGenerate() {
    if (!aiGenerateSubject) return;
    setAiGenerating(true);
    setAiError(null);
    setAiGeneratedQuestions([]);

    try {
      const generated = await generateTestQuestions(
        aiGenerateSubject.name,
        aiQuestionCount,
        language
      );
      setAiGeneratedQuestions(generated);
    } catch (err) {
      console.error('AI generation error:', err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      setAiError(`${t('aiGenerateError')} (${errorMsg})`);
    }
    setAiGenerating(false);
  }

  async function handleSaveAIQuestions() {
    if (!aiGenerateSubject || aiGeneratedQuestions.length === 0) return;
    setAiSavingAll(true);
    setAiError(null);

    try {
      // Get existing variants to determine next number
      const subjectVariants = variants.filter(v => v.subject_id === aiGenerateSubject.id);
      const nextNumber = subjectVariants.length > 0
        ? Math.max(...subjectVariants.map(v => v.variant_number)) + 1
        : 1;

      // Create new variant
      const newVariant = await createVariant({
        subject_id: aiGenerateSubject.id,
        variant_number: nextNumber,
        variant_name: `${nextNumber}-${language === 'kz' ? 'нұсқа (ЖИ)' : 'вариант (ИИ)'}`,
      });

      // Add all questions to the variant
      for (let i = 0; i < aiGeneratedQuestions.length; i++) {
        const q = aiGeneratedQuestions[i];
        await createQuestion({
          variant_id: newVariant.id,
          question_text: q.question_text,
          option_a: q.option_a,
          option_b: q.option_b,
          option_c: q.option_c,
          option_d: q.option_d,
          correct_answer: q.correct_answer,
          order_num: i + 1,
          ...(q.topic ? { topic: q.topic } : {}),
        });
      }

      setAiSuccess(true);
      await loadData();

      // Auto-close after short delay
      setTimeout(() => {
        setShowAIGenerateModal(false);
        setAiSuccess(false);
      }, 1500);
    } catch (err) {
      console.error('Error saving AI questions:', err);
      setAiError(t('saveError'));
    }
    setAiSavingAll(false);
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('adminPanel')}</h1>
      </div>

      {/* Sub-menu */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {([
          { id: 'bank', label: language === 'kz' ? 'Сұрақтар банкі' : 'Банк вопросов', icon: Database },
          { id: 'import', label: language === 'kz' ? 'Тест импорттау' : 'Импорт тестов', icon: UploadCloud },
          { id: 'users', label: language === 'kz' ? 'Пайдаланушылар' : 'Пользователи', icon: Users },
          { id: 'stats', label: language === 'kz' ? 'Статистика' : 'Статистика', icon: BarChart3 },
          { id: 'settings', label: language === 'kz' ? 'Баптаулар' : 'Настройки', icon: Settings2 },
        ] as const).map(item => {
          const Icon = item.icon;
          const isActive = adminTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setAdminTab(item.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-[#2563eb] text-white shadow-md shadow-blue-200'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-[#2563eb] hover:text-[#2563eb]'
              }`}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </button>
          );
        })}
      </div>

      {adminTab === 'import' && (
        <ImportAdmin />
      )}

      {adminTab === 'bank' && (
        <div>
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#2563eb]" />
        </div>
      ) : subjects.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gray-100 mb-4">
            <FileQuestion className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">{t('noVariantsAdmin')}</h2>
          <p className="text-gray-500">{t('noVariantsAdminDesc')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {subjects.map(subject => {
            const Icon = getSubjectIcon(subject.name);
            const subjectVariants = variants.filter(v => v.subject_id === subject.id);

            return (
              <div key={subject.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <button
                  onClick={() => toggleSubject(subject.id)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#2563eb] rounded-xl flex items-center justify-center">
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div className="text-left">
                      <span className="font-semibold text-gray-900">{subject.name}</span>
                      <span className="text-sm text-gray-500 ml-2">({subjectVariants.length} {t('variantsCount')})</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startCreateVariant(subject.id);
                      }}
                      className="p-2 text-[#2563eb] hover:bg-blue-50 rounded-xl transition-colors"
                      title={t('addVariant')}
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openAIGenerate(subject);
                      }}
                      className="p-2 text-violet-600 hover:bg-violet-50 rounded-xl transition-colors"
                      title={t('aiGenerate')}
                    >
                      <Sparkles className="w-5 h-5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFillTopics(subject);
                      }}
                      disabled={topicJob !== null}
                      className="flex items-center gap-1.5 p-2 text-amber-600 hover:bg-amber-50 rounded-xl transition-colors disabled:opacity-50"
                      title={tAdmin('topicsFill')}
                    >
                      {topicJob?.subjectId === subject.id ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          {topicJob.total > 0 && <span className="text-xs font-medium tabular-nums">{topicJob.done}/{topicJob.total}</span>}
                        </>
                      ) : (
                        <Tags className="w-5 h-5" />
                      )}
                    </button>
                    {expandedSubjects.has(subject.id) ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </button>

                {topicNotice?.subjectId === subject.id && (
                  <div className={`px-5 py-2.5 text-sm border-t ${topicNotice.isError ? 'bg-red-50 border-red-100 text-red-600' : 'bg-amber-50 border-amber-100 text-amber-800'}`}>
                    {topicNotice.text}
                  </div>
                )}

                {expandedSubjects.has(subject.id) && (
                  <div className="border-t border-gray-100 divide-y divide-gray-100">
                    {subjectVariants.length === 0 ? (
                      <div className="p-5 text-center text-gray-500">
                        {t('noVariants')}
                      </div>
                    ) : (
                      subjectVariants.map(variant => {
                        const variantQuestions = questionsByVariant[variant.id] || [];
                        const loadedTotal = questionsTotal[variant.id] ?? variantQuestions.length;
                        const hasMore = variantQuestions.length < loadedTotal;
                        const spec = entSpec(subject.name);
                        const isEntFormat = loadedTotal === spec.questions && variant.total_score === spec.points;

                        return (
                          <div key={variant.id} className="p-5">
                            <div className="flex items-center justify-between mb-3">
                              <div>
                                <h3 className="font-semibold text-gray-900">{variant.variant_name || `${variant.variant_number}-${language === 'kz' ? 'нұсқа' : 'вариант'}`}</h3>
                                <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                                  <span>{loadedTotal} {language === 'kz' ? 'сұрақ' : 'вопросов'}</span>
                                  <span>{variant.total_score} {language === 'kz' ? 'балл' : 'баллов'}</span>
                                  {questionsTotal[variant.id] !== undefined && (
                                    <span
                                      className={`px-2 py-0.5 rounded-lg text-xs font-medium ${isEntFormat ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                                      title={tAdmin('entFormatHint', { questions: spec.questions, points: spec.points })}
                                    >
                                      {isEntFormat ? tAdmin('entFormat') : tAdmin('entFormatNo', { questions: spec.questions, points: spec.points })}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => startCreateQuestion(variant)}
                                  className="p-2 text-[#2563eb] hover:bg-blue-50 rounded-xl transition-colors"
                                  title={t('addQuestion')}
                                >
                                  <Plus className="w-5 h-5" />
                                </button>
                                <button
                                  onClick={() => startEditVariant(variant)}
                                  className="p-2 text-gray-400 hover:text-[#2563eb] hover:bg-blue-50 rounded-xl transition-colors"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteVariant(variant)}
                                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            {variantQuestions.length > 0 && (
                              <div className="mt-3 space-y-2">
                                {variantQuestions.map((q, idx) => (
                                  <div key={q.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 text-sm">
                                        <span className="text-gray-400 font-medium w-6">{idx + 1}.</span>
                                        <span className="text-gray-700 truncate max-w-md">{q.question_text}</span>
                                        <span className={`text-xs px-2 py-0.5 rounded-lg whitespace-nowrap ${q.correct_answer === 'A' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                                          {formatAnswer(questionKey(q))}
                                        </span>
                                        {questionType(q) !== 'single' && (
                                          <span className="text-xs px-2 py-0.5 rounded-lg bg-blue-50 text-[#2563eb] whitespace-nowrap">
                                            {tAdmin(questionType(q) === 'multiple' ? 'typeMultiple' : 'typeMatching')}
                                          </span>
                                        )}
                                        {!q.topic && (
                                          <span className="text-xs px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 whitespace-nowrap">{tAdmin('noTopic')}</span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={() => startEditQuestion(q, variant)}
                                        className="p-1.5 text-gray-400 hover:text-[#2563eb] hover:bg-blue-50 rounded-lg transition-colors"
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteQuestion(q)}
                                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                            {hasMore && (
                              <button
                                onClick={() => loadVariantQuestions(variant.id)}
                                disabled={questionsLoading[variant.id]}
                                className="mt-2 flex items-center justify-center gap-1.5 w-full py-2 text-sm text-[#2563eb] hover:bg-blue-50 rounded-xl transition-colors disabled:opacity-50"
                              >
                                {questionsLoading[variant.id] ? (
                                  <><Loader2 className="w-4 h-4 animate-spin" />{language === 'kz' ? 'Жүктелуде...' : 'Загрузка...'}</>
                                ) : (
                                  <>{language === 'kz' ? 'Тағы көрсету' : 'Показать ещё'} ({variantQuestions.length} / {loadedTotal})</>
                                )}
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Variant Form Modal */}
      {showVariantForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">
                {editingVariant ? t('editVariant') : t('addVariant')}
              </h2>
              <button
                onClick={() => setShowVariantForm(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('variantNumber')}</label>
                <input
                  type="number"
                  min={1}
                  value={variantFormData.variant_number}
                  onChange={e => setVariantFormData({ ...variantFormData, variant_number: parseInt(e.target.value) || 1 })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb] bg-gray-50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('variantName')}</label>
                <input
                  type="text"
                  value={variantFormData.variant_name}
                  onChange={e => setVariantFormData({ ...variantFormData, variant_name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb] bg-gray-50"
                  placeholder={`1-${language === 'kz' ? 'нұсқа' : 'вариант'}`}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowVariantForm(false)}
                  className="flex-1 py-2.5 border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium rounded-xl transition-colors"
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={handleSaveVariant}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#2563eb] hover:bg-[#1e3a8a] text-white font-medium rounded-xl transition-colors disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : t('save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Question Form Modal */}
      {showQuestionForm && selectedVariantForQuestion && (
        <QuestionForm
          key={editingQuestion?.id ?? 'new'}
          variant={selectedVariantForQuestion}
          question={editingQuestion}
          nextOrderNum={(questionsByVariant[selectedVariantForQuestion.id] || []).length + 1}
          topicSuggestions={[...new Set(
            Object.values(questionsByVariant).flat().map(q => q.topic).filter((v): v is string => !!v)
          )].sort()}
          onClose={() => setShowQuestionForm(false)}
          onSaved={async () => {
            setShowQuestionForm(false);
            await reloadVariantQuestions(selectedVariantForQuestion.id);
          }}
        />
      )}

      {/* AI Generate Modal */}
      {showAIGenerateModal && aiGenerateSubject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{t('aiGenerateTitle')}</h2>
                  <p className="text-sm text-gray-500">{aiGenerateSubject.name}</p>
                </div>
              </div>
              <button
                onClick={() => setShowAIGenerateModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {aiSuccess ? (
                <div className="text-center py-8">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-green-100 mb-4">
                    <Check className="w-8 h-8 text-green-600" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-1">{t('aiGenerateSuccess')}</h3>
                  <p className="text-gray-500">{aiGeneratedQuestions.length} {t('aiGeneratedQuestions')}</p>
                </div>
              ) : aiGeneratedQuestions.length > 0 ? (
                /* Preview generated questions */
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-gray-900">
                      {t('aiPreview')}: {aiGeneratedQuestions.length} {t('aiGeneratedQuestions')}
                    </h3>
                  </div>

                  <div className="space-y-3 mb-6 max-h-[400px] overflow-y-auto pr-2">
                    {aiGeneratedQuestions.map((q, idx) => (
                      <div key={idx} className="bg-gray-50 rounded-xl p-4 text-sm">
                        <p className="font-medium text-gray-900 mb-2">
                          <span className="text-violet-600 mr-1">{idx + 1}.</span> {q.question_text}
                        </p>
                        <div className="grid grid-cols-2 gap-1.5 text-gray-600">
                          <span className={q.correct_answer === 'A' ? 'text-green-700 font-semibold' : ''}>
                            A) {q.option_a}
                          </span>
                          <span className={q.correct_answer === 'B' ? 'text-green-700 font-semibold' : ''}>
                            B) {q.option_b}
                          </span>
                          <span className={q.correct_answer === 'C' ? 'text-green-700 font-semibold' : ''}>
                            C) {q.option_c}
                          </span>
                          <span className={q.correct_answer === 'D' ? 'text-green-700 font-semibold' : ''}>
                            D) {q.option_d}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {aiError && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl mb-4">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      {aiError}
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={handleAIGenerate}
                      disabled={aiSavingAll}
                      className="flex-1 py-3 border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium rounded-xl transition-colors"
                    >
                      {t('tryAgain')}
                    </button>
                    <button
                      onClick={handleSaveAIQuestions}
                      disabled={aiSavingAll}
                      className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 text-white font-medium rounded-xl transition-all disabled:opacity-50"
                    >
                      {aiSavingAll ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {t('aiSaving')}
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          {t('aiSaveAll')}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                /* Generation form */
                <div>
                  <p className="text-gray-500 text-sm mb-6">{t('aiGenerateDesc')}</p>

                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('aiQuestionCount')}</label>
                    <div className="flex gap-2">
                      {[5, 10, 15, 20, 25].map(count => (
                        <button
                          key={count}
                          onClick={() => setAiQuestionCount(count)}
                          disabled={aiGenerating}
                          className={`flex-1 py-3 rounded-xl font-medium text-sm transition-all ${
                            aiQuestionCount === count
                              ? 'bg-violet-100 text-violet-700 border-2 border-violet-300'
                              : 'bg-gray-50 text-gray-600 border-2 border-transparent hover:bg-gray-100'
                          }`}
                        >
                          {count}
                        </button>
                      ))}
                    </div>
                  </div>

                  {aiError && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl mb-4">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      {aiError}
                    </div>
                  )}

                  <button
                    onClick={handleAIGenerate}
                    disabled={aiGenerating}
                    className="w-full flex items-center justify-center gap-3 py-4 bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 text-white font-medium rounded-xl transition-all disabled:opacity-70 shadow-lg shadow-violet-200"
                  >
                    {aiGenerating ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        {t('aiGenerating')}
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5" />
                        {t('aiGenerateBtn')}
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
        </div>
      )}

      {/* ── Users tab ─────────────────────────────────────────────────── */}
      {adminTab === 'users' && (
        <div>
          {adminError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl">{adminError}</div>
          )}
          {adminLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#2563eb]" />
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-gray-500 border-b border-gray-100">
                      <th className="px-4 py-3 font-medium">{language === 'kz' ? 'Аты' : 'Имя'}</th>
                      <th className="px-4 py-3 font-medium">Email</th>
                      <th className="px-4 py-3 font-medium">{language === 'kz' ? 'Рөлі' : 'Роль'}</th>
                      <th className="px-4 py-3 font-medium">{language === 'kz' ? 'Тесттер' : 'Тесты'}</th>
                      <th className="px-4 py-3 font-medium">{language === 'kz' ? 'Тіркелген' : 'Регистрация'}</th>
                      <th className="px-4 py-3 font-medium text-right">{language === 'kz' ? 'Әрекеттер' : 'Действия'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {adminUsers.map(u => (
                      <tr key={u.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-[#2563eb]/10 flex items-center justify-center flex-shrink-0">
                              <Shield className="w-4 h-4 text-[#2563eb]" />
                            </div>
                            <span className="font-medium text-gray-900">
                              {[u.last_name, u.first_name].filter(Boolean).join(' ') || '—'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-500">{u.email || '—'}</td>
                        <td className="px-4 py-3">
                          <select
                            value={u.role}
                            disabled={busyUserId === u.id}
                            onChange={e => handleRoleChange(u.id, e.target.value as 'student' | 'admin')}
                            className="px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 disabled:opacity-50"
                            aria-label="Role"
                          >
                            <option value="student">{language === 'kz' ? 'Оқушы' : 'Ученик'}</option>
                            <option value="admin">{language === 'kz' ? 'Әкімші' : 'Админ'}</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-gray-600 font-medium">{u.tests_count}</td>
                        <td className="px-4 py-3 text-gray-500">
                          {new Date(u.created_at).toLocaleDateString(language === 'kz' ? 'kk-KZ' : 'ru-RU')}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleToggleBlock(u.id)}
                            disabled={busyUserId === u.id}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50 ${
                              u.is_blocked
                                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                : 'bg-red-50 text-red-600 hover:bg-red-100'
                            }`}
                          >
                            {busyUserId === u.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : u.is_blocked ? (
                              <><Unlock className="w-3.5 h-3.5" />{language === 'kz' ? 'Босату' : 'Разблок.'}</>
                            ) : (
                              <><Ban className="w-3.5 h-3.5" />{language === 'kz' ? 'Бұғаттау' : 'Блок'}</>
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Stats tab ─────────────────────────────────────────────────── */}
      {adminTab === 'stats' && (
        <div>
          {adminError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl">{adminError}</div>
          )}
          {adminLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#2563eb]" />
            </div>
          ) : platformStats ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="card p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center"><Users className="w-5 h-5 text-blue-600" /></div>
                  <span className="text-sm text-gray-500">{language === 'kz' ? 'Пайдаланушылар' : 'Пользователи'}</span>
                </div>
                <p className="text-3xl font-bold text-gray-900">{platformStats.total_users}</p>
              </div>
              <div className="card p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><BarChart3 className="w-5 h-5 text-emerald-600" /></div>
                  <span className="text-sm text-gray-500">{language === 'kz' ? 'Тапсырылған тесттер' : 'Пройдено тестов'}</span>
                </div>
                <p className="text-3xl font-bold text-gray-900">{platformStats.total_tests}</p>
              </div>
              <div className="card p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center"><FileQuestion className="w-5 h-5 text-amber-600" /></div>
                  <span className="text-sm text-gray-500">{language === 'kz' ? 'Сұрақтар' : 'Вопросов'}</span>
                </div>
                <p className="text-3xl font-bold text-gray-900">{platformStats.total_questions}</p>
              </div>
              <div className="card p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center"><Database className="w-5 h-5 text-violet-600" /></div>
                  <span className="text-sm text-gray-500">{language === 'kz' ? 'Нұсқалар' : 'Вариантов'}</span>
                </div>
                <p className="text-3xl font-bold text-gray-900">{platformStats.total_variants}</p>
              </div>
              <div className="card p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center"><Trophy className="w-5 h-5 text-rose-600" /></div>
                  <span className="text-sm text-gray-500">{language === 'kz' ? 'Ең көп тапсырылған пән' : 'Популярный предмет'}</span>
                </div>
                <p className="text-3xl font-bold text-gray-900 truncate">{platformStats.top_subject || '—'}</p>
              </div>
              <div className="card p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-100 flex items-center justify-center"><TrendingUp className="w-5 h-5 text-cyan-600" /></div>
                  <span className="text-sm text-gray-500">{language === 'kz' ? 'Орташа балл' : 'Средний балл'}</span>
                </div>
                <p className="text-3xl font-bold text-gray-900">{platformStats.avg_score ?? 0}%</p>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* ── Settings tab ──────────────────────────────────────────────── */}
      {adminTab === 'settings' && (
        <div className="card p-6 max-w-lg">
          <h3 className="font-bold text-gray-900 mb-4">{language === 'kz' ? 'Баптаулар' : 'Настройки'}</h3>
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-gray-800">{language === 'kz' ? 'Дыбыс эффекттері' : 'Звуковые эффекты'}</p>
                <p className="text-sm text-gray-500">{language === 'kz' ? 'Тест кезінде дыбыс' : 'Звук во время теста'}</p>
              </div>
              <button
                onClick={() => {
                  const v = !(localStorage.getItem('exam_sound') === '1');
                  localStorage.setItem('exam_sound', v ? '1' : '0');
                  setSoundOn(v);
                }}
                className={`relative w-12 h-6 rounded-full transition-colors ${soundOn ? 'bg-[#2563eb]' : 'bg-gray-300'}`}
                aria-label="Sound"
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${soundOn ? 'left-6' : 'left-0.5'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between gap-4 opacity-60">
              <div>
                <p className="font-medium text-gray-800">{language === 'kz' ? 'Қараңғы режим' : 'Тёмная тема'}</p>
                <p className="text-sm text-gray-500">{language === 'kz' ? 'Жақында қосылады' : 'Скоро'}</p>
              </div>
              <span className="text-xs text-gray-400 px-3 py-1.5 bg-gray-100 rounded-lg">{language === 'kz' ? 'Жақында' : 'Soon'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
