import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';
import type { Browser, BrowserContext, Page } from 'playwright-core';

import { settings } from '../../config.js';
import { getProxyUrlForTarget } from '../../net/fetchDispatcher.js';
import { isOriginAllowed } from '../../net/originAllowlist.js';
import { recordEvent } from '../../observability/traceStore.js';
import { ToolRiskLevel, type ToolDef } from '../types.js';
import {
  buildOutputFileRef,
  formatOutputFileResult,
  sanitizeBaseName,
} from '../outputFiles.js';

const BROWSER_TIMEOUT_MS = 30_000;

const fieldSchema = z.object({
  selector: z.string().trim().min(1),
  value: z.string(),
});

const argsSchema = z
  .object({
    action: z.enum(['screenshot', 'extract_text', 'fill_and_submit']),
    url: z.string().url(),
    selector: z.string().trim().min(1).optional(),
    fullPage: z.boolean().optional(),
    selectors: z.array(z.string().trim().min(1)).min(1).optional(),
    fields: z.array(fieldSchema).min(1).optional(),
    submitSelector: z.string().trim().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.action === 'fill_and_submit' && !value.fields?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fields'],
        message: 'fill_and_submit requires at least one field',
      });
    }
  });

function getBrowserExportDir(): string {
  return join(settings.dataDir, 'exports', 'browser');
}

async function ensureBrowserExportDir(): Promise<string> {
  const dir = getBrowserExportDir();
  await mkdir(dir, { recursive: true });
  return dir;
}

function buildBaseName(url: URL, action: string): string {
  return sanitizeBaseName(`${url.hostname}-${action}-${Date.now()}`, 'browser-export');
}

async function withTimeout<T>(task: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function closeQuietly(resource: { close: () => Promise<unknown> } | null | undefined) {
  try {
    await resource?.close();
  } catch {
    // ignore cleanup failures
  }
}

async function launchBrowser(targetUrl: string): Promise<{
  browser: Browser;
  context: BrowserContext;
  page: Page;
}> {
  process.env.PLAYWRIGHT_BROWSERS_PATH ??= join(settings.dataDir, 'playwright');
  let chromium: typeof import('playwright-core').chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch {
    throw new Error('browser_automation 依赖缺失：请安装 playwright-core');
  }

  const proxyUrl = getProxyUrlForTarget(targetUrl);
  const browser = await chromium.launch({
    headless: true,
    ...(proxyUrl ? { proxy: { server: proxyUrl } } : {}),
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(BROWSER_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(BROWSER_TIMEOUT_MS);
  return { browser, context, page };
}

async function runScreenshot(
  page: Page,
  targetUrl: string,
  selector: string | undefined,
  fullPage: boolean | undefined
): Promise<string> {
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  const exportDir = await ensureBrowserExportDir();
  const base = buildBaseName(new URL(targetUrl), 'screenshot');
  const outputPath = join(exportDir, `${base}.png`);

  if (selector) {
    await page.locator(selector).first().screenshot({ path: outputPath });
  } else {
    await page.screenshot({ path: outputPath, fullPage: fullPage ?? true });
  }

  const ref = buildOutputFileRef(`${base}.png`, outputPath);
  return formatOutputFileResult('浏览器截图', ref, [
    `- 目标：${targetUrl}`,
    ...(selector ? [`- 选择器：${selector}`] : []),
  ]);
}

async function runExtractText(
  page: Page,
  targetUrl: string,
  selectors: string[] | undefined
): Promise<string> {
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  const chunks: string[] = [];

  if (selectors?.length) {
    for (const selector of selectors) {
      const text = (await page.locator(selector).first().textContent())?.trim() ?? '';
      if (text) chunks.push(`${selector}:\n${text}`);
    }
  } else {
    const bodyText = await page.locator('body').innerText();
    const trimmed = bodyText.trim();
    if (trimmed) chunks.push(trimmed);
  }

  if (chunks.length === 0) {
    return `未从 ${targetUrl} 提取到可用文本`;
  }

  const exportDir = await ensureBrowserExportDir();
  const base = buildBaseName(new URL(targetUrl), 'extract-text');
  const outputPath = join(exportDir, `${base}.txt`);
  const content = chunks.join('\n\n');
  await writeFile(outputPath, content, 'utf-8');
  const ref = buildOutputFileRef(`${base}.txt`, outputPath);

  return formatOutputFileResult('页面文本', ref, [
    `- 目标：${targetUrl}`,
    `- 字符数：${content.length}`,
    `- 预览：${content.slice(0, 300).replace(/\s+/g, ' ')}${content.length > 300 ? '…' : ''}`,
  ]);
}

async function runFillAndSubmit(
  page: Page,
  targetUrl: string,
  fields: Array<{ selector: string; value: string }>,
  submitSelector?: string
): Promise<string> {
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  for (const field of fields) {
    await page.locator(field.selector).first().fill(field.value);
  }

  if (submitSelector) {
    await page.locator(submitSelector).first().click();
  } else {
    await page.locator(fields[fields.length - 1]!.selector).first().press('Enter');
  }

  await page.waitForLoadState('domcontentloaded');

  const exportDir = await ensureBrowserExportDir();
  const base = buildBaseName(new URL(targetUrl), 'submit-result');
  const outputPath = join(exportDir, `${base}.png`);
  await page.screenshot({ path: outputPath, fullPage: true });
  const ref = buildOutputFileRef(`${base}.png`, outputPath);

  return formatOutputFileResult('表单提交结果截图', ref, [
    `- 初始地址：${targetUrl}`,
    `- 提交后地址：${page.url()}`,
    ...(submitSelector ? [`- 提交按钮：${submitSelector}`] : ['- 提交方式：按下回车']),
  ]);
}

export const browserAutomationTool: ToolDef = {
  name: 'browser_automation',
  description:
    '使用受限的浏览器自动化执行截图、文本抓取或表单填写提交。仅支持白名单域名，并始终走审批流程。',
  permission: {
    riskLevel: ToolRiskLevel.execute,
    requiresApproval: true,
    networkScopes: ['https://*'],
    pathScopes: ['data/exports/browser/**'],
    sideEffectSummary: '打开 Chromium 并执行用户指定动作 / 截图 / 抓取',
  },
  parameters: {
    action: {
      type: 'string',
      description: '执行动作：screenshot、extract_text 或 fill_and_submit',
      enum: ['screenshot', 'extract_text', 'fill_and_submit'],
      required: true,
    },
    url: {
      type: 'string',
      description: '目标网页 URL，必须命中自动化域名白名单',
      required: true,
    },
    selector: {
      type: 'string',
      description: '截图时可选的目标选择器；不传则截整页',
    },
    fullPage: {
      type: 'boolean',
      description: '整页截图；仅 screenshot 动作使用，默认 true',
    },
    selectors: {
      type: 'array',
      description: '文本抓取时可选的多个选择器；不传则提取 body 文本',
      items: { type: 'string' },
    },
    fields: {
      type: 'array',
      description: '表单填写数组，每项包含 selector 和 value',
      items: {
        type: 'object',
        properties: {
          selector: { type: 'string' },
          value: { type: 'string' },
        },
      },
    },
    submitSelector: {
      type: 'string',
      description: '提交按钮选择器；不传则在最后一个输入框上按 Enter',
    },
  },
  async execute(args, context) {
    const parsed = argsSchema.safeParse(args);
    if (!parsed.success) {
      return `browser_automation 参数校验失败：${parsed.error.issues[0]?.message ?? 'invalid args'}`;
    }

    const { action, url, selector, fullPage, selectors, fields, submitSelector } = parsed.data;

    if (!isOriginAllowed(url)) {
      const host = new URL(url).host;
      recordEvent({
        category: 'auth.token.failed',
        status: 'error',
        sessionId: context?.sessionId,
        meta: { reason: 'automation-domain-denied', host, url },
      });
      throw new Error(`AUTOMATION_DOMAIN_DENIED: ${host} 未命中自动化域名白名单`);
    }

    let browser: Browser | undefined;
    let contextRef: BrowserContext | undefined;
    try {
      const launched = await withTimeout(launchBrowser(url), BROWSER_TIMEOUT_MS, 'browser launch');
      browser = launched.browser;
      contextRef = launched.context;
      const page = launched.page;

      if (action === 'screenshot') {
        return await withTimeout(runScreenshot(page, url, selector, fullPage), BROWSER_TIMEOUT_MS, action);
      }
      if (action === 'extract_text') {
        return await withTimeout(runExtractText(page, url, selectors), BROWSER_TIMEOUT_MS, action);
      }
      return await withTimeout(
        runFillAndSubmit(page, url, fields ?? [], submitSelector),
        BROWSER_TIMEOUT_MS,
        action
      );
    } finally {
      await closeQuietly(contextRef);
      await closeQuietly(browser);
    }
  },
};
