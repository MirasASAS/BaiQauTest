import { supabase } from '../supabase';
import type { Subject, Variant, Question, TestQuestion, TestResult, TestAttempt, ReviewQuestion } from '../types';

// Subjects
export async function getSubjects(): Promise<Subject[]> {
  const { data, error } = await supabase
    .from('subjects')
    .select('*')
    .order('name');
  if (error) throw error;
  return data || [];
}

// Variants
export async function getVariants(): Promise<Variant[]> {
  const { data, error } = await supabase
    .from('variants')
    .select('*')
    .order('variant_number');
  if (error) throw error;
  return data || [];
}

export async function getVariantsBySubjectId(subjectId: number): Promise<Variant[]> {
  const { data, error } = await supabase
    .from('variants')
    .select('*')
    .eq('subject_id', subjectId)
    .order('variant_number');
  if (error) throw error;
  return data || [];
}

export async function getVariant(id: number): Promise<Variant | null> {
  const { data, error } = await supabase
    .from('variants')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

export async function createVariant(variant: {
  subject_id: number;
  variant_number: number;
  variant_name?: string;
}): Promise<Variant> {
  const { data, error } = await supabase
    .from('variants')
    .insert({
      subject_id: variant.subject_id,
      variant_number: variant.variant_number,
      variant_name: variant.variant_name ?? `${variant.variant_number}-нұсқа`,
      total_score: 0,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateVariant(id: number, updates: Partial<Variant>): Promise<Variant> {
  const { data, error } = await supabase
    .from('variants')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteVariant(id: number): Promise<void> {
  const { error } = await supabase
    .from('variants')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// Questions
export async function getQuestions(): Promise<Question[]> {
  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .order('order_num');
  if (error) throw error;
  return data || [];
}

// Вопросы для прохождения теста — без correct_answer (RPC get_test_questions, SQL 08)
export async function getQuestionsByVariantId(variantId: number): Promise<TestQuestion[]> {
  const { data, error } = await supabase.rpc('get_test_questions', { p_variant_id: variantId });
  if (error) throw error;
  return data || [];
}

// Старт (или продолжение) попытки: вопросы без ответов и серверный дедлайн (SQL 09).
// msLeft посчитан по часам сервера, поэтому не зависит от времени на устройстве.
export async function startTestAttempt(variantId: number): Promise<{
  attempt: TestAttempt | null;
  questions: TestQuestion[];
  msLeft: number;
}> {
  const { data, error } = await supabase.rpc('start_test_attempt', { p_variant_id: variantId });
  if (error) throw error;
  const attempt = (data?.attempt ?? null) as TestAttempt | null;
  const msLeft = attempt
    ? Math.max(0, new Date(attempt.expires_at).getTime() - new Date(data.server_now).getTime())
    : 0;
  return { attempt, questions: (data?.questions || []) as TestQuestion[], msLeft };
}

export async function getQuestionsByVariantPaginated(
  variantId: number,
  page: number,
  pageSize = 50
): Promise<{ questions: Question[]; count: number }> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await supabase
    .from('questions')
    .select('*', { count: 'exact', head: false })
    .eq('variant_id', variantId)
    .order('order_num')
    .range(from, to);
  if (error) throw error;
  return { questions: data || [], count: count ?? 0 };
}

// Текст вопроса и вариантов на языке интерфейса: казахский — если он заполнен, иначе основной
export function localizeQuestion<T extends Pick<TestQuestion, 'question_text' | 'option_a' | 'option_b' | 'option_c' | 'option_d'
  | 'question_text_kz' | 'option_a_kz' | 'option_b_kz' | 'option_c_kz' | 'option_d_kz'>>(question: T, language: 'kz' | 'ru'): T {
  if (language !== 'kz') return question;
  return {
    ...question,
    question_text: question.question_text_kz || question.question_text,
    option_a: question.option_a_kz || question.option_a,
    option_b: question.option_b_kz || question.option_b,
    option_c: question.option_c_kz || question.option_c,
    option_d: question.option_d_kz || question.option_d,
  };
}

// Необязательные поля вопроса (SQL 10): перевод, тема, сложность, картинка, объяснение
export type QuestionExtras = Partial<Pick<Question,
  'question_text_kz' | 'option_a_kz' | 'option_b_kz' | 'option_c_kz' | 'option_d_kz'
  | 'topic' | 'difficulty' | 'image_url' | 'explanation_ru' | 'explanation_kz'>>;

// Загрузка картинки вопроса в публичный bucket question-images; возвращает ссылку
export async function uploadQuestionImage(file: File): Promise<string> {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const { error } = await supabase.storage.from('question-images').upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  return supabase.storage.from('question-images').getPublicUrl(path).data.publicUrl;
}

export async function createQuestion(question: {
  variant_id: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: 'A' | 'B' | 'C' | 'D';
  order_num?: number;
} & QuestionExtras): Promise<Question> {
  const { data, error } = await supabase
    .from('questions')
    .insert({
      ...question,
      score: 1,
      order_num: question.order_num ?? 1,
    })
    .select()
    .single();
  if (error) throw error;

  return data;
}

export async function updateQuestion(id: number, updates: Partial<Question>): Promise<Question> {
  const { data, error } = await supabase
    .from('questions')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteQuestion(id: number, _variantId: number): Promise<void> {
  const { error } = await supabase
    .from('questions')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// Test Results
export type TestResultWithDetails = TestResult & { variants: Variant; subjects: Subject };

// Все попытки ученика, новые сверху
export async function getAllTestResults(userId: string): Promise<TestResultWithDetails[]> {
  const { data, error } = await supabase
    .from('results')
    .select(`
      *,
      variants (
        id,
        subject_id,
        variant_number,
        variant_name,
        total_score
      )
    `)
    .eq('student_id', userId)
    .order('taken_at', { ascending: false });
  if (error) throw error;
  const rows = data || [];

  // Get subjects for each result
  const subjectIds = [...new Set(rows.map(r => r.variants?.subject_id).filter((v): v is number => typeof v === 'number'))];
  let subjects: Subject[] = [];
  if (subjectIds.length > 0) {
    const { data: subjectsData } = await supabase
      .from('subjects')
      .select('*')
      .in('id', subjectIds);
    subjects = subjectsData || [];
  }

  return rows.map(r => ({
    ...r,
    subjects: subjects.find(s => s.id === r.variants?.subject_id) ?? null,
  })) as TestResultWithDetails[];
}

// Только последняя попытка каждого варианта (для статистики на дашборде)
export async function getTestResults(userId: string): Promise<TestResultWithDetails[]> {
  const all = await getAllTestResults(userId);
  const seen = new Set<number>();
  return all.filter(r => {
    if (seen.has(r.variant_id)) return false;
    seen.add(r.variant_id);
    return true;
  });
}

// Разбор своей попытки: результат с ответами ученика + вопросы с ключом (RPC get_result_review, SQL 09)
export async function getResultReview(resultId: number): Promise<{ result: TestResult; questions: ReviewQuestion[] }> {
  const { data, error } = await supabase.rpc('get_result_review', { p_result_id: resultId });
  if (error) throw error;
  return { result: data.result as TestResult, questions: (data.questions || []) as ReviewQuestion[] };
}

export async function getTestResultByVariant(userId: string, variantId: number): Promise<TestResult | null> {
  const { data, error } = await supabase
    .from('results')
    .select('*')
    .eq('student_id', userId)
    .eq('variant_id', variantId)
    .order('taken_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

function withTimeout<T>(promise: Promise<T>, ms = 15000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Время ожидания запроса истекло. Проверьте соединение.')), ms);
    promise.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); },
    );
  });
}

export type AnswerKey = Record<string, Question['correct_answer'] | null>;

// Сдача теста: балл считает сервер (RPC submit_test_result, SQL 08).
// answers: {question_id: 'A'|'B'|'C'|'D'}; в ответ — результат и ключ правильных ответов.
export async function saveTestResult(result: {
  variant_id: number;
  answers: Record<string, string>;
}): Promise<{ result: TestResult; answerKey: AnswerKey }> {
  return withTimeout((async () => {
    const { data, error } = await supabase.rpc('submit_test_result', {
      p_variant_id: result.variant_id,
      p_answers: result.answers,
    });
    if (error) throw error;
    if (!data?.result) throw new Error('submit_test_result returned no row');
    return { result: data.result as TestResult, answerKey: (data.answer_key || {}) as AnswerKey };
  })());
}

// Get statistics for user
export async function getUserStats(userId: string): Promise<{
  testsCompleted: number;
  averageScore: number;
  bestResult: number;
}> {
  const results = await getTestResults(userId);
  if (results.length === 0) {
    return { testsCompleted: 0, averageScore: 0, bestResult: 0 };
  }

  const totalScore = results.reduce((sum, r) => sum + r.score, 0);
  const totalPoints = results.reduce((sum, r) => sum + r.total_score, 0);
  const average = totalPoints > 0 ? Math.round((totalScore / totalPoints) * 100) : 0;
  const best = Math.max(...results.map(r => r.total_score > 0 ? Math.round((r.score / r.total_score) * 100) : 0));

  return {
    testsCompleted: results.length,
    averageScore: average,
    bestResult: best,
  };
}
