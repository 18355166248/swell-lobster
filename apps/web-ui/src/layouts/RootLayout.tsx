import { Outlet } from 'react-router';
import { Sidebar } from '../components/Sidebar';
import { Topbar } from '../components/Topbar';

export function RootLayout() {
  return (
    <div className="h-screen flex overflow-hidden bg-muted/50 dark:bg-background">
      <aside className="w-56 flex-shrink-0 flex flex-col overflow-hidden bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <Sidebar />
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
