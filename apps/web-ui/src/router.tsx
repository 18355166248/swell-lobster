import { createBrowserRouter } from 'react-router';
import { RootLayout } from './layouts/RootLayout';
import { ROUTES } from './routes';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      {
        index: true,
        lazy: async () => ({ Component: (await import('./pages/Home')).HomePage }),
      },
      { path: 'chat' },
      {
        path: 'im',
        lazy: async () => ({ Component: (await import('./pages/IM')).IMPage }),
      },
      {
        path: 'skills',
        lazy: async () => ({ Component: (await import('./pages/Skills')).SkillsPage }),
      },
      {
        path: 'mcp',
        lazy: async () => ({ Component: (await import('./pages/MCP')).MCPPage }),
      },
      {
        path: 'scheduler',
        lazy: async () => ({ Component: (await import('./pages/Scheduler')).SchedulerPage }),
      },
      {
        path: 'memory',
        lazy: async () => ({ Component: (await import('./pages/Memory')).MemoryPage }),
      },
      {
        path: 'journal',
        lazy: async () => ({ Component: (await import('./pages/Journal')).JournalPage }),
      },
      {
        path: 'status',
        lazy: async () => ({ Component: (await import('./pages/Status')).StatusPage }),
      },
      {
        path: 'token-stats',
        lazy: async () => ({ Component: (await import('./pages/TokenStats')).TokenStatsPage }),
      },
      {
        path: 'config/llm',
        lazy: async () => ({ Component: (await import('./pages/config/LLM')).ConfigLLMPage }),
      },
      {
        path: 'config/im',
        lazy: async () => ({ Component: (await import('./pages/config/IM')).ConfigIMPage }),
      },
      {
        path: 'config/identity',
        lazy: async () => ({
          Component: (await import('./pages/config/Identity')).ConfigIdentityPage,
        }),
      },
      {
        path: 'config/advanced',
        lazy: async () => ({
          Component: (await import('./pages/config/Advanced')).ConfigAdvancedPage,
        }),
      },
      {
        path: ROUTES.NOT_FOUND,
        lazy: async () => ({ Component: (await import('./pages/NotFound')).NotFoundPage }),
      },
    ],
  },
]);
