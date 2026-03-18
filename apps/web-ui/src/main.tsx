import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { Theme } from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import './index.css';
import { router } from './router';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Theme accentColor="violet" radius="medium" scaling="100%">
      <RouterProvider router={router} />
    </Theme>
  </StrictMode>
);
