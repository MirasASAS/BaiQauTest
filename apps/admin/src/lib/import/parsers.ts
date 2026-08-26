import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import type { ParsedQuestion, ParseResult, ImportFileType } from './types';

// pdfjs-dist требует браузерного DOMMatrix; загружаем лениво
type PdfJsModule = typeof import('pdfjs-dist');
let _pdfjs: PdfJsModule | null = null;
async function getPdfjs(): Promise<PdfJsModule> {
  if (!_pdfjs) {
    const mod = await import('pdfjs-dist');
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    mod.GlobalWorkerOptions.workerSrc = worker.default;
    _pdfjs = mod;
  }
  return _pdfjs;
}

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB

export function checkFileSize(size: number): string | null {
  if (size > MAX_FILE_SIZE) {
    return 'Файл слишком большой (макс. 15 MB)';
  }
  return null;
}

// ── CSV ────────────────────────────────────────────────────────────────
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',' || ch === ';') {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[\s_-]/g, '').trim();
}

const HEADER_MAP: Record<string, string> = {
  question: 'question',
  'вопрос': 'question',
  'сұрақ': 'question',
  optiona: 'option_a',
  'вариантa': 'option_a',
  optionb: 'option_b',
  optionc: 'option_c',
  optiond: 'option_d',
  correctanswer: 'correct_answer',
  'дұрысжауап': 'correct_answer',
  'жауабы': 'correct_answer',
  answer: 'correct_answer',
};

// Обработка структурированных строк (header: question, option_a..d, correct_answer)
export function parseStructured(rows: string[][]): { questions: ParsedQuestion[]; errors: string[] } {
  const errors: string[] = [];
  if (rows.length === 0) return { questions: [], errors: ['Файл пустой'] };

  const header = rows[0].map(normalizeHeader);
  const colMap: Record<string, number> = {};
  header.forEach((h, i) => {
    const mapped = HEADER_MAP[h];
    if (mapped && !(mapped in colMap)) colMap[mapped] = i;
  });

  const required = ['question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_answer'];
  const missing = required.filter(r => !(r in colMap));
  if (missing.length > 0) {
    return { questions: [], errors: [`Отсутствуют обязательные колонки: ${missing.join(', ')}`] };
  }

  const questions: ParsedQuestion[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const get = (k: string) => (colMap[k] !== undefined ? (r[colMap[k]] || '').trim() : '');
    const question = get('question');
    if (!question) continue;

    const options = {
      A: get('option_a'),
      B: get('option_b'),
      C: get('option_c'),
      D: get('option_d'),
    };
    const ansRaw = get('correct_answer').toUpperCase().trim();
    const correct = (['A', 'B', 'C', 'D'] as const).find(x => x === ansRaw) || null;

    const key = question.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) {
      errors.push(`Строка ${i + 1}: дубликат вопроса «${question.slice(0, 40)}…»`);
      continue;
    }
    seen.add(key);

    questions.push({
      question,
      options,
      correct_answer: correct,
      source_index: i,
    });
  }

  if (questions.length === 0) errors.push('Не найдено ни одного вопроса');
  return { questions, errors };
}

// ── Свободный формат (DOCX/PDF текст) ─────────────────────────────────
const LETTERS = 'a-dA-Dа-яА-ЯәӘғҒқҚңҢөӨұҰүҮһҺ';
const OPTION_LETTER_MAP: Record<string, string> = {
  A: 'A', B: 'B', C: 'C', D: 'D',
  А: 'A', Ә: 'B', Б: 'C', В: 'D',
};

export function parseFreeform(text: string): { questions: ParsedQuestion[]; errors: string[] } {
  const errors: string[] = [];
  const questions: ParsedQuestion[] = [];
  if (!text || text.trim().length === 0) {
    return { questions: [], errors: ['Файл пустой'] };
  }

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  let current: { q: string; opts: Partial<Record<'A'|'B'|'C'|'D', string>>; ans: 'A'|'B'|'C'|'D'|null; line: number } | null = null;
  let idx = 0;

  const flush = () => {
    if (current) {
      const opts = { A: '', B: '', C: '', D: '' };
      let complete = true;
      (['A', 'B', 'C', 'D'] as const).forEach(k => {
        opts[k] = (current!.opts[k] || '').trim();
        if (!opts[k]) complete = false;
      });
      if (current.q) {
        questions.push({
          question: current.q,
          options: opts,
          correct_answer: current.ans,
          source_index: current.line,
        });
        if (!complete) errors.push(`Вопрос «${current.q.slice(0, 40)}…» (строка ${current.line}): не все варианты найдены`);
      }
      current = null;
    }
  };

  for (const line of lines) {
    // Строка-ответ: "Жауабы: B" / "Ответ: B" / "Correct: A"
    const ansMatch = line.match(new RegExp(`^(?:жауабы|дұрыс\\s+жауап|ответ|правильный\\s+ответ|answer|correct)\\s*[::-]?\\s*([${LETTERS}])$`, 'i'));
    if (ansMatch && current) {
      const letter = ansMatch[1].toUpperCase();
      current.ans = OPTION_LETTER_MAP[letter] as 'A'|'B'|'C'|'D' || null;
      flush();
      continue;
    }

    // Вариант: "A) text", "А. text", "1) text"
    const optMatch = line.match(new RegExp(`^([${LETTERS}])\\s*[).]\\s*(.+)$`, 'i'));
    if (optMatch && current) {
      const letter = OPTION_LETTER_MAP[optMatch[1].toUpperCase()];
      if (letter && !current.opts[letter as 'A']) {
        current.opts[letter as 'A'] = optMatch[2].trim();
        continue;
      }
    }

    // Нумерованный вопрос: "1. Question" / "1) Question"
    const qMatch = line.match(/^\d{1,3}\s*[).]\s*(.+)$/);
    if (qMatch) {
      flush();
      idx++;
      current = { q: qMatch[1].trim(), opts: {}, ans: null, line: idx };
      continue;
    }

    if (current) {
      current.q += ' ' + line;
    }
  }
  flush();

  if (questions.length === 0) {
    errors.push('Не удалось обнаружить вопросы в тексте. Проверьте формат файла.');
  }
  return { questions, errors };
}

// ── Excel ─────────────────────────────────────────────────────────────
export function parseExcel(arrayBuffer: ArrayBuffer): { questions: ParsedQuestion[]; errors: string[] } {
  try {
    const wb = XLSX.read(arrayBuffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return { questions: [], errors: ['В файле нет листов'] };
    const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
    return parseStructured(rows.map(r => (Array.isArray(r) ? r : [String(r)])));
  } catch {
    return { questions: [], errors: ['Файл Excel повреждён или не читается'] };
  }
}

// ── DOCX ──────────────────────────────────────────────────────────────
export async function parseDocx(arrayBuffer: ArrayBuffer): Promise<{ questions: ParsedQuestion[]; errors: string[] }> {
  try {
    const result = await mammoth.extractRawText({ arrayBuffer });
    return parseFreeform(result.value);
  } catch {
    return { questions: [], errors: ['Не удалось прочитать DOCX-файл'] };
  }
}

// ── PDF ───────────────────────────────────────────────────────────────
export async function parsePdf(arrayBuffer: ArrayBuffer): Promise<{
  questions: ParsedQuestion[];
  errors: string[];
  needsOcr: boolean;
}> {
  try {
    const pdfjs = await getPdfjs();
    const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    let text = '';
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      text += (content.items as Array<{ str?: string }>)
        .map((item: { str?: string }) => item.str || '')
        .join(' ')
        .replace(/\s+/g, ' ') + '\n';
    }
    const trimmed = text.trim();
    if (trimmed.length < 50) {
      return { questions: [], errors: ['PDF мәтінін оқу мүмкін болмады. Бұл scanned PDF болуы мүмкін. OCR қажет.'], needsOcr: true };
    }
    const parsed = parseFreeform(trimmed);
    return { ...parsed, needsOcr: false };
  } catch {
    return {
      questions: [],
      errors: ['PDF мәтінін оқу мүмкін болмады. Бұл scanned PDF болуы мүмкін. OCR қажет.'],
      needsOcr: true,
    };
  }
}

// ── Диспетчер ─────────────────────────────────────────────────────────
export async function parseImportFile(file: File): Promise<ParseResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() as ImportFileType;
  const sizeErr = checkFileSize(file.size);
  if (sizeErr) return { questions: [], errors: [sizeErr], format: 'structured' };

  const arrayBuffer = await file.arrayBuffer();

  switch (ext) {
    case 'xlsx': {
      const r = parseExcel(arrayBuffer);
      return { ...r, format: r.errors.length > 0 && r.questions.length === 0 ? 'structured' : 'structured' };
    }
    case 'csv': {
      const text = new TextDecoder('utf-8').decode(arrayBuffer);
      const rows = parseCsv(text);
      const r = parseStructured(rows);
      return { ...r, format: 'structured' };
    }
    case 'docx': {
      const r = await parseDocx(arrayBuffer);
      return { ...r, format: r.errors.length > 0 && r.questions.length === 0 ? 'freeform' : 'freeform' };
    }
    case 'pdf': {
      const r = await parsePdf(arrayBuffer);
      return { ...r, format: r.needsOcr ? 'needs_ocr' : 'freeform' };
    }
    default:
      return { questions: [], errors: [`Неподдерживаемый формат: .${ext}`], format: 'structured' };
  }
}

// ── Excel template ────────────────────────────────────────────────────
export function downloadExcelTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_answer'],
    ['Какой символ у кислорода?', 'K', 'O', 'C', 'H', 'B'],
  ]);
  ws['!cols'] = [{ wch: 50 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 15 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Questions');
  XLSX.writeFile(wb, 'test-import-template.xlsx');
}
