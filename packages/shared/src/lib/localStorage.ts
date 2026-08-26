import { supabase } from '../supabase';
import type { Subject, Variant, Question, TestResult } from '../types';

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
    .single();
  if (error) return null;
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
      variant_name: variant.variant_name || `${variant.variant_number}-нұсқа`,
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

export async function getQuestionsByVariantId(variantId: number): Promise<Question[]> {
  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .eq('variant_id', variantId)
    .order('order_num');
  if (error) throw error;
  return data || [];
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

export async function createQuestion(question: {
  variant_id: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: 'A' | 'B' | 'C' | 'D';
  order_num?: number;
}): Promise<Question> {
  const { data, error } = await supabase
    .from('questions')
    .insert({
      ...question,
      score: 1,
      order_num: question.order_num || 1,
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
export async function getTestResults(userId: string): Promise<(TestResult & { variants: Variant; subjects: Subject })[]> {
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

  // Keep only the most recent attempt per variant (no duplicates)
  const latestByVariant = new Map<string, typeof data[number]>();
  (data || []).forEach(r => {
    const existing = latestByVariant.get(r.variant_id);
    if (!existing || new Date(r.taken_at) > new Date(existing.taken_at)) {
      latestByVariant.set(r.variant_id, r);
    }
  });
  const unique = [...latestByVariant.values()];

  // Get subjects for each result
  const subjectIds = [...new Set(unique?.map(r => r.variants?.subject_id).filter(Boolean))];
  const { data: subjects } = await supabase
    .from('subjects')
    .select('*')
    .in('id', subjectIds);

  return (unique || []).map(r => ({
    ...r,
    subjects: subjects?.find(s => s.id === r.variants?.subject_id),
  })) as (TestResult & { variants: Variant; subjects: Subject })[];
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
  if (error) return null;
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

export async function saveTestResult(result: {
  student_id: string;
  variant_id: number;
  score: number;
  total_score: number;
  answers?: Record<string, string>;
}): Promise<TestResult> {
  return withTimeout((async () => {
    const { data, error } = await supabase.rpc('submit_test_result', {
      p_student_id: result.student_id,
      p_variant_id: result.variant_id,
      p_score: result.score,
      p_total_score: result.total_score,
      p_answers: result.answers || null,
    });
    if (error) throw error;
    return data?.[0] as TestResult;
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
