import { atomWithStorage } from 'jotai/utils';
import i18n from '../i18n';

export type Locale = 'zh' | 'en';

export const localeAtom = atomWithStorage<Locale>('swell-lobster-locale', 'zh');

/** 切换语言时同步到 i18next */
export function applyLocale(locale: Locale) {
  i18n.changeLanguage(locale);
}
