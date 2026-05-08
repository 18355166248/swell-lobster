/**
 * 阶段 15a-3：边界 zod 校验工具
 *
 * 统一返回结构 `{ detail, code: 'VALIDATION_FAILED', issues: [...] }`，
 * `issues` 是从 ZodError 转换而来的扁平结构（path / message / code）。
 *
 * 用法：
 * ```ts
 * import { z } from 'zod';
 * import { validateBody } from '../utils/validate.js';
 * const schema = z.object({ label: z.string().min(1).max(80) });
 * router.post('/api/foo', async (c) => {
 *   const r = await validateBody(c, schema);
 *   if (!r.ok) return r.response;
 *   const { label } = r.data; // ← 类型推断
 *   ...
 * });
 * ```
 */

import type { Context } from 'hono';
import type { ZodIssue, ZodType, ZodTypeDef } from 'zod';

export interface ValidationIssue {
  path: string;
  message: string;
  code: string;
}

export interface ValidationOk<T> {
  ok: true;
  data: T;
}

export interface ValidationFail {
  ok: false;
  /** 已序列化的 hono Response，调用方 `return r.response` 即可 */
  response: Response;
}

/**
 * 兼容 zod transform：input 类型与 output 类型可不同。
 * 用 `unknown` 作 input，让 `z.string().transform(s => Number(s))` 这种 schema 也能传入。
 */
type AnySchema<T> = ZodType<T, ZodTypeDef, unknown>;

function toIssues(zodIssues: ZodIssue[]): ValidationIssue[] {
  return zodIssues.map((i) => ({
    path: i.path.length === 0 ? '' : i.path.join('.'),
    message: i.message,
    code: i.code,
  }));
}

function buildFailureResponse(c: Context, issues: ValidationIssue[]): Response {
  const detail =
    issues.length === 0
      ? 'request body validation failed'
      : `${issues[0].path ? issues[0].path + ': ' : ''}${issues[0].message}`;
  return c.json({ detail, code: 'VALIDATION_FAILED', issues }, 400);
}

/** 解析并校验请求体（JSON）。无 body / 非法 JSON 视作空对象 → 走 schema */
export async function validateBody<T>(
  c: Context,
  schema: AnySchema<T>
): Promise<ValidationOk<T> | ValidationFail> {
  const raw = await c.req.json().catch(() => ({}));
  const parsed = schema.safeParse(raw);
  if (parsed.success) {
    return { ok: true, data: parsed.data };
  }
  const issues = toIssues(parsed.error.issues);
  return { ok: false, response: buildFailureResponse(c, issues) };
}

/** 校验 query string；hono 的 `c.req.query()` 返回 `Record<string, string>` */
export function validateQuery<T>(
  c: Context,
  schema: AnySchema<T>
): ValidationOk<T> | ValidationFail {
  const raw = c.req.query();
  const parsed = schema.safeParse(raw);
  if (parsed.success) {
    return { ok: true, data: parsed.data };
  }
  const issues = toIssues(parsed.error.issues);
  return { ok: false, response: buildFailureResponse(c, issues) };
}

/** 校验路径参数 */
export function validateParam<T>(
  c: Context,
  schema: AnySchema<T>
): ValidationOk<T> | ValidationFail {
  const raw = c.req.param();
  const parsed = schema.safeParse(raw);
  if (parsed.success) {
    return { ok: true, data: parsed.data };
  }
  const issues = toIssues(parsed.error.issues);
  return { ok: false, response: buildFailureResponse(c, issues) };
}
