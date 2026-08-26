import { useTranslation } from 'react-i18next';

// Возвращает функцию: slug (напр. 'kazakhstan_history') -> переведённое название
export function useSubjectLabel() {
  const { t } = useTranslation('subjects');
  return (slug?: string | null) => (slug ? t(`subjects.${slug}`, { defaultValue: slug }) : '—');
}
