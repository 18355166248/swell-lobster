import { createBrowserRouter } from 'react-router';
import { RootLayout } from './layouts/RootLayout';
import { HomePage } from './pages/Home';
import { NotFoundPage } from './pages/NotFound';
import { ChatPage } from './pages/Chat';
import { IMPage } from './pages/IM';
import { SkillsPage } from './pages/Skills';
import { MCPPage } from './pages/MCP';
import { SchedulerPage } from './pages/Scheduler';
import { MemoryPage } from './pages/Memory';
import { StatusPage } from './pages/Status';
import { TokenStatsPage } from './pages/TokenStats';
import { ConfigLLMPage } from './pages/config/LLM';
import { ConfigIMPage } from './pages/config/IM';
import { ConfigToolsPage } from './pages/config/Tools';
import { ConfigIdentityPage } from './pages/config/Identity';
import { ConfigAdvancedPage } from './pages/config/Advanced';
import { ROUTES } from './routes';

export { ROUTES } from './routes';
export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'chat', element: <ChatPage /> },
      { path: 'im', element: <IMPage /> },
      { path: 'skills', element: <SkillsPage /> },
      { path: 'mcp', element: <MCPPage /> },
      { path: 'scheduler', element: <SchedulerPage /> },
      { path: 'memory', element: <MemoryPage /> },
      { path: 'status', element: <StatusPage /> },
      { path: 'token-stats', element: <TokenStatsPage /> },
      { path: 'config/llm', element: <ConfigLLMPage /> },
      { path: 'config/im', element: <ConfigIMPage /> },
      { path: 'config/tools', element: <ConfigToolsPage /> },
      { path: 'config/identity', element: <ConfigIdentityPage /> },
      { path: 'config/advanced', element: <ConfigAdvancedPage /> },
      { path: ROUTES.NOT_FOUND, element: <NotFoundPage /> },
    ],
  },
]);
