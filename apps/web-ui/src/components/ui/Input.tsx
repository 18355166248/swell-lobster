import { Input as AntInput } from 'antd';
import type { InputProps as AntInputProps } from 'antd';

export type InputProps = AntInputProps & {
  className?: string;
};

export function Input({ className, type, ...props }: InputProps) {
  if (type === 'password') {
    return <AntInput.Password className={className} {...props} />;
  }
  return <AntInput className={className} type={type} {...props} />;
}
