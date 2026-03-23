/**
 * 全局主题色配置 — 只改这一个文件，antd 与 CSS 变量同步生效
 *
 * 换色示例：
 *   紫色  h: 272, light: '#aa3bff', dark: '#c084fc'
 *   蓝色  h: 220, light: '#3b82f6', dark: '#60a5fa'
 *   绿色  h: 160, light: '#10b981', dark: '#34d399'
 *   橙色  h:  25, light: '#f97316', dark: '#fb923c'
 */
export const brandTheme = {
  /** 浅色模式主色 hex（供 antd colorPrimary 使用） */
  light: '#aa3bff',
  /** 深色模式主色 hex（供 antd colorPrimary 使用） */
  dark: '#c084fc',
  /** CSS HSL 通道（用于派生 accent-bg / accent-border / selection 等） */
  hsl: {
    h: 272,
    light: { s: '100%', l: '61%' },
    dark: { s: '93%', l: '74%' },
  },
} as const;

/** 将主题色注入 CSS 自定义变量，在 AppWithTheme 中随模式切换调用 */
export function applyBrandToCss(isDark: boolean) {
  const { h, light, dark } = brandTheme.hsl;
  const { s, l } = isDark ? dark : light;
  const root = document.documentElement;
  root.style.setProperty('--brand-h', String(h));
  root.style.setProperty('--brand-s', s);
  root.style.setProperty('--brand-l', l);
}
