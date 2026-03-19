import type { InputHTMLAttributes } from 'react';

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  className?: string;
};

const inputBase =
  'w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

export function Input({ className, ...props }: InputProps) {
  return <input className={[inputBase, className ?? ''].filter(Boolean).join(' ')} {...props} />;
}
