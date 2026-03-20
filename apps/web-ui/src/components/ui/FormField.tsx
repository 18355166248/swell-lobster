import type { ReactNode } from 'react';

export type FormFieldProps = {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
};

/**
 * 表单字段容器：统一 label + 内容区 + 错误提示的排版。
 * 配合 react-hook-form 使用：将 errors.field?.message 传给 error prop。
 */
export function FormField({ label, hint, error, children, className }: FormFieldProps) {
  return (
    <div className={['mb-4', className].filter(Boolean).join(' ')}>
      <label className="block text-sm font-medium text-foreground mb-1.5">
        {label}
        {hint && <span className="ml-1.5 text-xs text-muted-foreground font-normal">{hint}</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
