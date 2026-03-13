import { Outlet, Link } from 'react-router';
import { ROUTES } from '../router';

export function RootLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-stone-50">
      <header className="border-b border-stone-200 bg-white/80 backdrop-blur">
        <nav className="mx-auto max-w-4xl px-4 py-3 flex items-center gap-6">
          <Link
            to={ROUTES.HOME}
            className="text-lg font-semibold text-stone-800 hover:text-stone-600"
          >
            SwellLobster
          </Link>
        </nav>
      </header>
      <main className="flex-1 mx-auto w-full max-w-4xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
