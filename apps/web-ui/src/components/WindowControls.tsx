import { useState, useEffect, useRef } from 'react';
import { getCurrentWindow, type Window } from '@tauri-apps/api/window';
import { isTauri } from '../utils/platform';

export function WindowControls() {
  const [maximized, setMaximized] = useState(false);
  const [focused, setFocused] = useState(true);
  const winRef = useRef<Window | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    const win = getCurrentWindow();
    winRef.current = win;

    win.isMaximized().then(setMaximized);
    win.isFocused().then(setFocused);

    const unlisteners: (() => void)[] = [];

    win.onResized(() => win.isMaximized().then(setMaximized)).then((fn) => unlisteners.push(fn));
    win.onFocusChanged(({ payload }) => setFocused(payload)).then((fn) => unlisteners.push(fn));

    return () => unlisteners.forEach((fn) => fn());
  }, []);

  if (!isTauri()) return null;

  const win = winRef.current ?? getCurrentWindow();

  return (
    <div
      className={`flex h-8 items-center gap-0.5 transition-opacity ${focused ? 'opacity-100' : 'opacity-60'}`}
    >
      <button
        type="button"
        onClick={() => win.minimize()}
        className="h-8 w-8 inline-flex items-center justify-center rounded-lg transition-colors text-foreground/50 hover:bg-muted hover:text-foreground"
        aria-label="最小化"
      >
        <svg
          viewBox="0 0 12 12"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 6h8" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => (maximized ? win.unmaximize() : win.maximize())}
        className="h-8 w-8 inline-flex items-center justify-center rounded-lg transition-colors text-foreground/50 hover:bg-muted hover:text-foreground"
        aria-label={maximized ? '还原' : '最大化'}
      >
        {maximized ? (
          <svg
            viewBox="0 0 12 12"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 2h6.5v6.5" />
            <path d="M1.5 4h7v7h-7z" />
          </svg>
        ) : (
          <svg
            viewBox="0 0 12 12"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 2h8v8H2z" />
          </svg>
        )}
      </button>
      <button
        type="button"
        onClick={() => win.close()}
        className="h-8 w-8 inline-flex items-center justify-center rounded-lg transition-colors text-foreground/50 hover:bg-red-500 hover:text-white"
        aria-label="关闭"
      >
        <svg
          viewBox="0 0 12 12"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 3l6 6" />
          <path d="M9 3L3 9" />
        </svg>
      </button>
    </div>
  );
}
