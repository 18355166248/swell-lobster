/**
 * 运行时平台检测工具。
 *
 * isTauri()：是否运行在 Tauri 桌面容器内。
 * 在 Tauri v2 WebView 中，window.__TAURI_INTERNALS__ 对象由 Tauri 注入。
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
