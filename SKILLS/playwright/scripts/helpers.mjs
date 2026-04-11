/**
 * Playwright 共享 helpers — 供内置脚本和动态脚本共同使用。
 *
 * 动态脚本中引入方式：
 *   const h = await import(process.env.SKILLS_ROOT + '/playwright/scripts/helpers.mjs');
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import path from 'path';
import os from 'os';
import { randomBytes } from 'crypto';

function getChromeProfile() {
  switch (process.platform) {
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
    case 'win32':
      return path.join(
        process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
        'Google', 'Chrome', 'User Data'
      );
    case 'linux':
      return path.join(os.homedir(), '.config', 'google-chrome');
    default:
      return null;
  }
}

async function openContext() {
  const profileDir = getChromeProfile();
  if (profileDir) {
    try {
      const ctx = await chromium.launchPersistentContext(profileDir, {
        channel: 'chrome',
        headless: true,
        args: ['--no-sandbox'],
      });
      return { ctx, mode: 'chrome-profile' };
    } catch { /* profile 锁定或 Chrome 未安装，继续降级 */ }
  }
  for (const channel of ['chrome', 'msedge']) {
    try {
      const browser = await chromium.launch({ channel, headless: true });
      return { ctx: await browser.newContext(), mode: channel };
    } catch { /* 继续降级 */ }
  }
  // 兜底：playwright 内置 Chromium（需提前 npx playwright install chromium）
  const browser = await chromium.launch({ headless: true });
  return { ctx: await browser.newContext(), mode: 'chromium' };
}

/** 6 位随机后缀，避免文件名冲突 */
export function rand() {
  return randomBytes(3).toString('hex');
}

/**
 * 打开浏览器并导航到指定 URL（优先系统 Chrome + 登录态）。
 * @returns {{ page, ctx, mode, close }}
 */
export async function open(url) {
  const { ctx, mode } = await openContext();
  const page = await ctx.newPage();
  if (url) await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  return { page, ctx, mode, close: () => ctx.close() };
}

/**
 * 对当前页面截图，保存到 OUTPUT_DIR。
 * @returns {Promise<string>} 文件名
 */
export async function screenshot(page, name) {
  const outputDir = process.env.OUTPUT_DIR;
  const filename = `${name}_${rand()}.png`;
  await page.screenshot({ path: path.join(outputDir, filename), fullPage: true });
  return filename;
}

/**
 * 将文本内容保存到 OUTPUT_DIR。
 * @returns {string} 文件名
 */
export function saveText(content, name) {
  const outputDir = process.env.OUTPUT_DIR;
  const filename = `${name}_${rand()}.txt`;
  writeFileSync(path.join(outputDir, filename), content, 'utf-8');
  return filename;
}
