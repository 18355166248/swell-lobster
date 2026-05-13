import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('emailSendTool', () => {
  let repoRoot = '';
  let dataDir = '';

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'swell-email-send-test-'));
    dataDir = join(repoRoot, 'data');
    mkdirSync(join(dataDir, 'outputs'), { recursive: true });
    mkdirSync(join(repoRoot, 'identity'), { recursive: true });
    writeFileSync(join(repoRoot, 'identity', 'assistant.md'), 'You are a test assistant.');
    writeFileSync(join(dataDir, 'outputs', 'report.txt'), 'hello', 'utf-8');
    process.env.SWELL_PROJECT_ROOT = repoRoot;
    process.env.SWELL_DATA_DIR = dataDir;
    process.env.SWELL_IDENTITY_DIR = join(repoRoot, 'identity');
    process.env.SWELL_GLOBAL_ENV_DIR = repoRoot;
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

  it('sends email through nodemailer using stored smtp config', async () => {
    const sendMail = vi.fn(async () => ({ messageId: 'msg-123' }));
    vi.doMock('nodemailer', () => ({
      default: {
        createTransport: vi.fn(() => ({ sendMail })),
      },
    }));

    const { saveSmtpConfig } = await import('../../store/emailSmtpConfig.js');
    saveSmtpConfig({
      host: 'smtp.example.com',
      port: 465,
      user: 'bot@example.com',
      password: 'secret123',
      from: 'bot@example.com',
      secure: true,
    });

    const { emailSendTool } = await import('./email_send.js');
    const result = await emailSendTool.execute({
      to: ['user@example.com'],
      subject: 'Weekly report',
      body: 'Done.',
      attachments: ['outputs/report.txt'],
    });

    expect(sendMail).toHaveBeenCalled();
    expect(result).toContain('邮件已发送');
    expect(result).toContain('msg-123');
  });

  it('rejects too many recipients', async () => {
    const { emailSendTool } = await import('./email_send.js');
    const result = await emailSendTool.execute({
      to: Array.from({ length: 21 }, (_, index) => `u${index}@example.com`),
      subject: 'Too many',
      body: 'Nope',
    });
    expect(result).toContain('参数校验失败');
  });
});

