import { Select as AntSelect } from 'antd';

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type SelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  disabled,
}: SelectProps) {
  return (
    <AntSelect
      value={value || undefined}
      onChange={onValueChange}
      options={options}
      placeholder={placeholder ?? '请选择…'}
      disabled={disabled}
      className={className}
      style={{ width: '100%' }}
    />
  );
}
