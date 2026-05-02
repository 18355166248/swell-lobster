/**
 * 端口工具：启动前确保监听端口空闲。
 *
 * 场景：dev / 桌面 sidecar 重启时，旧实例没释放端口（终端被强制关闭、SIGKILL、tsx watch
 * 的子进程残留等）。此模块负责定位占用进程并发信号让其退出，避免进程因 EADDRINUSE 直接崩。
 */

import net from 'node:net';
import { execSync } from 'node:child_process';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function isPortFree(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net
      .createServer()
      .once('error', () => resolve(false))
      .once('listening', () => tester.close(() => resolve(true)))
      .listen(port, host);
  });
}

function findPidsOnPort(port: number): number[] {
  try {
    if (process.platform === 'win32') {
      // netstat 输出末列是 PID
      const out = execSync(`netstat -ano -p TCP`, { encoding: 'utf8' });
      const pids = new Set<number>();
      for (const line of out.split(/\r?\n/)) {
        if (!line.includes(`:${port}`)) continue;
        if (!/LISTENING/i.test(line)) continue;
        const m = line.trim().match(/(\d+)\s*$/);
        if (m) pids.add(parseInt(m[1], 10));
      }
      return [...pids].filter((n) => Number.isFinite(n) && n > 0);
    }
    const out = execSync(`lsof -ti :${port} -sTCP:LISTEN`, { encoding: 'utf8' });
    return out
      .split('\n')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
  } catch {
    // lsof / netstat 找不到匹配项时退出码非 0，视为没有占用者
    return [];
  }
}

/**
 * 若 `host:port` 已被占用，向占用进程发 SIGTERM；最多等 2 秒后仍未释放则补 SIGKILL，再等 1 秒。
 * 不会抛错；如果最终仍未释放，由后续 serve() 抛 EADDRINUSE 自然失败。
 */
export async function ensurePortAvailable(host: string, port: number): Promise<void> {
  if (await isPortFree(host, port)) return;

  const pids = findPidsOnPort(port).filter((pid) => pid !== process.pid);
  if (pids.length === 0) {
    console.warn(`[port] ${host}:${port} 被占用但未能定位 PID，可能是非 LISTEN 连接残留`);
    return;
  }

  console.warn(`[port] ${host}:${port} 已被 PID ${pids.join(', ')} 占用，发送 SIGTERM 释放...`);
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // 进程已退出或权限不足
    }
  }

  for (let i = 0; i < 20; i++) {
    if (await isPortFree(host, port)) return;
    await sleep(100);
  }

  console.warn(`[port] SIGTERM 超时未释放，对 PID ${pids.join(', ')} 发送 SIGKILL`);
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // ignore
    }
  }

  for (let i = 0; i < 10; i++) {
    if (await isPortFree(host, port)) return;
    await sleep(100);
  }
}
