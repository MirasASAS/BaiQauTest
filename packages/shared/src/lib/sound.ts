// Звуковые эффекты для теста через Web Audio API (без аудиофайлов).
// Флаг включения хранится в localStorage: exam_sound === '1'.

function isSoundEnabled(): boolean {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem('exam_sound') === '1';
  } catch {
    return false;
  }
}

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

function tone(freq: number, start: number, duration: number, type: OscillatorType = 'sine', gain = 0.15) {
  const audioCtx = getCtx();
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime + start);
  g.gain.setValueAtTime(0.0001, audioCtx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, audioCtx.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + start + duration);
  osc.connect(g);
  g.connect(audioCtx.destination);
  osc.start(audioCtx.currentTime + start);
  osc.stop(audioCtx.currentTime + start + duration + 0.05);
}

// Два коротких восходящих тона — правильный ответ
export function playCorrect() {
  if (!isSoundEnabled()) return;
  tone(660, 0, 0.12, 'sine');
  tone(880, 0.1, 0.18, 'sine');
}

// Низкий одиночный тон — неверный ответ
export function playWrong() {
  if (!isSoundEnabled()) return;
  tone(220, 0, 0.2, 'sawtooth', 0.08);
}

// Торжественный финальный аккорд — завершение теста
export function playFinish() {
  if (!isSoundEnabled()) return;
  tone(523.25, 0, 0.25, 'sine');
  tone(659.25, 0.1, 0.25, 'sine');
  tone(783.99, 0.2, 0.4, 'sine');
}
