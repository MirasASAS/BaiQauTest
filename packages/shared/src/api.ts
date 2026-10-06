import { supabase } from './supabase';
import type { Question } from './types';

function toError(err: { message?: string; code?: string; details?: string } | null): Error {
  if (err?.message) return new Error(err.message);
  if (err?.code) return new Error(err.code);
  return new Error('Запрос не удался');
}

// ── Admin ────────────────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  role: string;
  is_blocked: boolean;
  created_at: string;
  tests_count: number;
}

export interface PlatformStats {
  total_users: number;
  total_tests: number;
  total_questions: number;
  total_variants: number;
  top_subject: string | null;
  avg_score: number | null;
}

export async function adminListUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase.rpc('admin_list_users');
  if (error) throw toError(error);
  return data || [];
}

export async function adminSetUserRole(userId: string, role: 'student' | 'admin'): Promise<void> {
  const { error } = await supabase.rpc('admin_set_user_role', { p_user: userId, p_role: role });
  if (error) throw toError(error);
}

export async function adminToggleBlock(userId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_toggle_block', { p_user: userId });
  if (error) throw toError(error);
}

export async function adminPlatformStats(): Promise<PlatformStats | null> {
  const { data, error } = await supabase.rpc('admin_platform_stats');
  if (error) throw toError(error);
  return data?.[0] || null;
}

// ── Leaderboard ──────────────────────────────────────────────────────

export interface LeaderboardEntry {
  user_id: string;
  nickname: string;
  tests_count: number;
  avg_percent: number;
  best_percent: number;
  total_points: number;
}

export type LeaderboardPeriod = 'all' | 'week';

// Рейтинг считается по сумме баллов зачётных (первых, сданных вовремя) попыток
export async function getLeaderboard(period: LeaderboardPeriod = 'all'): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase.rpc('get_leaderboard', { p_period: period });
  if (error) throw toError(error);
  return data || [];
}

export interface MyRank {
  rank: number;
  user_id: string;
  nickname: string;
  avg_percent: number;
  tests_count: number;
  total_points: number;
}

export async function getMyRank(period: LeaderboardPeriod = 'all'): Promise<MyRank | null> {
  const { data, error } = await supabase.rpc('get_my_rank', { p_period: period });
  if (error) throw toError(error);
  return data?.[0] || null;
}

// ── Topic stats ──────────────────────────────────────────────────────

export interface TopicStat {
  subject: string;
  // null — вопросы без темы
  topic: string | null;
  total: number;
  correct: number;
}

// Статистика ученика по предметам и темам (по первой попытке каждого варианта)
export async function getMyTopicStats(): Promise<TopicStat[]> {
  const { data, error } = await supabase.rpc('get_my_topic_stats');
  if (error) throw toError(error);
  return data || [];
}

// ── Mistakes practice («работа над ошибками», SQL 11) ────────────────

// Вопрос, на который ученик ошибся в первой попытке варианта и ещё не исправил в тренировке
export type MistakeQuestion = Question & {
  subject: string;
  // null — в попытке вопрос был пропущен
  my_answer: string | null;
};

export interface MistakesSummary {
  // total и by_subject считаются по всем предметам, questions — с учётом фильтра
  total: number;
  by_subject: { subject_id: number; subject: string; count: number }[];
  questions: MistakeQuestion[];
}

export async function getMyMistakes(subjectId: number | null = null, limit = 20): Promise<MistakesSummary> {
  const { data, error } = await supabase.rpc('get_my_mistakes', { p_subject_id: subjectId, p_limit: limit });
  if (error) throw toError(error);
  return {
    total: data?.total ?? 0,
    by_subject: data?.by_subject || [],
    questions: data?.questions || [],
  };
}

// Ответ в тренировке проверяет сервер; верный ответ убирает вопрос из списка ошибок
export async function recordMistakePractice(questionId: number, answer: string): Promise<{ is_correct: boolean; correct_answer: string }> {
  const { data, error } = await supabase.rpc('record_mistake_practice', { p_question_id: questionId, p_answer: answer });
  if (error) throw toError(error);
  return data;
}

// ── Gamification ─────────────────────────────────────────────────────

export async function getUserStreak(): Promise<number> {
  const { data, error } = await supabase.rpc('get_user_streak');
  if (error) throw toError(error);
  return data ?? 0;
}

export async function getUserBadges(): Promise<string[]> {
  const { data, error } = await supabase.rpc('get_user_badges');
  if (error) throw toError(error);
  return data || [];
}

export const BADGE_META: Record<string, { label: { kz: string; ru: string }; icon: string; color: string }> = {
  first_test: {
    label: { kz: 'Алғашқы тест', ru: 'Первый тест' },
    icon: '🎯',
    color: 'bg-blue-50 text-blue-600 border-blue-100',
  },
  ten_tests: {
    label: { kz: '10 тест тапсырушы', ru: '10 пройденных тестов' },
    icon: '🏅',
    color: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  },
  twenty_five_tests: {
    label: { kz: '25 тест тапсырушы', ru: '25 пройденных тестов' },
    icon: '🥇',
    color: 'bg-amber-50 text-amber-600 border-amber-100',
  },
  high_score: {
    label: { kz: '90%+ балл алушы', ru: 'Набравший 90%+' },
    icon: '🏆',
    color: 'bg-violet-50 text-violet-600 border-violet-100',
  },
};
