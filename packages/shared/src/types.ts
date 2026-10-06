export interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  phone: string | null;
  email: string | null;
  gender: 'male' | 'female' | null;
  role: 'student' | 'admin';
  preferred_lang?: 'kz' | 'ru' | null;
  nickname?: string | null;
  is_blocked?: boolean;
  created_at: string;
  updated_at: string;
}

export interface Subject {
  id: number;
  name: string;
}

export interface Variant {
  id: number;
  subject_id: number;
  variant_number: number;
  variant_name: string | null;
  total_score: number;
}

export type QuestionType = 'single' | 'multiple' | 'matching';

// Ответ ученика и ключ вопроса имеют одну форму (SQL 12):
// single — "A"; multiple — ["A","C"]; matching — {"1":"B","2":"D"} (номер утверждения → буква)
export type AnswerValue = string | string[] | Record<string, string>;

// Общий текст контекстных вопросов
export interface Passage {
  id: number;
  variant_id?: number;
  title: string | null;
  text_ru: string;
  text_kz: string | null;
}

export interface Question {
  id: number;
  variant_id: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: 'A' | 'B' | 'C' | 'D';
  score: number;
  order_num: number;
  // question_text / option_* — русский (основной) текст; *_kz — казахский, может отсутствовать (SQL 10)
  question_text_kz?: string | null;
  option_a_kz?: string | null;
  option_b_kz?: string | null;
  option_c_kz?: string | null;
  option_d_kz?: string | null;
  topic?: string | null;
  difficulty?: 1 | 2 | 3 | null;
  image_url?: string | null;
  explanation_ru?: string | null;
  explanation_kz?: string | null;
  // Типы вопросов (SQL 12). Для multiple и matching correct_answer пуст, ключ лежит в correct_key
  question_type?: QuestionType;
  option_e?: string | null;
  option_f?: string | null;
  option_e_kz?: string | null;
  option_f_kz?: string | null;
  correct_key?: string[] | Record<string, string> | null;
  // matching: утверждения слева, которым подбирается буква варианта
  match_left?: { ru: string; kz?: string | null }[] | null;
  passage_id?: number | null;
  passage?: Passage | null;
}

// Вопрос в том виде, в каком его получает ученик: правильный ответ
// приходит с сервера только после сдачи теста.
export type TestQuestion = Omit<Question, 'correct_answer'> & {
  correct_answer?: Question['correct_answer'] | null;
};

export interface TestResult {
  id: number;
  student_id: string;
  variant_id: number;
  score: number;
  total_score: number;
  taken_at: string;
  answers?: Record<string, AnswerValue> | null;
  attempt_id?: number | null;
  // false — попытка сохранена, но в рейтинг не идёт (пересдача или сдано после дедлайна)
  is_ranked?: boolean;
  duration_seconds?: number | null;
  // результат раздела полного ЕНТ (SQL 12)
  exam_session_id?: number | null;
}

// Полный ЕНТ: одна попытка из нескольких предметов с общим таймером
export interface ExamSession {
  id: number;
  student_id: string;
  status: 'open' | 'submitted' | 'expired';
  sections: { subject_id: number; subject: string; variant_id: number; required: boolean }[];
  started_at: string;
  expires_at: string;
  submitted_at: string | null;
  score: number | null;
  total_score: number | null;
}

export interface ExamSection {
  subject_id: number;
  subject: string;
  variant_id: number;
  required: boolean;
  variant_name: string | null;
  variant_number: number;
  questions: TestQuestion[];
}

// Серверная попытка теста: дедлайн задаёт сервер (RPC start_test_attempt, SQL 09)
export interface TestAttempt {
  id: number;
  student_id: string;
  variant_id: number;
  status: 'open' | 'submitted' | 'expired';
  started_at: string;
  expires_at: string;
  submitted_at: string | null;
}

// Вопрос в разборе сданной попытки: с ключом и сохранённым объяснением
export type ReviewQuestion = Question;

export interface User {
  id: string;
  email: string;
}
