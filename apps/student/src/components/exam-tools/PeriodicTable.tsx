import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useLanguage } from '@baiqautest/shared';
import { periodicElements, type ElementCategory, type PeriodicElement } from './periodicData';

const categoryStyles: Record<ElementCategory, string> = {
  alkali: 'bg-red-100 text-red-700 border-red-200',
  alkaline: 'bg-orange-100 text-orange-700 border-orange-200',
  transition: 'bg-blue-100 text-blue-700 border-blue-200',
  'post-transition': 'bg-cyan-100 text-cyan-700 border-cyan-200',
  metalloid: 'bg-teal-100 text-teal-700 border-teal-200',
  nonmetal: 'bg-green-100 text-green-700 border-green-200',
  halogen: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  noble: 'bg-purple-100 text-purple-700 border-purple-200',
  lanthanide: 'bg-pink-100 text-pink-700 border-pink-200',
  actinide: 'bg-indigo-100 text-indigo-700 border-indigo-200',
};

const categoryKeys: Record<ElementCategory, string> = {
  alkali: 'catAlkali',
  alkaline: 'catAlkaline',
  transition: 'catTransition',
  'post-transition': 'catPostTransition',
  metalloid: 'catMetalloid',
  nonmetal: 'catNonmetal',
  halogen: 'catHalogen',
  noble: 'catNoble',
  lanthanide: 'catLanthanide',
  actinide: 'catActinide',
};

const categoryOrder: ElementCategory[] = [
  'alkali',
  'alkaline',
  'transition',
  'post-transition',
  'metalloid',
  'nonmetal',
  'halogen',
  'noble',
  'lanthanide',
  'actinide',
];

const gridColumns = 'repeat(18, minmax(0, 1fr))';

function ElementCell({ el }: { el: PeriodicElement }) {
  const { language } = useLanguage();
  return (
    <div
      className={`${categoryStyles[el.category]} border rounded-lg aspect-square flex flex-col items-center justify-center min-w-0 px-0.5`}
      title={`${el.z} — ${el.name[language]} — ${el.mass}`}
    >
      <span className="text-[8px] leading-none opacity-60">{el.z}</span>
      <span className="text-[11px] sm:text-xs font-bold leading-tight">{el.symbol}</span>
      <span className="text-[7px] leading-none opacity-60 truncate max-w-full">{el.mass}</span>
    </div>
  );
}

export function PeriodicTable({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const mainGrid = periodicElements.filter(el => el.group >= 1 && el.group <= 18);
  const lanthanides = periodicElements.filter(el => el.category === 'lanthanide' && el.group === 0);
  const actinides = periodicElements.filter(el => el.category === 'actinide' && el.group === 0);

  return (
    <div className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl z-10">
          <h3 className="text-lg font-bold text-gray-900">{t('toolPeriodicTable')}</h3>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label={t('close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 sm:p-6">
          <div className="overflow-x-auto">
            <div className="min-w-[860px]">
              <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: gridColumns }}>
                {Array.from({ length: 18 }, (_, i) => (
                  <div key={i} className="text-center text-[10px] font-medium text-gray-400">
                    {i + 1}
                  </div>
                ))}
              </div>
              <div className="grid gap-1" style={{ gridTemplateColumns: gridColumns }}>
                {mainGrid.map(el => (
                  <div key={el.z} style={{ gridColumn: el.group, gridRow: el.period }}>
                    <ElementCell el={el} />
                  </div>
                ))}
              </div>
              <div className="grid gap-1 mt-2" style={{ gridTemplateColumns: gridColumns }}>
                <div className="col-span-2 rounded-lg bg-gray-100 text-gray-500 text-[10px] font-medium flex items-center justify-center text-center px-1">
                  {t('catLanthanide')}
                </div>
                {lanthanides.map(el => (
                  <ElementCell key={el.z} el={el} />
                ))}
              </div>
              <div className="grid gap-1 mt-1" style={{ gridTemplateColumns: gridColumns }}>
                <div className="col-span-2 rounded-lg bg-gray-100 text-gray-500 text-[10px] font-medium flex items-center justify-center text-center px-1">
                  {t('catActinide')}
                </div>
                {actinides.map(el => (
                  <ElementCell key={el.z} el={el} />
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-4">
            {categoryOrder.map(cat => (
              <span
                key={cat}
                className={`px-2 py-1 rounded-lg border text-xs font-medium ${categoryStyles[cat]}`}
              >
                {t(categoryKeys[cat])}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
