import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import commonRu from '../../locales/ru/common.json';
import commonKz from '../../locales/kz/common.json';
import subjectsRu from '../../locales/ru/subjects.json';
import subjectsKz from '../../locales/kz/subjects.json';
import testRu from '../../locales/ru/test.json';
import testKz from '../../locales/kz/test.json';
import resultsRu from '../../locales/ru/results.json';
import resultsKz from '../../locales/kz/results.json';
import profileRu from '../../locales/ru/profile.json';
import profileKz from '../../locales/kz/profile.json';
import adminRu from '../../locales/ru/admin.json';
import adminKz from '../../locales/kz/admin.json';
import importRu from '../../locales/ru/import.json';
import importKz from '../../locales/kz/import.json';

const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('language') : null;
const lng = saved === 'ru' || saved === 'kz' ? saved : 'ru';

i18n.use(initReactI18next).init({
  resources: {
    ru: {
      common: commonRu,
      subjects: subjectsRu,
      test: testRu,
      results: resultsRu,
      profile: profileRu,
      admin: adminRu,
      import: importRu,
    },
    kz: {
      common: commonKz,
      subjects: subjectsKz,
      test: testKz,
      results: resultsKz,
      profile: profileKz,
      admin: adminKz,
      import: importKz,
    },
  },
  lng,
  fallbackLng: 'ru',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  returnNull: false,
  ns: ['common', 'subjects', 'test', 'results', 'profile', 'admin', 'import'],
});

export default i18n;
