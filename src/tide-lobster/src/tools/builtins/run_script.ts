/**
 * run_script 内置工具：执行 SKILLS/ 目录内的脚本文件。
 *
 * 支持解释器：
 *   .py          → Python（检测顺序：SWELL_PYTHON_BIN > python3 > python > uv run）
 *   .js / .mjs   → Node.js（process.execPath，当前 Node 二进制，始终可用）
 *
 * 安全约束：
 *   - 脚本路径必须在 SKILLS/ 或 data/skills/ 白名单内（realpathSync 防符号链接绕过）
 *   - 文件扩展名白名单：.py .js .mjs
 *   - 超时上限 120 秒，防止死循环
 *
 * 环境变量注入：
 *   SKILLS_ROOT  → SKILLS/ 绝对路径（脚本可用 os.environ['SKILLS_ROOT'] 引用其他脚本）
 *   OUTPUT_DIR   → 输出目录绝对路径（脚本必须将生成文件写入此目录）
 *
 * 返回 JSON 字符串：
 *   { exit_code, stdout, stderr, output_files: [{filename, url}], timed_out }
 */
import { existsSync, mkdirSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { settings } from '../../config.js';
import type { ToolDef } from '../types.js';

const ALLOWED_EXTENSIONS = new Set(['.py', '.js', '.mjs']);
const DEFAULT_TIMEOUT_S = 30;
const MAX_TIMEOUT_S = 120;
const MAX_OUTPUT_BYTES = 512 * 1024; // 512 KB

function getAllowedRoots(): string[] {
  const roots = [
    join(settings.projectRoot, 'SKILLS'),
    join(settings.dataDir, 'skills'),
  ];
  return roots.map((r) => {
    try {
      return realpathSync(r);
    } catch {
      return resolve(r);
    }
  });
}

function isPathAllowed(filePath: string, roots: string[]): boolean {
  let real: string;
  try {
    real = realpathSync(filePath);
  } catch {
    return false;
  }
  return roots.some((root) => real === root || real.startsWith(root + sep));
}

function getOutputDir(): string {
  const dir = process.env['SWELL_OUTPUT_DIR'] ?? join(settings.projectRoot, 'data', 'outputs');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** 执行前对输出目录做快照：记录 文件名 → mtime(ms)，用于执行后比对新增或被修改的文件。 */
function snapshotOutputDir(outputDir: string): Map<string, number> {
  try {
    const map = new Map<string, number>();
    for (const name of readdirSync(outputDir)) {
      try {
        map.set(name, statSync(join(outputDir, name)).mtimeMs);
      } catch {
        // 忽略单个文件的 stat 失败
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

/** 检测 Python 可执行文件，返回命令和参数前缀。 */
async function detectPython(): Promise<{ bin: string; prefix: string[] } | null> {
  const customBin = process.env['SWELL_PYTHON_BIN'];
  const candidates = customBin ? [customBin] : ['python3', 'python'];

  for (const bin of candidates) {
    if (await isExecutable(bin) && await isPythonRunnable(bin, [])) {
      return { bin, prefix: [] };
    }
  }

  // 优先使用 SWELL_UV_BIN（打包版 uv sidecar 路径），其次检测系统 PATH 里的 uv
  const uvBin = process.env['SWELL_UV_BIN'] ?? 'uv';
  if (await isExecutable(uvBin) && await isPythonRunnable(uvBin, ['run'])) {
    return { bin: uvBin, prefix: ['run'] };
  }

  return null;
}

/** 通过 which/where 检测命令是否可执行。 */
function isExecutable(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const check = spawn(process.platform === 'win32' ? 'where' : 'which', [cmd], {
      stdio: 'ignore',
      windowsHide: true,
    });
    check.on('close', (code) => resolve(code === 0));
    check.on('error', () => resolve(false));
  });
}

/**
 * 验证 Python 命令真正可用（Windows Store stub 存在但运行会失败，
 * isExecutable 只检查 where，需额外运行 --version 确认）。
 */
function isPythonRunnable(bin: string, prefix: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const args = [...prefix, '--version'];
    const check = spawn(bin, args, { stdio: 'ignore', windowsHide: true });
    check.on('close', (code) => resolve(code === 0));
    check.on('error', () => resolve(false));
  });
}

interface SpawnResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

function spawnWithTimeout(
  bin: string,
  args: string[],
  opts: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    stdin?: string;
    timeoutMs: number;
  }
): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const controller = new AbortController();
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, opts.timeoutMs);

    const child = spawn(bin, args, {
      cwd: opts.cwd,
      env: opts.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      signal: controller.signal,
    });

    const stdoutBufs: Buffer[] = [];
    const stderrBufs: Buffer[] = [];
    let stdoutLen = 0;
    let stderrLen = 0;

    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdoutLen < MAX_OUTPUT_BYTES) {
        stdoutBufs.push(chunk);
        stdoutLen += chunk.length;
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderrLen < MAX_OUTPUT_BYTES) {
        stderrBufs.push(chunk);
        stderrLen += chunk.length;
      }
    });

    if (opts.stdin && child.stdin) {
      child.stdin.write(opts.stdin);
      child.stdin.end();
    }

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: code ?? -1,
        stdout: Buffer.concat(stdoutBufs).toString('utf-8').slice(0, 8000),
        stderr: Buffer.concat(stderrBufs).toString('utf-8').slice(0, 2000),
        timedOut,
      });
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      // AbortError 是正常超时终止
      if (err.code === 'ABORT_ERR') {
        resolve({ exitCode: -1, stdout: '', stderr: '', timedOut: true });
      } else {
        resolve({ exitCode: -1, stdout: '', stderr: err.message, timedOut: false });
      }
    });
  });
}

export const runScriptTool: ToolDef = {
  name: 'run_script',
  description: [
    'Execute a script file from SKILLS/ or data/skills/ directories.',
    'Supported: .py (Python), .js / .mjs (Node.js).',
    'Scripts MUST write output files to $OUTPUT_DIR (injected as env var).',
    'Returns JSON: { exit_code, stdout, stderr, output_files: [{filename, url}], timed_out }.',
    'Include download links in reply: [filename.pptx](/api/files/filename.pptx)',
  ].join(' '),
  parameters: {
    script_path: {
      type: 'string',
      description:
        'Absolute path to the script. Must be inside SKILLS/ or data/skills/. Use $SKILLS_ROOT env var as prefix.',
      required: true,
    },
    script_content: {
      type: 'string',
      description:
        'Inline script content. If provided and the file does not exist, it will be written to script_path before execution. Useful for dynamically generated scripts.',
      required: false,
    },
    args: {
      type: 'array',
      description: 'Command-line arguments to pass to the script.',
      required: false,
      items: { type: 'string' },
    },
    input_data: {
      type: 'string',
      description: 'Data to pipe into stdin of the script.',
      required: false,
    },
    timeout_seconds: {
      type: 'number',
      description: `Execution timeout in seconds. Default: ${DEFAULT_TIMEOUT_S}, max: ${MAX_TIMEOUT_S}.`,
      required: false,
    },
  },

  async execute({ script_path, script_content, args, input_data, timeout_seconds }) {
    const scriptPath = String(script_path ?? '').trim();
    if (!scriptPath) return JSON.stringify({ error: 'script_path is required.' });

    // 1. 扩展名白名单（早期校验，与文件是否存在无关）
    const ext = extname(scriptPath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return JSON.stringify({
        error: `Unsupported script extension "${ext}". Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}.`,
      });
    }

    // 2. 如果提供了内联脚本内容且文件不存在，先在允许目录内创建文件
    if (script_content && !existsSync(scriptPath)) {
      const resolvedPath = resolve(scriptPath);
      const roots = getAllowedRoots();
      const allowed = roots.some((r) => resolvedPath === r || resolvedPath.startsWith(r + sep));
      if (!allowed) {
        return JSON.stringify({ error: 'script_path is outside the allowed skills directories.' });
      }
      mkdirSync(dirname(resolvedPath), { recursive: true });
      writeFileSync(resolvedPath, String(script_content), 'utf-8');
    }

    // 3. 文件存在性检查（在路径安全校验之前，给出更清晰的错误消息）
    if (!existsSync(scriptPath)) {
      return JSON.stringify({ error: `Script not found: ${scriptPath}` });
    }

    // 4. 路径安全校验
    const roots = getAllowedRoots();
    if (!isPathAllowed(scriptPath, roots)) {
      return JSON.stringify({
        error: 'script_path is outside the allowed skills directories.',
      });
    }

    // 5. 确定输出目录
    const outputDir = getOutputDir();
    console.log("🚀 ~ outputDir:", outputDir)
    const beforeSnapshot = snapshotOutputDir(outputDir);

    // 6. 解析解释器
    let bin: string;
    let interpreterPrefix: string[] = [];

    if (ext === '.py') {
      const python = await detectPython();
      if (!python) {
        return JSON.stringify({
          error:
            'Python not found. Install uv (recommended): curl -LsSf https://astral.sh/uv/install.sh | sh',
        });
      }
      bin = python.bin;
      interpreterPrefix = python.prefix;
    } else {
      // .js / .mjs → 使用当前 Node.js 二进制
      bin = process.execPath;
    }

    // 7. 构建命令参数
    const scriptArgs = Array.isArray(args) ? args.map(String) : [];
    const cmdArgs = [...interpreterPrefix, scriptPath, ...scriptArgs];

    // 8. 构建环境变量
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      SKILLS_ROOT: join(settings.projectRoot, 'SKILLS'),
      OUTPUT_DIR: outputDir,
    };

    // 9. 执行
    const timeoutMs =
      Math.min(
        typeof timeout_seconds === 'number' && timeout_seconds > 0
          ? timeout_seconds
          : DEFAULT_TIMEOUT_S,
        MAX_TIMEOUT_S
      ) * 1000;

    const result = await spawnWithTimeout(bin, cmdArgs, {
      cwd: join(scriptPath, '..'), // 工作目录 = 脚本所在目录
      env,
      stdin: input_data ? String(input_data) : undefined,
      timeoutMs,
    });

    // 10. 检测新生成或被修改的输出文件
    const afterSnapshot = snapshotOutputDir(outputDir);
    const newFiles: { filename: string; url: string }[] = [];
    for (const [name, mtime] of afterSnapshot) {
      const prev = beforeSnapshot.get(name);
      if (prev === undefined || mtime > prev) {
        newFiles.push({ filename: name, url: `/api/files/${encodeURIComponent(name)}` });
      }
    }

    return JSON.stringify({
      exit_code: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      output_files: newFiles,
      timed_out: result.timedOut,
    });
  },
};
