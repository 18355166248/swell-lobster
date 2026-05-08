/**
 * 阶段 15a-1：远程访问令牌的 REST CRUD
 * 阶段 15a-3：POST/DELETE 输入校验改用 zod
 *
 * - GET    /api/auth/tokens               列出未撤销 token（?include_revoked=1 时包含）
 * - POST   /api/auth/tokens               创建远程 token，**仅本次返回明文**
 * - DELETE /api/auth/tokens/:id           撤销 token（幂等）
 *
 * 中间件鉴权由 15a-2 落地，本路由暂未挂保护；上线时会被 `requireAuthToken` 包住。
 */

import { Hono } from 'hono';
import { z } from 'zod';

import {
  createRemoteToken,
  listRemoteTokens,
  revokeRemoteToken,
  TOKEN_SCOPES,
} from '../../auth/tokenStore.js';
import { recordEvent } from '../../observability/traceStore.js';
import { validateBody, validateParam } from '../utils/validate.js';

export const authRouter = new Hono();

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
