import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('browserAutomationTool', () => {
  let repoRoot = '';
  let dataDir = '';

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'swell-browser-tool-test-'));
    dataDir = join(repoRoot, 'data');
    mkdirSync(dataDir, { recursive: true });
    mkdirSync(join(repoRoot, 'identity'), { recursive: true });
    writeFileSync(join(repoRoot, 'identity', 'assistant.md'), 'You are a test assistant.');
    process.env.SWELL_PROJECT_ROOT = repoRoot;
    process.env.SWELL_DATA_DIR = dataDir;
    process.env.SWELL_IDENTITY_DIR = join(repoRoot, 'identity');
    process.env.SWELL_GLOBAL_ENV_DIR = repoRoot;
    writeFileSync(join(repoRoot, '.env'), 'SWELL_BROWSER_ALLOWED_ORIGINS=https://allowed.test\n', 'utf-8');
    vi.resetModules();
  });

  afterEach(async () => {
    const { closeDb } = await import('../../db/index.js');
    closeDb();
    rmSync(repoRoot, { recursive: true, force: true });
    delete process.env.SWELL_PROJECT_ROOT;
    delete process.env.SWELL_DATA_DIR;
    delete process.env.SWELL_IDENTITY_DIR;
    delete process.env.SWELL_GLOBAL_ENV_DIR;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('rejects urls outside the allowlist before launching the browser', async () => {
    const { browserAutomationTool } = await import('./browser_automation.js');
    await expect(
      browserAutomationTool.execute({
        action: 'screenshot',
        url: 'https://blocked.test/path',
      })
    ).rejects.toThrow(/AUTOMATION_DOMAIN_DENIED/);
  });

  it('writes a screenshot into data/exports/browser', async () => {
    const closeBrowser = vi.fn(async () => undefined);
    const closeContext = vi.fn(async () => undefined);
    const screenshot = vi.fn(async ({ path }: { path: string }) => {
      writeFileSync(path, 'png');
    });
    const page = {
      goto: vi.fn(async () => undefined),
      setDefaultTimeout: vi.fn(),
      setDefaultNavigationTimeout: vi.fn(),
      screenshot,
      locator: vi.fn(() => ({
        first: () => ({
          screenshot,
        }),
      })),
    };
    vi.doMock('playwright-core', () => ({
      chromium: {
        launch: vi.fn(async () => ({
          newContext: vi.fn(async () => ({
            newPage: vi.fn(async () => page),
            close: closeContext,
          })),
          close: closeBrowser,
        })),
      },
    }));

    const { browserAutomationTool } = await import('./browser_automation.js');
    const result = await browserAutomationTool.execute({
      action: 'screenshot',
      url: 'https://allowed.test/page',
      fullPage: true,
    });

    expect(result).toContain('/api/files/');
    expect(result).toContain('浏览器截图 已生成。');
    const exportDir = join(dataDir, 'exports', 'browser');
    expect(existsSync(exportDir)).toBe(true);
    expect(closeContext).toHaveBeenCalled();
    expect(closeBrowser).toHaveBeenCalled();
  });

  it('stores extracted text into a txt artifact', async () => {
    const closeBrowser = vi.fn(async () => undefined);
    const closeContext = vi.fn(async () => undefined);
    const page = {
      goto: vi.fn(async () => undefined),
      setDefaultTimeout: vi.fn(),
      setDefaultNavigationTimeout: vi.fn(),
      locator: vi.fn((selector: string) => ({
        first: () => ({
          textContent: vi.fn(async () => (selector === '.title' ? 'Hello' : 'World')),
          innerText: vi.fn(async () => 'Body text'),
        }),
      })),
    };
    vi.doMock('playwright-core', () => ({
      chromium: {
        launch: vi.fn(async () => ({
          newContext: vi.fn(async () => ({
            newPage: vi.fn(async () => page),
            close: closeContext,
          })),
          close: closeBrowser,
        })),
      },
    }));

    const { browserAutomationTool } = await import('./browser_automation.js');
    const result = await browserAutomationTool.execute({
      action: 'extract_text',
      url: 'https://allowed.test/page',
      selectors: ['.title', '.body'],
    });

    expect(result).toContain('.txt');
    const exportDir = join(dataDir, 'exports', 'browser');
    const files = readFileSync(join(exportDir, readdirSync(exportDir)[0]!), 'utf-8');
    expect(files).toContain('Hello');
    expect(files).toContain('World');
  });
});
