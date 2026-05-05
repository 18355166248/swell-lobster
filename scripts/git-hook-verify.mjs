/**
 * pre-push 等 Git 钩子常在非交互环境里执行，PATH 里没有 fnm，仍会用到系统自带的 Node。
 * 这里根据 .node-version 解析 fnm 已安装的 Node，并把该版本的安装目录插到 PATH 最前再跑 verify。
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

const isWin = process.platform === 'win32';
const pathSep = isWin ? ';' : ':';

function readPinnedVersion() {
  const p = join(root, '.node-version');
  if (!existsSync(p)) {
    return '20.20.0';
  }
  return readFileSync(p, 'utf8').trim().split(/\r?\n/)[0].trim();
}

function fnmVersionDirs() {
  const home = process.env.USERPROFILE || process.env.HOME;
  const fnmDir = process.env.FNM_DIR;
  const dirs = [];
  if (fnmDir) {
    dirs.push(join(fnmDir, 'node-versions'));
  }
  if (home) {
    dirs.push(join(home, 'AppData', 'Roaming', 'fnm', 'node-versions'));
    dirs.push(join(home, 'AppData', 'Local', 'fnm', 'node-versions'));
    dirs.push(join(home, '.local', 'share', 'fnm', 'node-versions'));
    dirs.push(join(home, '.fnm', 'node-versions'));
  }
  return dirs;
}

function vDirName(version) {
  return version.startsWith('v') ? version : `v${version}`;
}

function resolveNodeExe(versionSpec) {
  const vdir = vDirName(versionSpec);
  for (const base of fnmVersionDirs()) {
    if (!existsSync(base)) continue;
    const installRoot = join(base, vdir, 'installation');
    if (!existsSync(installRoot)) continue;
    const candidates = isWin
      ? [join(installRoot, 'node.exe'), join(installRoot, 'bin', 'node.exe')]
      : [join(installRoot, 'bin', 'node'), join(installRoot, 'node')];
    for (const p of candidates) {
      if (existsSync(p)) return p;
    }
  }
  return null;
}

function installDirectoryForNode(nodeExe) {
  let dir = dirname(nodeExe);
  if (existsSync(join(dir, isWin ? 'npm.cmd' : 'npm'))) {
    return dir;
  }
  const parent = dirname(dir);
  if (existsSync(join(parent, isWin ? 'npm.cmd' : 'npm'))) {
    return parent;
  }
  return dir;
}

const pinned = readPinnedVersion();
const nodeExe = resolveNodeExe(pinned);

if (!nodeExe) {
  console.error(
    `[git-hook-verify] 未在 fnm 目录中找到 Node ${pinned}（见 .node-version）。` +
      `请执行: fnm install ${pinned} && fnm default ${pinned}`
  );
  console.error(`[git-hook-verify] 当前用于启动本脚本的 Node: ${process.execPath}`);
  process.exit(1);
}

const installDir = installDirectoryForNode(nodeExe);
const pathPrefix = `${installDir}${pathSep}`;
const env = { ...process.env, PATH: `${pathPrefix}${process.env.PATH ?? ''}` };

const result = spawnSync('npm', ['run', 'verify'], {
  stdio: 'inherit',
  env,
  cwd: root,
  shell: isWin,
});

process.exit(result.status ?? 1);
