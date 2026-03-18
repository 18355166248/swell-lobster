import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { useAtomValue } from 'jotai';
import { RouterProvider } from 'react-router';
import { Theme } from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import './index.css';
import { router } from './router';
import { ThemeSync } from './components/ThemeSync';
import { themeModeAtom, resolveTheme } from './store/theme';

function AppWithTheme() {
  const mode = useAtomValue(themeModeAtom);
  const appearance = resolveTheme(mode) === 'dark' ? 'dark' : 'light';
  return (
    <>
      <ThemeSync />
      <Theme accentColor="violet" radius="medium" scaling="100%" appearance={appearance}>
        <RouterProvider router={router} />
      </Theme>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppWithTheme />
  </StrictMode>
);
