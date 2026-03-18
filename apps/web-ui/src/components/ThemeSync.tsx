import { useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { themeModeAtom, resolveTheme } from '../store/theme';

/**
 * 根据 themeModeAtom 将实际主题同步到 document.documentElement，
 * 用于 Tailwind dark: 与全局 CSS 变量。
 */
export function ThemeSync() {
  const mode = useAtomValue(themeModeAtom);
  const resolved = resolveTheme(mode);

  useEffect(() => {
    const root = document.documentElement;
    if (resolved === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.remove('dark');
      root.classList.add('light'); // 显式浅色时覆盖系统深色偏好
    }
  }, [resolved]);

  // 当 mode === 'system' 时监听系统偏好变化
  useEffect(() => {
    if (mode !== 'system' || typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const next = mq.matches ? 'dark' : 'light';
      if (next === 'dark') document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [mode]);

  return null;
}
