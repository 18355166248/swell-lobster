/**
 * .env 文件解析与合并工具函数
 *
 * Node 后端实现（原 Python 参考已移除）。
 */

/**
 * 将 .env 文件内容解析为 {key: value} 字典。
 *
 * 规则：
 * - 忽略空行与 # 注释行
 * - 支持引号包裹的值（单引号 / 双引号，内容原样保留）
 * - 未加引号的值：行内 # 注释被截断（须以空格或 Tab 开头）
 */
export function parseEnv(content: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (let line of content.split('\n')) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    if (!line.includes('=')) continue;

    const eqIdx = line.indexOf('=');
    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();

    if (
      value.length >= 2 &&
      value[0] === value[value.length - 1] &&
      (value[0] === '"' || value[0] === "'")
    ) {
      value = value.slice(1, -1);
    } else {
      for (const sep of [' #', '\t#']) {
        const idx = value.indexOf(sep);
        if (idx !== -1) {
          value = value.slice(0, idx).trimEnd();
          break;
        }
      }
    }
    env[key] = value;
  }
  return env;
}

/**
 * 将 entries 合并进现有 .env 内容，保留注释与原有顺序。
 *
 * 规则：
 * - 已有键：直接替换该行（value === "" 时删除该行）
 * - 新键：追加到文件末尾
 */
export function updateEnvContent(existing: string, entries: Record<string, string>): string {
  const lines = existing.split('\n');
  const updatedKeys = new Set<string>();
  const newLines: string[] = [];

  for (const line of lines) {
    const stripped = line.trim();
    if (!stripped || stripped.startsWith('#')) {
      newLines.push(line);
      continue;
    }
    if (!stripped.includes('=')) {
      newLines.push(line);
      continue;
    }
    const key = stripped.split('=')[0].trim();
    if (key in entries) {
      const value = entries[key];
      if (value === '') {
        // 空值 → 删除该行
        updatedKeys.add(key);
        continue;
      }
      newLines.push(`${key}=${value}`);
      updatedKeys.add(key);
    } else {
      newLines.push(line);
    }
  }

  // 追加不在原文件中的新键
  for (const [key, value] of Object.entries(entries)) {
    if (!updatedKeys.has(key) && value !== '') {
      newLines.push(`${key}=${value}`);
    }
  }

  return newLines.join('\n') + '\n';
}
