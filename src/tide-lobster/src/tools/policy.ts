import { realpathSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { settings } from '../config.js';

function safeRealpathSync(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}

/** 文件可读根目录（read_file 工具） */
export function getReadAllowedRoots(): string[] {
  return [join(settings.dataDir, 'tmp', 'uploads')].map(safeRealpathSync);
}

/** 脚本可执行根目录（run_script 工具） */
export function getExecuteAllowedRoots(): string[] {
  return [
    join(settings.projectRoot, 'SKILLS'),
    join(settings.dataDir, 'skills'),
  ].map(safeRealpathSync);
}

/** 脚本可写根目录（run_script 动态脚本写入） */
export function getScriptWritableRoot(): string {
  return safeRealpathSync(join(settings.dataDir, 'skills'));
}

/**
 * 校验路径是否在允许的根目录列表内。
 * 使用 realpathSync 防止符号链接绕过；文件不存在时返回 false。
 */
export function isPathWithinRoots(filePath: string, roots: string[]): boolean {
  let real: string;
  try {
    real = realpathSync(filePath);
  } catch {
    return false;
  }
  return roots.some((root) => real === root || real.startsWith(root + sep));
}
