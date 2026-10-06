// ── Import system types ────────────────────────────────────────────────

export type ImportFileType = 'xlsx' | 'csv' | 'docx' | 'pdf';

export type ImportStatus =
  | 'uploaded'
  | 'parsing'
  | 'processing'
  | 'review'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'needs_ocr';

export type ImportQuestionStatus = 'draft' | 'review' | 'approved' | 'published' | 'rejected';

export interface ImportJob {
  id: number;
  file_name: string;
  file_path: string | null;
  file_type: ImportFileType;
  file_size: number;
  status: ImportStatus;
  source_language: 'ru' | 'kz';
  target_language: 'ru' | 'kz' | 'none';
  total_questions: number;
  processed_questions: number;
  error_count: number;
  batch_size: number;
  error: string | null;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface ImportQuestion {
  id: number;
  import_id: number;
  question_ru: string | null;
  question_kz: string | null;
  option_a_ru: string | null;
  option_b_ru: string | null;
  option_c_ru: string | null;
  option_d_ru: string | null;
  option_a_kz: string | null;
  option_b_kz: string | null;
  option_c_kz: string | null;
  option_d_kz: string | null;
  correct_answer: 'A' | 'B' | 'C' | 'D' | null;
  topic?: string | null;
  confidence: number;
  needs_review: boolean;
  is_duplicate: boolean;
  status: ImportQuestionStatus;
  source_index: number;
  created_at: string;
  updated_at: string;
}

// Сырой вопрос, извлечённый из файла (до нормализации)
export interface ParsedQuestion {
  question: string;
  options: { A: string; B: string; C: string; D: string };
  correct_answer: 'A' | 'B' | 'C' | 'D' | null;
  source_index: number;
}

// Вопрос после AI-обработки (извлекается/переводится)
export interface ProcessedQuestion {
  question_ru: string;
  question_kz: string;
  options_ru: { A: string; B: string; C: string; D: string };
  options_kz: { A: string; B: string; C: string; D: string };
  correct_answer: 'A' | 'B' | 'C' | 'D' | null;
  // Тема вопроса, которую определил AI (2–4 слова на русском); null — не определена
  topic?: string | null;
  confidence: number;
  needs_review: boolean;
  is_duplicate: boolean;
  source_index: number;
}

// Варианты ответов в сыром ответе AI (может не хватать части полей)
export interface AIOptions {
  A?: string;
  B?: string;
  C?: string;
  D?: string;
}

// Один вопрос в сыром JSON-ответе AI-провайдера
export interface AIQuestionResult {
  question_ru?: string;
  question_kz?: string;
  options_ru?: AIOptions;
  options_kz?: AIOptions;
  correct_answer?: 'A' | 'B' | 'C' | 'D';
  topic?: string;
  confidence?: number;
  needs_review?: boolean;
  is_duplicate?: boolean;
  source_index?: number;
}

// Обёртка ответа AI-провайдера
export interface AIResponseEnvelope {
  questions: AIQuestionResult[];
}

// Результат парсинга файла
export interface ParseResult {
  questions: ParsedQuestion[];
  errors: string[];
  format: 'structured' | 'freeform' | 'needs_ocr';
}

export interface ImportOptions {
  sourceLanguage: 'ru' | 'kz';
  targetLanguage: 'ru' | 'kz' | 'none';
  batchSize: number;
}

export interface ImportProgress {
  phase: 'upload' | 'parse' | 'process' | 'done' | 'error';
  processed: number;
  total: number;
  message: string;
}

export interface ValidationIssue {
  index: number;
  message: string;
}
