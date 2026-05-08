/**
 * 阶段 15a-1：远程访问令牌的 REST CRUD
 *
 * - GET    /api/auth/tokens               列出未撤销 token（?include_revoked=1 时包含）
 * - POST   /api/auth/tokens               创建远程 token，**仅本次返回明文**
 * - DELETE /api/auth/tokens/:id           撤销 token（幂等）
 *
 * 中间件鉴权由 15a-2 落地，本路由暂未挂保护；上线时会被 `requireAuthToken` 包住。
 */

import { Hono } from 'hono';

import {
  createRemoteToken,
  listRemoteTokens,
  revokeRemoteToken,
  type TokenScope,
} from '../../auth/tokenStore.js';
import { recordEvent } from '../../observability/traceStore.js';

export const authRouter = new Hono();

interface CreateBody {
  label?: unknown;
  scope?: unknown;
}

authRouter.get('/api/auth/tokens', (c) => {
  const includeRevoked = c.req.query('include_revoked') === '1';
  const tokens = listRemoteTokens({ includeRevoked });
  return c.json({ tokens });
});

authRouter.post('/api/auth/tokens', async (c) => {
  const raw = (await c.req.json().catch(() => ({}))) as CreateBody;
  const label = typeof raw.label === 'string' ? raw.label.trim() : '';
  if (!label) {
    return c.json({ detail: 'label is required', code: 'VALIDATION_FAILED' }, 400);
  }
  const scopeInput = raw.scope;
  const scope: TokenScope | undefined =
    scopeInput === undefined ? undefined : (scopeInput as TokenScope);
  if (scope !== undefined && scope !== 'full') {
    return c.json(
      { detail: `scope must be 'full' (other values reserved)`, code: 'VALIDATION_FAILED' },
      400
    );
  }

  try {
    const created = createRemoteToken({ label, scope });
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
  const idParam = c.req.param('id');
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ detail: 'invalid id', code: 'VALIDATION_FAILED' }, 400);
  }
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
