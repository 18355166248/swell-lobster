import { Outlet, useLocation } from 'react-router';
import { Sidebar } from '../components/Sidebar';
import { GlobalLoading } from '../components/GlobalLoading';
import { Topbar } from '../components/Topbar';
import { ChatPage } from '../pages/Chat';
import { ROUTES } from '../routes';

export function RootLayout() {
  const { pathname } = useLocation();
  const isChatRoute = pathname === ROUTES.CHAT;

  return (
    <>
      <div className="h-screen flex overflow-hidden bg-muted/50 dark:bg-background">
        <aside className="w-56 flex-shrink-0 flex flex-col overflow-hidden bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
          <Sidebar />
        </aside>
        <div className="flex-1 flex flex-col min-w-0 bg-background border-l border-border overflow-hidden">
          <Topbar />
          <main className={`flex-1 ${isChatRoute ? 'overflow-hidden' : 'overflow-auto'}`}>
            {/* Chat 始终挂载，切换菜单后通过 CSS 隐藏，生成状态不中断 */}
            <div className={isChatRoute ? 'h-full' : 'hidden'}>
              <ChatPage />
            </div>
            {/* 其他页面通过 Outlet 渲染 */}
            {!isChatRoute && <Outlet />}
          </main>
        </div>
      </div>
      <GlobalLoading />
    </>
  );
}
