export class AppError extends Error {
  constructor(
    public readonly detail: string,
    public readonly code?: string,
    public readonly httpStatus: number = 400
  ) {
    super(detail);
    this.name = 'AppError';
  }
}

export const ErrorCode = {
  TOOL_APPROVAL_TIMEOUT: 'TOOL_APPROVAL_TIMEOUT',
  TOOL_POLICY_DENIED: 'TOOL_POLICY_DENIED',
  DELEGATE_TIMEOUT: 'DELEGATE_TIMEOUT',
  PLAN_STEP_FAILED: 'PLAN_STEP_FAILED',
  MCP_SERVER_UNAVAILABLE: 'MCP_SERVER_UNAVAILABLE',
} as const

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode]
