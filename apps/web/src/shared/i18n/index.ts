import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import kk from './kk';
import ru from './ru';

export const LOCALES = ['ru', 'kk'] as const;
export type AppLocale = (typeof LOCALES)[number];

/**
 * До входа язык берётся из браузера, после входа — из профиля (User.locale).
 * В браузерном хранилище ничего не держим.
 */
function initialLocale(): AppLocale {
  return navigator.language.toLowerCase().startsWith('kk') ? 'kk' : 'ru';
}

export function applyLocale(locale: AppLocale): void {
  if (i18n.language !== locale) void i18n.changeLanguage(locale);
  document.documentElement.lang = locale;
}

void i18n.use(initReactI18next).init({
  resources: { ru: { translation: ru }, kk: { translation: kk } },
  lng: initialLocale(),
  fallbackLng: 'ru',
  interpolation: { escapeValue: false },
});

export default i18n;
