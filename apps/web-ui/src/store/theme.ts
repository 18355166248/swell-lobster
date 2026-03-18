import { atomWithStorage } from 'jotai/utils';

export type ThemeMode = 'light' | 'dark' | 'system';

const THEME_STORAGE_KEY = 'swell-lobster-theme';

/** 用户选择的主题：light | dark | system（跟随系统） */
export const themeModeAtom = atomWithStorage<ThemeMode>(THEME_STORAGE_KEY, 'system');

/** 解析后的实际主题，用于同步到 document（仅 'light' | 'dark'） */
export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') {
    if (typeof window === 'undefined' || !window.matchMedia) return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return mode;
}
