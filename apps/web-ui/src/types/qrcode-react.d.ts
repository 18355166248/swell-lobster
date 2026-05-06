declare module 'qrcode.react' {
  import type { ComponentType, SVGProps } from 'react';

  export interface QRCodeSVGProps extends SVGProps<SVGSVGElement> {
    value: string;
    size?: number;
    bgColor?: string;
    fgColor?: string;
    level?: 'L' | 'M' | 'Q' | 'H';
    includeMargin?: boolean;
  }

  export const QRCodeSVG: ComponentType<QRCodeSVGProps>;
}
