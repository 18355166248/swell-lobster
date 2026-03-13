#!/usr/bin/env node
/**
 * lint-staged 用：在 apps/web-ui 下对传入的已暂存文件执行 eslint --fix。
 * 将 apps/web-ui/ 前缀去掉后传入 eslint，以便在子目录内正确解析配置。
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webUiRoot = path.resolve(__dirname, '..', 'apps', 'web-ui');

const prefix = 'apps/web-ui/';
const files = process.argv.slice(2).filter((f) => f.startsWith(prefix));
const relativePaths = files.map((f) => f.slice(prefix.length));

if (relativePaths.length === 0) {
  process.exit(0);
}

const result = spawnSync('npx', ['eslint', '--fix', ...relativePaths], {
  cwd: webUiRoot,
  stdio: 'inherit',
  shell: true,
});

process.exit(result.status ?? 1);
