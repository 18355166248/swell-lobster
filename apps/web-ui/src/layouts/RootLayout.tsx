import { Outlet, useLocation } from 'react-router';
import { Sidebar } from '../components/Sidebar';
import { Topbar } from '../components/Topbar';

export function RootLayout() {
  const location = useLocation();
  const pathname = location.pathname;

  return (
    <div className="min-h-screen flex bg-stone-100">
      <aside className="w-56 flex-shrink-0 flex flex-col bg-stone-800 text-stone-200">
        <Sidebar currentPath={pathname} />
      </aside>
      <div className="flex-1 flex flex-col min-w-0 bg-white border-l border-stone-200 overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
