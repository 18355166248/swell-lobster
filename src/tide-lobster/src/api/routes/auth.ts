/**
 * 阶段 15a-1：远程访问令牌的 REST CRUD
 * 阶段 15a-3：POST/DELETE 输入校验改用 zod
 * 阶段 15a-5：补 master-key 状态、local-token 取/重置、远程模式开关
 *
 * - GET    /api/auth/tokens                     列出未撤销 token
 * - POST   /api/auth/tokens                     创建远程 token，仅本次返回明文
 * - DELETE /api/auth/tokens/:id                 撤销 token（幂等）
 * - GET    /api/auth/master-key/status          主密钥状态（present / missing）
 * - GET    /api/auth/local-token                返回本机 token（**仅 loopback 来源**）
 * - POST   /api/auth/local-token/reset          生成新本机 token
 * - GET    /api/auth/remote-mode                查询远程访问 flag
 * - POST   /api/auth/remote-mode                启用 / 关闭远程访问
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Hono } from 'hono';
import { z } from 'zod';

import {
  createRemoteToken,
  ensureLocalToken,
  listRemoteTokens,
  resetLocalToken,
  revokeRemoteToken,
  TOKEN_SCOPES,
} from '../../auth/tokenStore.js';
import { getMasterKeyStatus } from '../../auth/crypto.js';
import { readRemoteFlag, writeRemoteFlag } from '../../auth/remoteMode.js';
import { settings } from '../../config.js';
import { recordEvent } from '../../observability/traceStore.js';
import { validateBody, validateParam } from '../utils/validate.js';

export const authRouter = new Hono();

function isLoopbackRequest(c: {
  req: { header: (k: string) => string | undefined; url: string };
}): boolean {
  const xff = c.req.header('x-forwarded-for');
  if (xff) return false; // 反代场景视作非 loopback
  try {
    const url = new URL(c.req.url);
    const host = url.hostname;
    return host === '127.0.0.1' || host === '::1' || host === 'localhost';
  } catch {
    return false;
  }
}

/** 创建 token 入参：label 必填、长度 1-80；scope 当前仅 'full'（DB 兼容预留其他枚举） */
const createTokenSchema = z.object({
  label: z.string().trim().min(1, 'label is required').max(80, 'label too long (max 80 chars)'),
  scope: z.enum(TOKEN_SCOPES as unknown as [string, ...string[]]).optional(),
});

/** :id 路径参数：正整数 */
const idParamSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, 'id must be a positive integer')
    .transform((s) => Number(s))
    .refine((n) => Number.isInteger(n) && n > 0, 'id must be a positive integer'),
});

/** 远程模式开关入参 */
const remoteModeSchema = z.object({
  enabled: z.boolean(),
  /** 关闭时是否同时撤销所有远程 token；启用时忽略 */
  revokeAllTokens: z.boolean().optional(),
});

authRouter.get('/api/auth/tokens', (c) => {
  const includeRevoked = c.req.query('include_revoked') === '1';
  const tokens = listRemoteTokens({ includeRevoked });
  return c.json({ tokens });
});

authRouter.post('/api/auth/tokens', async (c) => {
  const v = await validateBody(c, createTokenSchema);
  if (!v.ok) return v.response;

  try {
    const created = createRemoteToken({
      label: v.data.label,
      scope: v.data.scope as 'full' | undefined,
    });
    recordEvent({
      category: 'auth.token.created',
      status: 'ok',
      meta: { tokenId: created.id, scope: created.scope, label: created.label },
    });
    return c.json(
      {
        id: created.id,
        label: created.label,
        scope: created.scope,
        createdAt: created.createdAt,
        lastUsedAt: created.lastUsedAt,
        revokedAt: created.revokedAt,
        // 明文 token 仅本次返回；前端必须提示用户保存
        token: created.token,
      },
      201
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ detail: msg, code: 'VALIDATION_FAILED' }, 400);
  }
});

authRouter.delete('/api/auth/tokens/:id', (c) => {
  const v = validateParam(c, idParamSchema);
  if (!v.ok) return v.response;
  const id = v.data.id;
  const changed = revokeRemoteToken(id);
  if (changed) {
    recordEvent({
      category: 'auth.token.revoked',
      status: 'ok',
      meta: { tokenId: id },
    });
  }
  return c.json({ ok: true, revoked: changed });
});

/** 主密钥状态（前端 Settings/Security 用） */
authRouter.get('/api/auth/master-key/status', (c) => {
  return c.json({ status: getMasterKeyStatus() });
});

/**
 * 取本机 token：仅允许 loopback 来源访问（防止远程客户端直接拿走本机 token）。
 * 桌面端正常路径走 Tauri `get_local_token` 命令；本端点是 Web 模式（dev / browser）的兜底。
 */
authRouter.get('/api/auth/local-token', (c) => {
  if (!isLoopbackRequest(c)) {
    return c.json({ detail: 'local-token only available from loopback', code: 'AUTH_DENIED' }, 403);
  }
  const path = join(settings.dataDir, 'auth', 'local-token');
  if (!existsSync(path)) {
    return c.json({ detail: 'local token not initialized', code: 'NOT_INITIALIZED' }, 404);
  }
  const token = readFileSync(path, 'utf8').trim();
  return c.json({ token });
});

/** 重置本机 token —— 旧 token 立刻失效；前端需重新拿 */
authRouter.post('/api/auth/local-token/reset', (c) => {
  if (!isLoopbackRequest(c)) {
    return c.json({ detail: 'local-token reset only from loopback', code: 'AUTH_DENIED' }, 403);
  }
  const token = resetLocalToken();
  recordEvent({
    category: 'auth.token.created',
    status: 'ok',
    meta: { kind: 'local-token-reset' },
  });
  return c.json({ token });
});

authRouter.get('/api/auth/remote-mode', (c) => {
  return c.json({ enabled: readRemoteFlag() });
});

authRouter.post('/api/auth/remote-mode', async (c) => {
  const v = await validateBody(c, remoteModeSchema);
  if (!v.ok) return v.response;
  const { enabled, revokeAllTokens } = v.data;

  writeRemoteFlag(enabled);

  let revoked = 0;
  if (!enabled && revokeAllTokens) {
    for (const t of listRemoteTokens()) {
      if (revokeRemoteToken(t.id)) {
        revoked += 1;
        recordEvent({
          category: 'auth.token.revoked',
          status: 'ok',
          meta: { tokenId: t.id, reason: 'remote-mode-disabled' },
        });
      }
    }
  }

  // 启用时确保本机 token 文件存在
  if (enabled) {
    ensureLocalToken();
  }

  return c.json({ enabled, revokedTokens: revoked });
});
