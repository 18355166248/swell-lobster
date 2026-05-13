import { Hono } from 'hono';
import { z } from 'zod';

import {
  getMaskedSmtpConfig,
  getSmtpConfig,
  saveSmtpConfig,
  smtpConfigSchema,
} from '../../store/emailSmtpConfig.js';
import { validateBody } from '../utils/validate.js';

export const configEmailRouter = new Hono();

const smtpBodySchema = smtpConfigSchema.extend({
  password: z.string().trim().optional(),
});

configEmailRouter.get('/api/config/email-smtp', (c) => {
  return c.json({ config: getMaskedSmtpConfig() });
});

configEmailRouter.post('/api/config/email-smtp', async (c) => {
  const v = await validateBody(c, smtpBodySchema);
  if (!v.ok) return v.response;

  const existing = getSmtpConfig();
  const password = v.data.password?.trim() || existing?.password || '';
  const merged = {
    ...v.data,
    password,
  };
  const parsed = smtpConfigSchema.safeParse(merged);
  if (!parsed.success) {
    return c.json(
      {
        detail: parsed.error.issues[0]?.message ?? 'invalid smtp config',
        code: 'VALIDATION_FAILED',
        issues: parsed.error.issues,
      },
      400
    );
  }

  saveSmtpConfig(parsed.data);
  return c.json({ status: 'ok', config: getMaskedSmtpConfig() });
});
