import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import es from './presentation/i18n/locales/es.json';

void i18n.use(initReactI18next).init({
  lng: 'es',
  fallbackLng: 'es',
  debug: false,
  showSupportNotice: false,
  resources: {
    es: {
      translation: es,
    },
  },
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
