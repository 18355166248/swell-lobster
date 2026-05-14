/**
 * 子进程环境变量净化：剥离宿主进程中的敏感凭据，防止技能脚本读取。
 *
 * 保留规则（白名单优先）：
 *   - 系统路径类：PATH、PATHEXT、HOME、USERPROFILE、TEMP、TMP、SystemRoot、
 *     HOMEDRIVE、HOMEPATH、LOCALAPPDATA、APPDATA、PROGRAMFILES、USERNAME
 *   - Node 运行时：NODE_PATH、NODE_OPTIONS
 *   - 工具注入的工作变量：OUTPUT_DIR、SKILLS_ROOT、DATA_SKILLS_DIR、
 *     SKILLS_PPTX_SCRIPTS_DIR、SWELL_OUTPUT_DIR、SWELL_PYTHON_BIN、SWELL_UV_BIN
 *
 * 剥离规则（键名模式匹配，区分大小写不敏感）：
 *   - 包含 _API_KEY、_SECRET、_TOKEN、_PASSWORD、_PASS（以 _ 开头的 PASS）
 *   - 以 SWELL_ 开头（除上述白名单变量）
 *   - 以 OPENAI_、ANTHROPIC_、GEMINI_、CLAUDE_ 开头
 */

const SENSITIVE_PATTERNS = [
  /_API_KEY$/i,
  /_API_KEY_/i,
  /_SECRET$/i,
  /_SECRET_/i,
  /_TOKEN$/i,
  /_TOKEN_/i,
  /_PASSWORD$/i,
  /_PASS$/i,
] as const;

const SENSITIVE_PREFIXES = [
  'OPENAI_',
  'ANTHROPIC_',
  'GEMINI_',
  'CLAUDE_',
] as const;

const SWELL_PREFIX = 'SWELL_';

const SWELL_ALLOWED = new Set([
  'SWELL_OUTPUT_DIR',
  'SWELL_PYTHON_BIN',
  'SWELL_UV_BIN',
]);

const SYSTEM_ALLOWLIST = new Set([
  'PATH',
  'PATHEXT',
  'HOME',
  'USERPROFILE',
  'TEMP',
  'TMP',
  'SYSTEMROOT',
  'HOMEDRIVE',
  'HOMEPATH',
  'LOCALAPPDATA',
  'APPDATA',
  'PROGRAMFILES',
  'PROGRAMFILES(X86)',
  'USERNAME',
  'COMSPEC',
  'WINDIR',
  'OS',
  'PROCESSOR_ARCHITECTURE',
  'NODE_PATH',
  'NODE_OPTIONS',
  'OUTPUT_DIR',
  'SKILLS_ROOT',
  'DATA_SKILLS_DIR',
  'SKILLS_PPTX_SCRIPTS_DIR',
]);

function isSensitive(key: string): boolean {
  const upper = key.toUpperCase();

  // SWELL_ 开头但不在白名单中
  if (upper.startsWith(SWELL_PREFIX) && !SWELL_ALLOWED.has(upper)) {
    return true;
  }

  // 已知提供商前缀
  for (const prefix of SENSITIVE_PREFIXES) {
    if (upper.startsWith(prefix)) return true;
  }

  // 通用敏感关键词模式
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(upper)) return true;
  }

  return false;
}

export function sanitizeChildEnv(
  env: NodeJS.ProcessEnv
): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    const upper = key.toUpperCase();

    // 系统白名单直接保留
    if (SYSTEM_ALLOWLIST.has(upper)) {
      result[key] = value;
      continue;
    }

    // 工具注入变量白名单（精确匹配）
    if (SWELL_ALLOWED.has(upper)) {
      result[key] = value;
      continue;
    }

    // 敏感变量剥离
    if (isSensitive(key)) continue;

    result[key] = value;
  }

  return result;
}
