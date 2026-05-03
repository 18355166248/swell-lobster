import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const connectMock = vi.fn().mockResolvedValue(undefined);
const disconnectMock = vi.fn();
const registerAllEventListenerMock = vi.fn().mockReturnThis();

vi.mock('dingtalk-stream', () => ({
  DWClient: vi.fn().mockImplementation(() => ({
    connect: connectMock,
    disconnect: disconnectMock,
    registerAllEventListener: registerAllEventListenerMock,
  })),
  EventAck: { SUCCESS: 'SUCCESS' },
  TOPIC_ROBOT: '/v1.0/im/bot/messages/get',
}));

describe('DingtalkChannel', () => {
  const originalFetch = global.fetch;
  let tempEnvDir = '';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    tempEnvDir = mkdtempSync(join(tmpdir(), 'swell-dingtalk-test-'));
    process.env.SWELL_GLOBAL_ENV_DIR = tempEnvDir;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.SWELL_GLOBAL_ENV_DIR;
    if (tempEnvDir) {
      rmSync(tempEnvDir, { recursive: true, force: true });
      tempEnvDir = '';
    }
  });

  it('starts stream client with configured credentials', async () => {
    writeFileSync(
      join(tempEnvDir, '.env'),
      'DINGTALK_CLIENT_ID=ding-client-id\nDINGTALK_CLIENT_SECRET=ding-client-secret\n',
      'utf-8'
    );

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ accessToken: 'token-1', expireIn: 7200 }),
    }) as typeof fetch;

    const { DWClient } = await import('dingtalk-stream');
    const { DingtalkChannel } = await import('./index.js');
    const adapter = new DingtalkChannel('ch-1', {
      client_id_env: 'DINGTALK_CLIENT_ID',
      client_secret_env: 'DINGTALK_CLIENT_SECRET',
    });

    await adapter.start();

    expect(global.fetch).toHaveBeenCalledOnce();
    expect(DWClient).toHaveBeenCalledWith({
      clientId: 'ding-client-id',
      clientSecret: 'ding-client-secret',
      debug: false,
      keepAlive: true,
    });
    expect(registerAllEventListenerMock).toHaveBeenCalledOnce();
    expect(connectMock).toHaveBeenCalledOnce();
    expect(adapter.getStatus()).toBe('running');
  });

  it('falls back to current env file when process env is not injected', async () => {
    writeFileSync(
      join(tempEnvDir, '.env'),
      'DINGTALK_CLIENT_ID=file-client-id\nDINGTALK_CLIENT_SECRET=file-client-secret\n',
      'utf-8'
    );

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ accessToken: 'token-1', expireIn: 7200 }),
    }) as typeof fetch;

    const { DWClient } = await import('dingtalk-stream');
    const { DingtalkChannel } = await import('./index.js');
    const adapter = new DingtalkChannel('ch-1', {
      client_id_env: 'DINGTALK_CLIENT_ID',
      client_secret_env: 'DINGTALK_CLIENT_SECRET',
    });

    await adapter.start();

    expect(DWClient).toHaveBeenCalledWith({
      clientId: 'file-client-id',
      clientSecret: 'file-client-secret',
      debug: false,
      keepAlive: true,
    });
  });

  it('converts stream text payload into unified message and caches session webhook', async () => {
    writeFileSync(
      join(tempEnvDir, '.env'),
      'DINGTALK_CLIENT_ID=ding-client-id\nDINGTALK_CLIENT_SECRET=ding-client-secret\n',
      'utf-8'
    );

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ accessToken: 'token-1', expireIn: 7200 }),
    }) as typeof fetch;

    const { DingtalkChannel } = await import('./index.js');
    const adapter = new DingtalkChannel('ch-1', {
      client_id_env: 'DINGTALK_CLIENT_ID',
      client_secret_env: 'DINGTALK_CLIENT_SECRET',
    });
    await adapter.start();

    const onMessage = vi.fn().mockResolvedValue(undefined);
    adapter.onMessage = onMessage;

    await adapter.handleStreamPayload({
      msgId: 'msg-1',
      msgtype: 'text',
      conversationId: 'conv-1',
      conversationType: '1',
      senderStaffId: 'staff-1',
      sessionWebhook: 'https://example.com/session-webhook',
      sessionWebhookExpiredTime: Date.now() + 60_000,
      text: { content: '你好，Swell' },
    });

    expect(onMessage).toHaveBeenCalledOnce();
    expect(onMessage.mock.calls[0]?.[0]).toMatchObject({
      channel_type: 'dingtalk',
      channel_id: 'ch-1',
      chat_id: 'conv-1',
      user_id: 'staff-1',
      message_id: 'msg-1',
      text: '你好，Swell',
    });
  });

  it('downloads picture message as image attachment', async () => {
    writeFileSync(
      join(tempEnvDir, '.env'),
      'DINGTALK_CLIENT_ID=ding-client-id\nDINGTALK_CLIENT_SECRET=ding-client-secret\n',
      'utf-8'
    );

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accessToken: 'token-1', expireIn: 7200 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ downloadUrl: 'https://download.example.com/demo.png' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'image/png' }),
        arrayBuffer: async () => Uint8Array.from([1, 2, 3, 4]).buffer,
      }) as typeof fetch;

    const { DingtalkChannel } = await import('./index.js');
    const adapter = new DingtalkChannel('ch-1', {
      client_id_env: 'DINGTALK_CLIENT_ID',
      client_secret_env: 'DINGTALK_CLIENT_SECRET',
    });
    await adapter.start();

    const onMessage = vi.fn().mockResolvedValue(undefined);
    adapter.onMessage = onMessage;

    await adapter.handleStreamPayload({
      msgId: 'msg-2',
      msgtype: 'picture',
      conversationId: 'conv-2',
      senderStaffId: 'staff-2',
      content: JSON.stringify({ downloadCode: 'code-1' }),
    });

    expect(onMessage).toHaveBeenCalledOnce();
    expect(onMessage.mock.calls[0]?.[0]).toMatchObject({
      chat_id: 'conv-2',
      text: '请描述这张图片',
      images: [{ base64: 'AQIDBA==', mimeType: 'image/png' }],
    });
  });

  it('replies via cached session webhook before falling back to OpenAPI', async () => {
    writeFileSync(
      join(tempEnvDir, '.env'),
      'DINGTALK_CLIENT_ID=ding-client-id\nDINGTALK_CLIENT_SECRET=ding-client-secret\n',
      'utf-8'
    );

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accessToken: 'token-1', expireIn: 7200 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ errcode: 0 }),
      }) as typeof fetch;

    const { DingtalkChannel } = await import('./index.js');
    const adapter = new DingtalkChannel('ch-1', {
      client_id_env: 'DINGTALK_CLIENT_ID',
      client_secret_env: 'DINGTALK_CLIENT_SECRET',
    });
    await adapter.start();

    await adapter.handleStreamPayload({
      msgId: 'msg-3',
      msgtype: 'text',
      conversationId: 'conv-3',
      senderStaffId: 'staff-3',
      sessionWebhook: 'https://example.com/session-webhook',
      sessionWebhookExpiredTime: Date.now() + 60_000,
      text: { content: 'hello' },
    });

    await adapter.sendMessage('conv-3', 'delegated reply');

    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'https://example.com/session-webhook',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });
});
