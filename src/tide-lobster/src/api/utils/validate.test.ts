import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { z } from 'zod';

import { validateBody, validateParam, validateQuery } from './validate.js';

describe('validate helpers', () => {
  it('validateBody 成功：返回类型化 data', async () => {
    const app = new Hono();
    const schema = z.object({ name: z.string().min(1), age: z.number().int().nonnegative() });
    app.post('/x', async (c) => {
      const v = await validateBody(c, schema);
      if (!v.ok) return v.response;
      return c.json({ ok: true, data: v.data });
    });
    const res = await app.request('/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'alice', age: 30 }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { name: string; age: number } };
    expect(body.data).toEqual({ name: 'alice', age: 30 });
  });

  it('validateBody 失败：返回 400 + VALIDATION_FAILED + issues', async () => {
    const app = new Hono();
    const schema = z.object({ name: z.string().min(1), age: z.number().int() });
    app.post('/x', async (c) => {
      const v = await validateBody(c, schema);
      if (!v.ok) return v.response;
      return c.json({ ok: true });
    });
    const res = await app.request('/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '', age: 'not-a-number' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      code: string;
      issues: { path: string; message: string }[];
    };
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.issues.length).toBeGreaterThanOrEqual(2);
    const paths = body.issues.map((i) => i.path).sort();
    expect(paths).toContain('age');
    expect(paths).toContain('name');
  });

  it('validateBody：非法 JSON 视作空对象走 schema 校验', async () => {
    const app = new Hono();
    const schema = z.object({ required: z.string() });
    app.post('/x', async (c) => {
      const v = await validateBody(c, schema);
      if (!v.ok) return v.response;
      return c.json({ ok: true });
    });
    const res = await app.request('/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not-json',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('VALIDATION_FAILED');
  });

  it('validateQuery：query 字符串校验', async () => {
    const app = new Hono();
    const schema = z.object({ limit: z.string().regex(/^\d+$/) });
    app.get('/x', (c) => {
      const v = validateQuery(c, schema);
      if (!v.ok) return v.response;
      return c.json({ limit: v.data.limit });
    });
    const ok = await app.request('/x?limit=20');
    expect(ok.status).toBe(200);

    const bad = await app.request('/x?limit=abc');
    expect(bad.status).toBe(400);
    const body = (await bad.json()) as { code: string };
    expect(body.code).toBe('VALIDATION_FAILED');
  });

  it('validateParam：路径参数校验', async () => {
    const app = new Hono();
    const schema = z.object({ id: z.string().regex(/^\d+$/) });
    app.get('/x/:id', (c) => {
      const v = validateParam(c, schema);
      if (!v.ok) return v.response;
      return c.json({ id: v.data.id });
    });
    const ok = await app.request('/x/42');
    expect(ok.status).toBe(200);

    const bad = await app.request('/x/abc');
    expect(bad.status).toBe(400);
  });
});
