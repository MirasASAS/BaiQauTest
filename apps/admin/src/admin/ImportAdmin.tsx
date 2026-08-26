import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  UploadCloud, FileSpreadsheet, FileText, File as FileIcon, FileType,
  Loader2, Trash2, Pencil, Check, X, AlertTriangle, Eye,
  Download, Send, Sparkles,
} from 'lucide-react';
import { useAuth } from '@baiqautest/shared';
import {
  createImportJob, uploadImportFile, runImport, getImportJobs, getImportQuestions,
  updateImportQuestion, deleteImportQuestion, publishQuestions, deleteImportJob,
} from '../lib/import/importService';
import { downloadExcelTemplate } from '../lib/import/parsers';
import { getProviderName } from '../lib/import/importService';
import { getSubjects, getVariantsBySubjectId } from '@baiqautest/shared';
import type { ImportJob, ImportQuestion, ImportProgress } from '../lib/import/types';
import type { Subject, Variant } from '@baiqautest/shared';

export function ImportAdmin() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation('import');
  const language = i18n.language === 'kz' ? 'kz' : 'ru';
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<ImportJob | null>(null);
  const [questions, setQuestions] = useState<ImportQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [sourceLang, setSourceLang] = useState<'ru' | 'kz'>('ru');
  const [targetLang, setTargetLang] = useState<'ru' | 'kz' | 'none'>('kz');
  const [batchSize, setBatchSize] = useState(25);

  const [editing, setEditing] = useState<ImportQuestion | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showPublish, setShowPublish] = useState(false);

  // Publish target
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [publishSubjectId, setPublishSubjectId] = useState<number>(0);
  const [publishVariantId, setPublishVariantId] = useState<number>(0);
  const [publishing, setPublishing] = useState(false);
  const [publishProgress, setPublishProgress] = useState<{ done: number; total: number } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const providerName = getProviderName();

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      setJobs(await getImportJobs());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  // Elapsed-time ticker while processing
  useEffect(() => {
    if (progress && progress.phase !== 'done' && progress.phase !== 'error') {
      setElapsed(0);
      const t = setInterval(() => setElapsed(e => e + 1), 1000);
      return () => clearInterval(t);
    }
    setElapsed(0);
  }, [progress?.phase]);

  const loadQuestions = useCallback(async (job: ImportJob) => {
    setSelectedJob(job);
    try {
      setQuestions(await getImportQuestions(job.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const handleFile = async (file: File) => {
    if (!user) return;
    setError(null);

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!['xlsx', 'csv', 'docx', 'pdf'].includes(ext)) {
      setError(`Неподдерживаемый формат: .${ext}. Допустимые: .xlsx .csv .docx .pdf`);
      return;
    }

    setProgress({ phase: 'upload', processed: 0, total: 0, message: t('uploading') });
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const job = await createImportJob(file, user.id, {
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
        batchSize,
      });
      await uploadImportFile(job.id, file, user.id);
      await runImport(job.id, file, { sourceLanguage: sourceLang, targetLanguage: targetLang, batchSize }, p => {
        setProgress(p);
      }, controller.signal);
      await loadJobs();
      const fresh = await getImportJobs();
      const created = fresh.find(j => j.id === job.id);
      if (created) await loadQuestions(created);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'Отменено') {
        setProgress(null);
        await loadJobs();
        return;
      }
      setError(msg);
      setProgress(null);
    }
    abortRef.current = null;
  };

  const cancelImport = () => {
    abortRef.current?.abort();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const bulkApprove = async () => {
    for (const id of selectedIds) {
      await updateImportQuestion(id, { status: 'approved', needs_review: false });
    }
    setSelectedIds(new Set());
    if (selectedJob) loadQuestions(selectedJob);
  };

  const bulkDelete = async () => {
    for (const id of selectedIds) {
      await deleteImportQuestion(id);
    }
    setSelectedIds(new Set());
    if (selectedJob) loadQuestions(selectedJob);
  };

  const loadPublishData = async () => {
    try {
      setSubjects(await getSubjects());
    } catch { /* ignore */ }
  };

  const openPublish = () => {
    setShowPublish(true);
    loadPublishData();
  };

  const onPublishSubject = async (id: number) => {
    setPublishSubjectId(id);
    setPublishVariantId(0);
    setVariants(id ? await getVariantsBySubjectId(id) : []);
  };

  const confirmPublish = async () => {
    if (!selectedJob || !publishVariantId) return;
    setPublishing(true);
    setPublishProgress({ done: 0, total: questions.length });
    try {
      const ids = questions.filter(q => q.status !== 'review' && !q.needs_review).map(q => q.id);
      if (ids.length === 0) {
        setError(t('noPublishable'));
        setPublishing(false);
        return;
      }
      const result = await publishQuestions(selectedJob.id, publishVariantId, ids);
      await loadJobs();
      await loadQuestions(selectedJob);
      setShowPublish(false);
      setError(result.failed > 0 ? `Опубликовано ${result.published}, ${result.failed} не опубликовано` : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setPublishing(false);
    setPublishProgress(null);
  };

  const stats = {
    total: questions.length,
    valid: questions.filter(q => !q.needs_review).length,
    review: questions.filter(q => q.needs_review).length,
    duplicates: questions.filter(q => q.is_duplicate).length,
  };

  const selectedCount = selectedIds.size;

  return (
    <div className="space-y-6">
      {/* AI provider status */}
      <div className="card p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          <Sparkles className="w-4 h-4 text-violet-500" />
          <span className="text-gray-700 font-medium">{t('aiProvider')}:</span>
          <span className="font-bold text-gray-900">{providerName}</span>
        </div>
        {providerName === 'Mock' && (
          <span className="text-xs px-3 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg">
            {language === 'kz' ? 'AI API қосылмаған — Demo/Mock режимі' : 'AI API не подключён — Demo/Mock режим'}
          </span>
        )}
      </div>

      {/* Upload zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`card p-8 text-center transition-all ${dragOver ? 'border-[#2563eb] bg-blue-50' : ''}`}
      >
        <div className="mx-auto w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
          <UploadCloud className="w-8 h-8 text-[#2563eb]" />
        </div>
        <h3 className="font-bold text-gray-900 text-lg mb-1">{t('dropTitle')}</h3>
        <p className="text-gray-500 text-sm mb-4">
          .xlsx .csv .docx .pdf • {t('maxSize')}: 15 MB
        </p>

        {/* Language options */}
        <div className="flex flex-wrap items-center justify-center gap-3 mb-5 text-sm">
          <label className="flex items-center gap-2 text-gray-600">
            {t('sourceLang')}:
            <select value={sourceLang} onChange={e => setSourceLang(e.target.value as 'ru' | 'kz')}
              className="px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20">
              <option value="ru">Русский</option>
              <option value="kz">Қазақша</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-gray-600">
            {t('targetLang')}:
            <select value={targetLang} onChange={e => setTargetLang(e.target.value as 'ru' | 'kz' | 'none')}
              className="px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20">
              <option value="kz">Қазақша</option>
              <option value="ru">Русский</option>
              <option value="none">{t('noTranslation')}</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-gray-600">
            {t('batchSize')}:
            <select value={batchSize} onChange={e => setBatchSize(Number(e.target.value))}
              className="px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20">
              {[10, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>

        <button
          onClick={() => inputRef.current?.click()}
          disabled={!!progress && progress.phase !== 'error'}
          className="px-6 py-3 bg-[#2563eb] hover:bg-[#1e3a8a] text-white font-medium rounded-xl transition-all disabled:opacity-50"
        >
          {t('chooseFile')}
        </button>
        <button
          onClick={downloadExcelTemplate}
          className="ml-2 px-5 py-3 bg-white border border-gray-200 hover:border-[#2563eb] text-gray-600 hover:text-[#2563eb] font-medium rounded-xl transition-all"
        >
          <Download className="w-4 h-4 inline mr-1.5 -mt-0.5" />
          {t('template')}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.csv,.docx,.pdf"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
        />
      </div>

      {/* Progress */}
      {progress && progress.phase !== 'done' && progress.phase !== 'error' && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-2 text-sm">
            <span className="text-gray-600">{t(progress.phase)}</span>
            <div className="flex items-center gap-3">
              {elapsed > 0 && (
                <span className="text-xs text-gray-400 tabular-nums">
                  ⏱ {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
                </span>
              )}
              <span className="font-semibold text-gray-900">{progress.message}</span>
            </div>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#2563eb] rounded-full transition-all duration-300"
              style={{ width: `${progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 15}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-3">
            {progress.total > 0 && (
              <p className="text-xs text-gray-400">{Math.round((progress.processed / progress.total) * 100)}%</p>
            )}
            <button
              onClick={cancelImport}
              className="ml-auto px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-all"
            >
              {language === 'kz' ? 'Болдырмау' : 'Отмена'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Selected job preview */}
      {selectedJob && questions.length === 0 && selectedJob.status === 'needs_ocr' && (
        <div className="card p-6 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-100 mb-4">
            <AlertTriangle className="w-7 h-7 text-amber-600" />
          </div>
          <h3 className="font-bold text-gray-900 mb-2">{selectedJob.file_name}</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            {language === 'kz'
              ? 'Бұл PDF файл суреттен тұрады. Мәтіндік PDF немесе XLSX/CSV файлын жүктеңіз.'
              : 'Этот PDF-файл состоит из изображений. Загрузите текстовый PDF или XLSX/CSV файл.'}
          </p>
          <button onClick={() => setSelectedJob(null)} className="mt-4 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-xl transition-all">
            {language === 'kz' ? 'Жабу' : 'Закрыть'}
          </button>
        </div>
      )}
      {selectedJob && questions.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 bg-slate-50 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-bold text-gray-900">{selectedJob.file_name}</h3>
              <div className="flex items-center gap-3 text-sm text-gray-500 mt-1 flex-wrap">
                <span className="text-[#2563eb] font-medium">{stats.total} {t('questions')}</span>
                <span className="text-green-600">{t('valid')}: {stats.valid}</span>
                <span className="text-amber-600">{t('needsReview')}: {stats.review}</span>
                {stats.duplicates > 0 && <span className="text-red-600">{t('duplicates')}: {stats.duplicates}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selectedCount > 0 && (
                <>
                  <button onClick={bulkApprove} className="px-3 py-2 bg-green-100 hover:bg-green-200 text-green-700 text-sm font-medium rounded-xl transition-all">
                    <Check className="w-4 h-4 inline mr-1 -mt-0.5" /> {t('approve')} ({selectedCount})
                  </button>
                  <button onClick={bulkDelete} className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium rounded-xl transition-all">
                    <Trash2 className="w-4 h-4 inline mr-1 -mt-0.5" /> {t('delete')}
                  </button>
                </>
              )}
              <button onClick={openPublish} className="px-4 py-2 bg-[#2563eb] hover:bg-[#1e3a8a] text-white text-sm font-medium rounded-xl transition-all">
                <Send className="w-4 h-4 inline mr-1 -mt-0.5" /> {t('publish')}
              </button>
            </div>
          </div>

          {/* Questions list */}
          <div className="divide-y divide-gray-100 max-h-[560px] overflow-y-auto">
            {questions.map((q, i) => {
              const opts = (['A', 'B', 'C', 'D'] as const).map(k => q[`option_${k.toLowerCase()}_ru` as keyof ImportQuestion] as string);
              return (
                <div key={q.id} className={`p-4 hover:bg-gray-50/60 transition-colors ${q.needs_review ? 'bg-amber-50/40' : ''}`}>
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(q.id)}
                      onChange={() => toggleSelect(q.id)}
                      className="mt-1.5 w-4 h-4 accent-[#2563eb]"
                      aria-label={`select ${i + 1}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs font-bold text-gray-400">#{i + 1}</span>
                        {q.needs_review && (
                          <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded-lg font-medium">{t('needsReview')}</span>
                        )}
                        {q.is_duplicate && (
                          <span className="text-[10px] px-2 py-0.5 bg-red-100 text-red-600 rounded-lg font-medium">{t('duplicate')}</span>
                        )}
                        {q.status === 'published' && (
                          <span className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 rounded-lg font-medium">{t('published')}</span>
                        )}
                      </div>
                      <p className="font-medium text-gray-900 text-sm">{q.question_ru || q.question_kz}</p>
                      {q.question_ru && q.question_kz && q.question_ru !== q.question_kz && (
                        <p className="text-gray-500 text-sm mt-0.5">{q.question_kz}</p>
                      )}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {opts.map((opt, oi) => (
                          <span key={oi} className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-2 py-1">
                            <span className="font-bold text-[#2563eb]">{['A', 'B', 'C', 'D'][oi]}</span>
                            {opt || '—'}
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                        <span className="text-green-700 font-medium">{t('correct')}: {q.correct_answer || '—'}</span>
                        <span>{t('confidence')}: {Math.round((q.confidence || 0) * 100)}%</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => setEditing(q)} className="p-2 text-gray-400 hover:text-[#2563eb] hover:bg-blue-50 rounded-lg transition-all" title={t('edit')}>
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteImportQuestion(q.id).then(() => selectedJob && loadQuestions(selectedJob))}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" title={t('delete')}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Import history */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 bg-slate-50 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">{t('history')}</h3>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-[#2563eb]" /></div>
        ) : jobs.length === 0 ? (
          <div className="p-10 text-center text-gray-500 text-sm">{t('noImports')}</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {jobs.map(job => {
              const Icon = job.file_type === 'xlsx' ? FileSpreadsheet : job.file_type === 'csv' ? FileText : job.file_type === 'pdf' ? FileType : FileIcon;
              return (
                <div key={job.id} className="p-4 flex items-center gap-3 hover:bg-gray-50/60 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-[#2563eb]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{job.file_name}</p>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5 flex-wrap">
                      <span>{job.total_questions} {t('questions')}</span>
                      <span className={`px-2 py-0.5 rounded-lg font-medium ${
                        job.status === 'published' ? 'bg-green-100 text-green-700'
                        : job.status === 'failed' || job.status === 'needs_ocr' ? 'bg-red-100 text-red-600'
                        : job.status === 'review' ? 'bg-amber-100 text-amber-700'
                        : 'bg-blue-100 text-blue-600'
                      }`}>{t(`status.${job.status}`)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => loadQuestions(job)} className="p-2 text-gray-400 hover:text-[#2563eb] hover:bg-blue-50 rounded-lg transition-all" title={t('view')}>
                      <Eye className="w-4 h-4" />
                    </button>
                    <button onClick={() => { if (confirm(language === 'kz' ? 'Бұл импортты жою керек пе?' : 'Удалить этот импорт?')) deleteImportJob(job.id).then(loadJobs); }}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" title={t('delete')}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editing && (
        <EditQuestionModal question={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); if (selectedJob) loadQuestions(selectedJob); }} />
      )}

      {/* Publish modal */}
      {showPublish && selectedJob && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !publishing && setShowPublish(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-4">{t('publishTitle')}</h3>
            <p className="text-gray-500 text-sm mb-4">
              {t('publishText', { total: stats.total, valid: stats.valid, review: stats.review })}
            </p>

            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('subject')}</label>
            <select
              value={publishSubjectId}
              onChange={e => onPublishSubject(Number(e.target.value))}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20"
            >
              <option value={0}>{t('selectSubject')}</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>

            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('variant')}</label>
            <select
              value={publishVariantId}
              onChange={e => setPublishVariantId(Number(e.target.value))}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm mb-5 focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20"
            >
              <option value={0}>{t('selectVariant')}</option>
              {variants.map(v => <option key={v.id} value={v.id}>{v.variant_name || `${v.variant_number}-нұсқа`}</option>)}
            </select>

            {publishing && publishProgress && (
              <div className="mb-4">
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-[#2563eb] transition-all" style={{ width: `${(publishProgress.done / Math.max(1, publishProgress.total)) * 100}%` }} />
                </div>
                <p className="text-xs text-gray-400 mt-1">{publishProgress.done} / {publishProgress.total}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setShowPublish(false)} disabled={publishing}
                className="flex-1 py-2.5 border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium rounded-xl transition-all disabled:opacity-50">
                {t('cancel')}
              </button>
              <button onClick={confirmPublish} disabled={publishing || !publishVariantId}
                className="flex-1 py-2.5 bg-[#2563eb] hover:bg-[#1e3a8a] text-white font-medium rounded-xl transition-all disabled:opacity-50">
                {publishing ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t('confirmPublish')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Edit question modal ────────────────────────────────────────────────
function EditQuestionModal({ question, onClose, onSaved }: {
  question: ImportQuestion;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation('import');
  const [form, setForm] = useState({
    question_ru: question.question_ru || '',
    question_kz: question.question_kz || '',
    options_ru: { A: question.option_a_ru || '', B: question.option_b_ru || '', C: question.option_c_ru || '', D: question.option_d_ru || '' },
    options_kz: { A: question.option_a_kz || '', B: question.option_b_kz || '', C: question.option_c_kz || '', D: question.option_d_kz || '' },
    correct_answer: question.correct_answer || 'A',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await updateImportQuestion(question.id, {
      question_ru: form.question_ru,
      question_kz: form.question_kz,
      option_a_ru: form.options_ru.A, option_b_ru: form.options_ru.B, option_c_ru: form.options_ru.C, option_d_ru: form.options_ru.D,
      option_a_kz: form.options_kz.A, option_b_kz: form.options_kz.B, option_c_kz: form.options_kz.C, option_d_kz: form.options_kz.D,
      correct_answer: form.correct_answer as 'A' | 'B' | 'C' | 'D',
      needs_review: false,
      status: 'draft',
    });
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">{t('editQuestion')}</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <label className="block text-sm font-medium text-gray-700 mb-1">{t('questionRu')}</label>
        <textarea value={form.question_ru} onChange={e => setForm({ ...form, question_ru: e.target.value })}
          rows={2} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20" />

        <label className="block text-sm font-medium text-gray-700 mb-1">{t('questionKz')}</label>
        <textarea value={form.question_kz} onChange={e => setForm({ ...form, question_kz: e.target.value })}
          rows={2} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20" />

        <p className="text-xs font-bold text-gray-400 uppercase mb-1.5">RU</p>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {(['A', 'B', 'C', 'D'] as const).map(k => (
            <input key={k} placeholder={`${k})`} value={form.options_ru[k]}
              onChange={e => setForm({ ...form, options_ru: { ...form.options_ru, [k]: e.target.value } })}
              className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20" />
          ))}
        </div>

        <p className="text-xs font-bold text-gray-400 uppercase mb-1.5">KZ</p>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {(['A', 'B', 'C', 'D'] as const).map(k => (
            <input key={k} placeholder={`${k})`} value={form.options_kz[k]}
              onChange={e => setForm({ ...form, options_kz: { ...form.options_kz, [k]: e.target.value } })}
              className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20" />
          ))}
        </div>

        <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('correctAnswer')}</label>
        <div className="flex gap-2 mb-5">
          {(['A', 'B', 'C', 'D'] as const).map(k => (
            <button key={k} type="button" onClick={() => setForm({ ...form, correct_answer: k })}
              className={`flex-1 py-2.5 rounded-xl border-2 font-bold transition-all ${
                form.correct_answer === k ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}>
              {k}
            </button>
          ))}
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium rounded-xl transition-all">{t('cancel')}</button>
          <button onClick={save} disabled={saving}
            className="flex-1 py-2.5 bg-[#2563eb] hover:bg-[#1e3a8a] text-white font-medium rounded-xl transition-all disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t('save')}
          </button>
        </div>
      </div>
    </div>
  );
}
