/**
 * 技能调用日志：写入 / 查询 skill_invocation_logs 表。
 *
 * logSkillInvocation 内部捕获异常并只打印警告，不影响技能执行主流程。
 */
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';

/** 写入日志时的输入结构（camelCase，与业务层对齐） */
export interface SkillInvocationLogEntry {
  id?: string;
  skillName: string;
  /** manual：UI / IM 手动触发；llm_call：LLM function calling 自动触发 */
  triggerType: 'manual' | 'llm_call';
  /** 调用来源：ui = 前端页面，llm = 对话内工具调用，im = IM 通道 */
  invokedBy: 'ui' | 'llm' | 'im';
  /** 传入的原始参数（JSON 序列化字符串或纯文本 context） */
  inputContext: string;
  /** LLM 返回的正文；执行失败时为 undefined */
  output?: string;
  status: 'success' | 'failed';
  errorMessage?: string;
  /** 从开始到结束的耗时（毫秒） */
  durationMs?: number;
  /** 关联的对话 session id，手动触发时可能为空 */
  sessionId?: string;
  /** 实际使用的 LLM 端点名称 */
  endpointName?: string;
  /** ISO 8601 时间戳，不传则取当前时间 */
  createdAt?: string;
}

/** 从数据库读取的原始行结构（snake_case，与表列名对齐） */
export type SkillInvocationLogRow = {
  id: string;
  skill_name: string;
  trigger_type: 'manual' | 'llm_call';
  invoked_by: 'ui' | 'llm' | 'im';
  input_context: string;
  output: string | null;
  status: 'success' | 'failed';
  error_message: string | null;
  duration_ms: number | null;
  session_id: string | null;
  endpoint_name: string | null;
  created_at: string;
};

/**
 * 写入一条技能调用日志。
 *
 * 日志记录失败只打印 console.error，不向调用方抛出异常，
 * 保证日志故障不会中断技能正常执行。
 */
export function logSkillInvocation(entry: SkillInvocationLogEntry): void {
  try {
    getDb()
      .prepare(
        `INSERT INTO skill_invocation_logs (
          id, skill_name, trigger_type, invoked_by, input_context, output, status,
          error_message, duration_ms, session_id, endpoint_name, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        entry.id ?? randomUUID(),
        entry.skillName,
        entry.triggerType,
        entry.invokedBy,
        entry.inputContext,
        entry.output ?? null,
        entry.status,
        entry.errorMessage ?? null,
        entry.durationMs ?? null,
        entry.sessionId ?? null,
        entry.endpointName ?? null,
        entry.createdAt ?? new Date().toISOString()
      );
  } catch (error) {
    console.error('[skills] failed to log invocation', error);
  }
}

/**
 * 查询调用日志，按 created_at 倒序返回。
 *
 * @param opts.skillName - 不传则返回所有技能的日志
 * @param opts.limit     - 每页条数，范围 [1, 200]，默认 50
 * @param opts.offset    - 分页偏移，默认 0
 */
export function querySkillLogs(opts?: {
  skillName?: string;
  limit?: number;
  offset?: number;
}): SkillInvocationLogRow[] {
  const skillName = opts?.skillName?.trim();
  const rawLimit = opts?.limit ?? 50;
  const rawOffset = opts?.offset ?? 0;
  // limit 上限 200，防止单次查询返回过多行；非有限数值时回退为默认值
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 200)) : 50;
  const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0;

  if (skillName) {
    // 按技能名过滤，适用于单技能历史页面
    return getDb()
      .prepare(
        `SELECT * FROM skill_invocation_logs
         WHERE skill_name = ?
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(skillName, limit, offset) as SkillInvocationLogRow[];
  }

  // 不过滤技能名，返回全局日志列表
  return getDb()
    .prepare(
      `SELECT * FROM skill_invocation_logs
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(limit, offset) as SkillInvocationLogRow[];
}
