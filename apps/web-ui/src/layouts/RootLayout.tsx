import { Outlet, useLocation } from 'react-router';
import { Sidebar } from '../components/Sidebar';
import { Topbar } from '../components/Topbar';

export function RootLayout() {
  const location = useLocation();
  const pathname = location.pathname;

  return (
    <div className="min-h-screen flex bg-muted/50 dark:bg-background">
      <aside className="w-56 flex-shrink-0 flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <Sidebar currentPath={pathname} />
      </aside>
      <div className="flex-1 flex flex-col min-w-0 bg-background border-l border-border overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
