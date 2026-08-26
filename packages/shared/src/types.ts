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
}

export interface TestResult {
  id: number;
  student_id: string;
  variant_id: number;
  score: number;
  total_score: number;
  taken_at: string;
  answers?: Record<string, string> | null;
}

export interface User {
  id: string;
  email: string;
}
