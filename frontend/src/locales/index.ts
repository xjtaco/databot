import { createI18n } from 'vue-i18n';
import zhCN from './zh-CN';
import enUS from './en-US';

export type LocaleKey = 'zh-CN' | 'en-US';

export const SUPPORTED_LOCALES: { key: LocaleKey; label: string }[] = [
  { key: 'zh-CN', label: '中文' },
  { key: 'en-US', label: 'English' },
];

const messages = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

function getDefaultLocale(): LocaleKey {
  const browserLang = navigator.language;
  if (browserLang.startsWith('zh')) {
    return 'zh-CN';
  }
  if (browserLang.startsWith('en')) {
    return 'en-US';
  }
  return 'zh-CN'; // Default to Chinese as per CLAUDE.md
}

const savedLocale = localStorage.getItem('databot-locale') as LocaleKey | null;

export const i18n = createI18n({
  legacy: false,
  locale: savedLocale || getDefaultLocale(),
  fallbackLocale: 'zh-CN',
  messages,
});

export function setLocale(locale: LocaleKey): void {
  i18n.global.locale.value = locale;
  localStorage.setItem('databot-locale', locale);
  document.documentElement.lang = locale;
}

export function getCurrentLocale(): LocaleKey {
  return i18n.global.locale.value as LocaleKey;
}
