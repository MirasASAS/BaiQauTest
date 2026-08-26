import { supabase } from '@baiqautest/shared';
import type {
  ImportJob,
  ImportQuestion,
  ImportOptions,
  ImportProgress,
  ImportFileType,
  ProcessedQuestion,
} from './types';
import { parseImportFile } from './parsers';
import { getAIProvider } from './aiProvider';
import { validateSet } from './validate';

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.\-а-яА-ЯәӘғҒқҚңҢөӨұҰүҮһҺіІ]/g, '_').replace(/\s+/g, '_');
}

function extOf(name: string): ImportFileType {
  const e = name.split('.').pop()?.toLowerCase();
  return (['xlsx', 'csv', 'docx', 'pdf'] as const).includes(e as ImportFileType)
    ? (e as ImportFileType)
    : 'csv';
}

// ── Job lifecycle ──────────────────────────────────────────────────────
export async function createImportJob(
  file: File,
  userId: string,
  options: ImportOptions,
): Promise<ImportJob> {
  const { data, error } = await supabase
    .from('import_jobs')
    .insert({
      file_name: file.name,
      file_type: extOf(file.name),
      file_size: file.size,
      status: 'uploaded',
      source_language: options.sourceLanguage,
      target_language: options.targetLanguage,
      batch_size: options.batchSize,
      created_by: userId,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function uploadImportFile(jobId: number, file: File, userId: string): Promise<string> {
  const path = `${userId}/${jobId}/${sanitizeFilename(file.name)}`;
  const { error } = await supabase.storage.from('test-imports').upload(path, file, { upsert: true });
  if (error) throw new Error(error.message);
  await supabase.from('import_jobs').update({ file_path: path }).eq('id', jobId);
  return path;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Полный цикл: parse → AI (по батчам) → validate → draft
export async function runImport(
  jobId: number,
  file: File,
  options: ImportOptions,
  onProgress: (p: ImportProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  const abortErr = () => new Error('Отменено');
  if (signal?.aborted) throw abortErr();

  onProgress({ phase: 'parse', processed: 0, total: 0, message: 'Parsing file…' });
  await supabase.from('import_jobs').update({ status: 'parsing' }).eq('id', jobId);

  const parseResult = await parseImportFile(file);
  if (signal?.aborted) { await setJobStatus(jobId, 'failed', 'Отменено пользователем'); throw abortErr(); }

  if (parseResult.format === 'needs_ocr') {
    await supabase.from('import_jobs').update({ status: 'needs_ocr', error: parseResult.errors.join('; ') }).eq('id', jobId);
    onProgress({ phase: 'error', processed: 0, total: 0, message: parseResult.errors[0] || 'OCR required' });
    return;
  }

  if (parseResult.questions.length === 0) {
    await supabase
      .from('import_jobs')
      .update({ status: 'failed', error: parseResult.errors.join('; ') || 'Файлды оқу мүмкін болмады.' })
      .eq('id', jobId);
    onProgress({ phase: 'error', processed: 0, total: 0, message: parseResult.errors.join('; ') });
    return;
  }

  await supabase.from('import_jobs').update({ status: 'processing', total_questions: parseResult.questions.length }).eq('id', jobId);

  const provider = getAIProvider();
  const batches = chunk(parseResult.questions, options.batchSize);
  const processed: ProcessedQuestion[] = [];
  let done = 0;
  let errors = 0;

  for (let b = 0; b < batches.length; b++) {
    if (signal?.aborted) { await setJobStatus(jobId, 'failed', 'Отменено пользователем'); throw abortErr(); }
    try {
      const batchResult = await provider.processQuestions(batches[b], {
        sourceLanguage: options.sourceLanguage,
        targetLanguage: options.targetLanguage,
      });
      processed.push(...batchResult);
    } catch {
      errors += batches[b].length;
    }
    done += batches[b].length;
    await supabase.from('import_jobs').update({ processed_questions: done, error_count: errors }).eq('id', jobId);
    onProgress({
      phase: 'process',
      processed: done,
      total: parseResult.questions.length,
      message: `${done} / ${parseResult.questions.length}`,
    });
  }

  // Валидация + дубликаты
  const validated = await validateSet(processed);
  if (signal?.aborted) { await setJobStatus(jobId, 'failed', 'Отменено пользователем'); throw abortErr(); }

  // Сохранить черновики
  await saveDraftQuestions(jobId, validated);

  await supabase
    .from('import_jobs')
    .update({ status: 'review', completed_at: new Date().toISOString(), error_count: errors })
    .eq('id', jobId);

  onProgress({ phase: 'done', processed: validated.length, total: validated.length, message: 'Review ready' });
}

export async function saveDraftQuestions(importId: number, questions: ProcessedQuestion[]): Promise<void> {
  const rows = questions.map(q => ({
    import_id: importId,
    question_ru: q.question_ru || null,
    question_kz: q.question_kz || null,
    option_a_ru: q.options_ru.A || null,
    option_b_ru: q.options_ru.B || null,
    option_c_ru: q.options_ru.C || null,
    option_d_ru: q.options_ru.D || null,
    option_a_kz: q.options_kz.A || null,
    option_b_kz: q.options_kz.B || null,
    option_c_kz: q.options_kz.C || null,
    option_d_kz: q.options_kz.D || null,
    correct_answer: q.correct_answer,
    confidence: q.confidence,
    needs_review: q.needs_review,
    is_duplicate: q.is_duplicate,
    status: q.needs_review ? 'review' : 'draft',
    source_index: q.source_index,
  }));

  // Пакетная вставка по 100 строк (безопасно для больших файлов)
  for (const batch of chunk(rows, 100)) {
    const { error } = await supabase.from('import_questions').insert(batch);
    if (error) throw new Error(error.message);
  }
}

// ── Запросы ────────────────────────────────────────────────────────────
export async function getImportJobs(): Promise<ImportJob[]> {
  const { data, error } = await supabase
    .from('import_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);

  const jobs = data || [];

  // Очистка «зависших» job: если статус активного процесса и прошло >10 минут —
  // значит процесс был прерван (обновление страницы/потеря связи). Помечаем failed.
  const staleThreshold = Date.now() - 10 * 60 * 1000;
  for (const job of jobs) {
    const isActive = ['uploaded', 'parsing', 'processing'].includes(job.status);
    if (isActive && new Date(job.created_at).getTime() < staleThreshold) {
      await supabase
        .from('import_jobs')
        .update({ status: 'failed', error: 'Процесс был прерван (обновление страницы)' })
        .eq('id', job.id);
      job.status = 'failed';
      job.error = 'Процесс был прерван (обновление страницы)';
    }
  }

  return jobs;
}

export async function getImportQuestions(importId: number): Promise<ImportQuestion[]> {
  const { data, error } = await supabase
    .from('import_questions')
    .select('*')
    .eq('import_id', importId)
    .order('source_index', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function updateImportQuestion(
  id: number,
  patch: Partial<ImportQuestion>,
): Promise<void> {
  const { error } = await supabase
    .from('import_questions')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteImportQuestion(id: number): Promise<void> {
  const { error } = await supabase.from('import_questions').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteImportJob(jobId: number): Promise<void> {
  const { error } = await supabase.from('import_jobs').delete().eq('id', jobId);
  if (error) throw new Error(error.message);
}

export async function setJobStatus(jobId: number, status: ImportJob['status'], errorText?: string): Promise<void> {
  await supabase.from('import_jobs').update({ status, error: errorText || null }).eq('id', jobId);
}

// ── Publish (атомарно через RPC — одна транзакция) ────────────────────
export async function publishQuestions(
  importId: number,
  variantId: number,
  questionIds: number[],
  _onProgress?: (done: number, total: number) => void,
): Promise<{ published: number; failed: number }> {
  const { data, error } = await supabase.rpc('publish_import_questions', {
    p_import_id: importId,
    p_variant_id: variantId,
    p_question_ids: questionIds,
  });
  if (error) throw new Error(error.message);
  return data?.[0] || { published: 0, failed: 0 };
}

export function getProviderName(): string {
  return getAIProvider().name;
}
