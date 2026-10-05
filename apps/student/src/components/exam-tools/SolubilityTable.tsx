import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useLanguage } from '@baiqautest/shared';
import {
  solubilityAcids,
  solubilityAnions,
  solubilityBases,
  solubilityCations,
  type SolubilityValue,
} from './solubilityData';

const valueStyles: Record<SolubilityValue, string> = {
  R: 'bg-green-100 text-green-700',
  M: 'bg-yellow-100 text-yellow-700',
  N: 'bg-red-100 text-red-600',
  D: 'bg-gray-100 text-gray-400',
};

const valueLetters: Record<SolubilityValue, string> = {
  R: 'Р',
  M: 'М',
  N: 'Н',
  D: '—',
};

function ValueBadge({ value }: { value: SolubilityValue }) {
  return (
    <span
      className={`inline-flex items-center justify-center min-w-[1.75rem] px-1 py-0.5 rounded-md text-xs font-bold ${valueStyles[value]}`}
    >
      {valueLetters[value]}
    </span>
  );
}

function SubstanceChip({ formula, name, value }: { formula: string; name: string; value: SolubilityValue }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-xl bg-gray-50">
      <span className="text-sm font-semibold text-gray-900">{formula}</span>
      <span className="text-xs text-gray-500">{name}</span>
      <ValueBadge value={value} />
    </div>
  );
}

export function SolubilityTable({ onClose }: { onClose: () => void }) {
  const { t, language } = useLanguage();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl z-10">
          <h3 className="text-lg font-bold text-gray-900">{t('toolSolubilityTable')}</h3>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label={t('close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 sm:p-6 space-y-6">
          <section>
            <h4 className="text-sm font-bold text-gray-900 mb-2">{t('acids')}</h4>
            <div className="flex flex-wrap gap-2">
              {solubilityAcids.map(s => (
                <SubstanceChip key={s.formula} formula={s.formula} name={s.name[language]} value={s.value} />
              ))}
            </div>
          </section>

          <section>
            <h4 className="text-sm font-bold text-gray-900 mb-2">{t('bases')}</h4>
            <div className="flex flex-wrap gap-2">
              {solubilityBases.map(s => (
                <SubstanceChip key={s.formula} formula={s.formula} name={s.name[language]} value={s.value} />
              ))}
            </div>
          </section>

          <section>
            <h4 className="text-sm font-bold text-gray-900 mb-2">{t('salts')}</h4>
            <div className="overflow-x-auto">
              <table className="border-collapse text-center">
                <thead>
                  <tr>
                    <th className="p-1.5 text-xs text-gray-500 text-left sticky left-0 bg-white min-w-[6.5rem]">
                      {t('anion')} / {t('cation')}
                    </th>
                    {solubilityCations.map(c => (
                      <th
                        key={c.id}
                        className="p-1.5 text-xs font-semibold text-gray-700"
                        title={c.name[language]}
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {solubilityAnions.map(a => (
                    <tr key={a.id}>
                      <td className="p-1.5 text-left sticky left-0 bg-white" title={a.name[language]}>
                        <div className="text-xs font-semibold text-gray-900 whitespace-nowrap">{a.label}</div>
                        <div className="text-[10px] text-gray-500 whitespace-nowrap">{a.name[language]}</div>
                      </td>
                      {solubilityCations.map(c => (
                        <td key={c.id} className="p-1">
                          <ValueBadge value={a.values[c.id] ?? 'D'} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
              <span className={`inline-flex items-center justify-center min-w-[1.75rem] px-1 py-0.5 rounded-md text-xs font-bold ${valueStyles.R}`}>Р</span>
              {t('soluble')}
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
              <span className={`inline-flex items-center justify-center min-w-[1.75rem] px-1 py-0.5 rounded-md text-xs font-bold ${valueStyles.M}`}>М</span>
              {t('slightlySoluble')}
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
              <span className={`inline-flex items-center justify-center min-w-[1.75rem] px-1 py-0.5 rounded-md text-xs font-bold ${valueStyles.N}`}>Н</span>
              {t('insoluble')}
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
              <span className={`inline-flex items-center justify-center min-w-[1.75rem] px-1 py-0.5 rounded-md text-xs font-bold ${valueStyles.D}`}>—</span>
              {t('notDetermined')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
