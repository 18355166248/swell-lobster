/** env 对象 → 表单多行键值行 */
export function envToRows(env: Record<string, string>): { key: string; value: string }[] {
  return Object.entries(env).map(([key, value]) => ({ key, value }));
}

/** 表单键值行 → env 对象（空 key 跳过） */
export function envFromRows(
  rows: { key?: string; value?: string }[] | undefined
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const row of rows ?? []) {
    const k = row.key?.trim();
    if (!k) continue;
    env[k] = String(row.value ?? '').trim();
  }
  return env;
}

export function headersToText(headers: Record<string, string> | undefined): string {
  if (!headers || Object.keys(headers).length === 0) return '';
  return Object.entries(headers)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
}
