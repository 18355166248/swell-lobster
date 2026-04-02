/**
 * build-pkg.mjs — 向后兼容入口
 *
 * 旧的 pkg 路线已经切换为 SEA。
 * 保留该文件只是为了兼容历史命令，实际转发到 build-sea.mjs。
 */

await import('./build-sea.mjs');
