import { describe, it, expect } from 'vitest';
import { sanitizeChildEnv } from './sanitizeEnv.js';

describe('sanitizeChildEnv', () => {
  it('保留系统路径变量', () => {
    const result = sanitizeChildEnv({
      PATH: '/usr/bin:/bin',
      HOME: '/root',
      TEMP: 'C:\\Temp',
    });
    expect(result['PATH']).toBe('/usr/bin:/bin');
    expect(result['HOME']).toBe('/root');
    expect(result['TEMP']).toBe('C:\\Temp');
  });

  it('保留工具注入的工作变量', () => {
    const result = sanitizeChildEnv({
      OUTPUT_DIR: '/data/outputs',
      SKILLS_ROOT: '/project/SKILLS',
      DATA_SKILLS_DIR: '/data/skills',
      NODE_PATH: '/usr/lib/node_modules',
      SWELL_PYTHON_BIN: '/usr/bin/python3',
      SWELL_UV_BIN: '/usr/bin/uv',
    });
    expect(result['OUTPUT_DIR']).toBe('/data/outputs');
    expect(result['SKILLS_ROOT']).toBe('/project/SKILLS');
    expect(result['DATA_SKILLS_DIR']).toBe('/data/skills');
    expect(result['NODE_PATH']).toBe('/usr/lib/node_modules');
    expect(result['SWELL_PYTHON_BIN']).toBe('/usr/bin/python3');
    expect(result['SWELL_UV_BIN']).toBe('/usr/bin/uv');
  });

  it('剥离 SWELL_* 敏感变量（非白名单）', () => {
    const result = sanitizeChildEnv({
      SWELL_MASTER_KEY: 'secret-master-key',
      SWELL_AUTH_TOKEN: 'my-token',
      SWELL_DB_PATH: '/data/tide-lobster.db',
      SWELL_PYTHON_BIN: '/usr/bin/python3',
    });
    expect(result['SWELL_MASTER_KEY']).toBeUndefined();
    expect(result['SWELL_AUTH_TOKEN']).toBeUndefined();
    expect(result['SWELL_DB_PATH']).toBeUndefined();
    expect(result['SWELL_PYTHON_BIN']).toBe('/usr/bin/python3');
  });

  it('剥离 *_API_KEY 变量', () => {
    const result = sanitizeChildEnv({
      OPENAI_API_KEY: 'sk-xxx',
      ANTHROPIC_API_KEY: 'sk-ant-xxx',
      CUSTOM_SERVICE_API_KEY: 'key-123',
      SOME_API_KEY_PREFIX: 'should-also-drop',
    });
    expect(result['OPENAI_API_KEY']).toBeUndefined();
    expect(result['ANTHROPIC_API_KEY']).toBeUndefined();
    expect(result['CUSTOM_SERVICE_API_KEY']).toBeUndefined();
    expect(result['SOME_API_KEY_PREFIX']).toBeUndefined();
  });

  it('剥离已知提供商前缀变量', () => {
    const result = sanitizeChildEnv({
      OPENAI_ORG_ID: 'org-123',
      ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
      GEMINI_PROJECT: 'my-project',
      CLAUDE_MODEL: 'claude-3',
    });
    expect(result['OPENAI_ORG_ID']).toBeUndefined();
    expect(result['ANTHROPIC_BASE_URL']).toBeUndefined();
    expect(result['GEMINI_PROJECT']).toBeUndefined();
    expect(result['CLAUDE_MODEL']).toBeUndefined();
  });

  it('剥离 *_SECRET、*_TOKEN、*_PASSWORD、*_PASS', () => {
    const result = sanitizeChildEnv({
      TELEGRAM_BOT_TOKEN: 'bot-token',
      WEBHOOK_SECRET: 'secret-value',
      DB_PASSWORD: 'db-pass',
      SMTP_PASS: 'smtp-pass',
      DINGTALK_SECRET_KEY: 'dk-secret',
    });
    expect(result['TELEGRAM_BOT_TOKEN']).toBeUndefined();
    expect(result['WEBHOOK_SECRET']).toBeUndefined();
    expect(result['DB_PASSWORD']).toBeUndefined();
    expect(result['SMTP_PASS']).toBeUndefined();
    expect(result['DINGTALK_SECRET_KEY']).toBeUndefined();
  });

  it('保留普通业务变量', () => {
    const result = sanitizeChildEnv({
      NODE_ENV: 'production',
      PORT: '3000',
      APP_NAME: 'swell-lobster',
    });
    expect(result['NODE_ENV']).toBe('production');
    expect(result['PORT']).toBe('3000');
    expect(result['APP_NAME']).toBe('swell-lobster');
  });

  it('不修改原始 env 对象', () => {
    const original = {
      OPENAI_API_KEY: 'sk-xxx',
      PATH: '/usr/bin',
    };
    sanitizeChildEnv(original);
    expect(original['OPENAI_API_KEY']).toBe('sk-xxx');
  });
});
