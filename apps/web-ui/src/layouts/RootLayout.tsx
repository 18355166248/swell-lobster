import { lazy, Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { useSetAtom } from 'jotai';
import { Sidebar } from '../components/Sidebar';
import { GlobalLoading } from '../components/GlobalLoading';
import { PageLoading } from '../components/PageLoading';
import { Topbar } from '../components/Topbar';
import { ROUTES } from '../routes';
import { refreshEndpointsAtom } from '../store/endpoints';

const ChatPage = lazy(async () => {
  const module = await import('../pages/Chat');
  return { default: module.ChatPage };
});

export function RootLayout() {
  const { pathname } = useLocation();
  const isChatRoute = pathname === ROUTES.CHAT;
  const [hasVisitedChat, setHasVisitedChat] = useState(isChatRoute);
  const refreshEndpoints = useSetAtom(refreshEndpointsAtom);

  useEffect(() => {
    void refreshEndpoints().catch(() => {
      // 首次拉取失败时静默：消费方自行处理空列表展示
    });
  }, [refreshEndpoints]);

  useEffect(() => {
    if (!isChatRoute || hasVisitedChat) return;
    const timer = window.setTimeout(() => setHasVisitedChat(true), 0);
    return () => window.clearTimeout(timer);
  }, [hasVisitedChat, isChatRoute]);

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
            {hasVisitedChat && (
              <div className={isChatRoute ? 'h-full' : 'hidden'}>
                <Suspense fallback={<PageLoading />}>
                  <ChatPage />
                </Suspense>
              </div>
            )}
            {/* 其他页面通过 Outlet 渲染 */}
            {!isChatRoute && <Outlet />}
          </main>
        </div>
      </div>
      <GlobalLoading />
    </>
  );
}
