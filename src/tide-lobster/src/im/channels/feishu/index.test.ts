import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const requestMock = vi.fn();
const replyMock = vi.fn();
const createMock = vi.fn();
const resourceGetMock = vi.fn();
const wsStartMock = vi.fn();

let registeredEvents: Record<string, (payload: unknown) => Promise<void>> = {};

vi.mock('@larksuiteoapi/node-sdk', () => ({
  AppType: { SelfBuild: 'self_build' },
  Domain: { Feishu: 'feishu', Lark: 'lark' },
  Client: vi.fn().mockImplementation(() => ({
    request: requestMock,
    im: {
      message: {
        reply: replyMock,
        create: createMock,
      },
      messageResource: {
        get: resourceGetMock,
      },
    },
  })),
  WSClient: vi.fn().mockImplementation(() => ({
    start: wsStartMock,
  })),
  EventDispatcher: vi.fn().mockImplementation(() => ({
    register: (events: Record<string, (payload: unknown) => Promise<void>>) => {
      registeredEvents = events;
      return { register: () => undefined };
    },
  })),
}));

describe('FeishuChannel', () => {
  let tempEnvDir = '';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    registeredEvents = {};
    tempEnvDir = mkdtempSync(join(tmpdir(), 'swell-feishu-test-'));
    process.env.SWELL_GLOBAL_ENV_DIR = tempEnvDir;

    requestMock.mockImplementation(async ({ url }: { url: string }) => {
      if (url === '/open-apis/bot/v3/info') {
        return { code: 0, data: { open_id: 'ou_bot_123' } };
      }
      return { code: 0 };
    });
    replyMock.mockResolvedValue({ code: 0 });
    createMock.mockResolvedValue({ code: 0 });
  });

  afterEach(() => {
    delete process.env.SWELL_GLOBAL_ENV_DIR;
    if (tempEnvDir) {
      rmSync(tempEnvDir, { recursive: true, force: true });
      tempEnvDir = '';
    }
  });

  it('starts WS client with credentials from env file', async () => {
    writeFileSync(
      join(tempEnvDir, '.env'),
      'FEISHU_APP_ID=cli_id\nFEISHU_APP_SECRET=cli_secret\n',
      'utf-8'
    );

    const { Client, WSClient } = await import('@larksuiteoapi/node-sdk');
    const { FeishuChannel } = await import('./index.js');
    const adapter = new FeishuChannel('ch-1', {
      app_id_env: 'FEISHU_APP_ID',
      app_secret_env: 'FEISHU_APP_SECRET',
    });

    await adapter.start();

    expect(Client).toHaveBeenCalledWith({
      appId: 'cli_id',
      appSecret: 'cli_secret',
      appType: 'self_build',
      domain: 'feishu',
    });
    expect(WSClient).toHaveBeenCalledWith({
      appId: 'cli_id',
      appSecret: 'cli_secret',
      domain: 'feishu',
    });
    expect(wsStartMock).toHaveBeenCalledOnce();
    expect(adapter.getStatus()).toBe('running');
    expect(Object.keys(registeredEvents)).toContain('im.message.receive_v1');
  });

  it('normalizes text messages and removes bot mention markup', async () => {
    writeFileSync(
      join(tempEnvDir, '.env'),
      'FEISHU_APP_ID=cli_id\nFEISHU_APP_SECRET=cli_secret\n',
      'utf-8'
    );

    const { FeishuChannel } = await import('./index.js');
    const adapter = new FeishuChannel('ch-2', {
      app_id_env: 'FEISHU_APP_ID',
      app_secret_env: 'FEISHU_APP_SECRET',
    });
    const onMessage = vi.fn().mockResolvedValue(undefined);
    adapter.onMessage = onMessage;

    await adapter.start();

    await registeredEvents['im.message.receive_v1']({
      message: {
        message_id: 'msg-1',
        chat_id: 'oc_chat_1',
        chat_type: 'p2p',
        message_type: 'text',
        content: JSON.stringify({ text: '@Swell   <at user_id="ou_bot_123"></at> 帮我整理今天待办' }),
        mentions: [
          {
            id: { open_id: 'ou_bot_123' },
            name: 'Swell',
            key: '<at user_id="ou_bot_123"></at>',
          },
        ],
      },
      sender: {
        sender_id: { open_id: 'ou_user_1' },
        sender_type: 'user',
      },
    });

    expect(onMessage).toHaveBeenCalledOnce();
    expect(onMessage.mock.calls[0]?.[0]).toMatchObject({
      channel_type: 'feishu',
      channel_id: 'ch-2',
      chat_id: 'oc_chat_1',
      user_id: 'ou_user_1',
      message_id: 'msg-1',
      text: '帮我整理今天待办',
    });
    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: '/open-apis/im/v1/messages/msg-1/reactions',
      })
    );
  });

  it('downloads image messages into multimodal payloads', async () => {
    writeFileSync(
      join(tempEnvDir, '.env'),
      'FEISHU_APP_ID=cli_id\nFEISHU_APP_SECRET=cli_secret\n',
      'utf-8'
    );

    resourceGetMock.mockResolvedValue({
      writeFile: async (targetPath: string) => {
        writeFileSync(targetPath, Buffer.from([1, 2, 3, 4]));
      },
    });

    const { FeishuChannel } = await import('./index.js');
    const adapter = new FeishuChannel('ch-3', {
      app_id_env: 'FEISHU_APP_ID',
      app_secret_env: 'FEISHU_APP_SECRET',
    });
    const onMessage = vi.fn().mockResolvedValue(undefined);
    adapter.onMessage = onMessage;

    await adapter.start();

    await registeredEvents['im.message.receive_v1']({
      message: {
        message_id: 'msg-2',
        chat_id: 'oc_chat_2',
        chat_type: 'p2p',
        message_type: 'image',
        content: JSON.stringify({ image_key: 'img_key_123' }),
      },
      sender: {
        sender_id: { open_id: 'ou_user_2' },
        sender_type: 'user',
      },
    });

    expect(resourceGetMock).toHaveBeenCalledWith({
      path: { message_id: 'msg-2', file_key: 'img_key_123' },
      params: { type: 'image' },
    });
    expect(onMessage.mock.calls[0]?.[0]).toMatchObject({
      text: '请描述这张图片',
      images: [{ base64: 'AQIDBA==', mimeType: 'image/jpeg' }],
    });
  });

  it('replies to message threads and uses cards for markdown content', async () => {
    writeFileSync(
      join(tempEnvDir, '.env'),
      'FEISHU_APP_ID=cli_id\nFEISHU_APP_SECRET=cli_secret\n',
      'utf-8'
    );

    const { FeishuChannel } = await import('./index.js');
    const adapter = new FeishuChannel('ch-4', {
      app_id_env: 'FEISHU_APP_ID',
      app_secret_env: 'FEISHU_APP_SECRET',
    });

    await adapter.start();
    await adapter.sendMessage('oc_chat_4', '# 今日总结\n- 已完成联调', {
      replyToMessageId: 'root-msg-1',
    });

    expect(replyMock).toHaveBeenCalledWith({
      path: { message_id: 'root-msg-1' },
      data: {
        msg_type: 'interactive',
        content: expect.stringContaining('**\\u4eca\\u65e5\\u603b\\u7ed3**'),
      },
    });
    expect(createMock).not.toHaveBeenCalled();
  });
});
