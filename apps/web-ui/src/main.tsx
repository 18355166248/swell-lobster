import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useAtomValue } from 'jotai';
import { RouterProvider } from 'react-router';
import { ConfigProvider, App, theme as antdTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import { I18nextProvider } from 'react-i18next';
import './i18n';
import i18n from './i18n';
import './index.css';
import { router } from './router';
import { ThemeSync } from './components/ThemeSync';
import { themeModeAtom, resolveTheme } from './store/theme';
import { localeAtom } from './store/locale';
import mermaid from 'mermaid';

mermaid.initialize({ startOnLoad: true });

const ACCENT_COLOR = '#aa3bff';

function AppWithTheme() {
  const mode = useAtomValue(themeModeAtom);
  const locale = useAtomValue(localeAtom);
  const isDark = resolveTheme(mode) === 'dark';

  // 语言切换时同步到 i18next
  useEffect(() => {
    i18n.changeLanguage(locale);
  }, [locale]);

  const antdLocale = locale === 'zh' ? zhCN : enUS;

  return (
    <ConfigProvider
      locale={antdLocale}
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: ACCENT_COLOR,
          borderRadius: 8,
          fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif',
          fontSize: 15,
        },
        components: {
          Menu: isDark
            ? {
                itemSelectedColor: '#ffffff',
                itemSelectedBg: 'rgba(170, 59, 255, 0.25)',
                itemColor: 'rgba(255, 255, 255, 0.65)',
                itemHoverColor: '#ffffff',
              }
            : {},
        },
      }}
    >
      <App>
        <ThemeSync />
        <RouterProvider router={router} />
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
