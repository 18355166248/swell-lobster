import { Hono } from 'hono';
import { z } from 'zod';

import {
  getSandboxConfig,
  setSandboxMode,
  addAllowlistRule,
  removeAllowlistRule,
} from '../../store/sandboxConfig.js';
import { validateBody } from '../utils/validate.js';

export const configSandboxRouter = new Hono();

const patchModeSchema = z.object({
  mode: z.enum(['open', 'allowlist']),
});

const addRuleSchema = z.object({
  rule: z.string().trim().min(1).max(253),
});

configSandboxRouter.get('/api/config/sandbox', (c) => {
  return c.json(getSandboxConfig());
});

configSandboxRouter.patch('/api/config/sandbox', async (c) => {
  const v = await validateBody(c, patchModeSchema);
  if (!v.ok) return v.response;

  setSandboxMode(v.data.mode);
  return c.json(getSandboxConfig());
});

configSandboxRouter.post('/api/config/sandbox/allowlist', async (c) => {
  const v = await validateBody(c, addRuleSchema);
  if (!v.ok) return v.response;

  addAllowlistRule(v.data.rule);
  return c.json(getSandboxConfig());
});

configSandboxRouter.delete('/api/config/sandbox/allowlist/:rule', (c) => {
  const rule = decodeURIComponent(c.req.param('rule'));
  if (!rule.trim()) {
    return c.json({ detail: 'rule is required' }, 400);
  }
  removeAllowlistRule(rule);
  return c.json(getSandboxConfig());
});
