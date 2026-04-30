import { StrictMode, Suspense, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useAtomValue } from 'jotai';
import { RouterProvider } from 'react-router';
import { ConfigProvider, App, theme as antdTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import { I18nextProvider } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { PageLoading } from './components/PageLoading';
import './i18n';
import i18n from './i18n';
import './index.css';
import { router } from './router';
import { ThemeSync } from './components/ThemeSync';
import { themeModeAtom, resolveTheme } from './store/theme';
import { localeAtom } from './store/locale';
import { brandTheme, applyBrandToCss } from './theme';
import { isTauri } from './utils/platform';
import { reportFrontendLog } from './pages/Journal/api';

// 全局前端错误收集 → 写入 app_logs
window.addEventListener('error', (e) => {
  reportFrontendLog({
    level: 'error',
    message: e.message || String(e.error),
    context: { filename: e.filename, lineno: e.lineno, colno: e.colno, stack: e.error?.stack },
  }).catch(() => {});
});
window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason as Error | undefined;
  reportFrontendLog({
    level: 'error',
    message: reason?.message ?? String(e.reason),
    context: { stack: reason?.stack },
  }).catch(() => {});
});

// 桌面端：F12 / Ctrl+Shift+I / Cmd+Option+I 打开 DevTools
if (isTauri()) {
  window.addEventListener('keydown', (e) => {
    const isDevToolsKey =
      e.key === 'F12' ||
      (e.ctrlKey && e.shiftKey && e.key === 'I') ||
      (e.metaKey && e.altKey && e.key === 'I');
    if (isDevToolsKey) {
      e.preventDefault();
      invoke('open_devtools').catch(() => {});
    }
  });
}

function AppWithTheme() {
  const mode = useAtomValue(themeModeAtom);
  const locale = useAtomValue(localeAtom);
  const isDark = resolveTheme(mode) === 'dark';

  // 主题切换时同步 CSS 变量
  useEffect(() => {
    applyBrandToCss(isDark);
  }, [isDark]);

  // 语言切换时同步到 i18next
  useEffect(() => {
    i18n.changeLanguage(locale);
  }, [locale]);

  const antdLocale = locale === 'zh' ? zhCN : enUS;
  const { h, dark: darkHsl } = brandTheme.hsl;

  return (
    <ConfigProvider
      locale={antdLocale}
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: isDark ? brandTheme.dark : brandTheme.light,
          borderRadius: 8,
          fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif',
          fontSize: 15,
        },
        components: {
          Menu: isDark
            ? {
                itemSelectedColor: '#ffffff',
                itemSelectedBg: `hsl(${h} ${darkHsl.s} ${darkHsl.l} / 0.25)`,
                itemColor: 'rgb(255 255 255 / 0.65)',
                itemHoverColor: '#ffffff',
              }
            : {},
        },
      }}
    >
      <App>
        <ThemeSync />
        <Suspense fallback={<PageLoading />}>
          <RouterProvider router={router} />
        </Suspense>
      </App>
    </ConfigProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <AppWithTheme />
    </I18nextProvider>
  </StrictMode>
);

export default AppWithTheme;
