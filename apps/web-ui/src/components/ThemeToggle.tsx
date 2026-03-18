import { useAtomValue, useSetAtom } from 'jotai';
import { themeModeAtom, type ThemeMode } from '../store/theme';

const options: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
];

export function ThemeToggle() {
  const theme = useAtomValue(themeModeAtom);
  const setTheme = useSetAtom(themeModeAtom);

  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-muted/80 p-0.5">
      {options.map(({ value, label }) => {
        const isActive = theme === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background ${
              isActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-background/80 hover:text-foreground'
            }`}
            title={label}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
