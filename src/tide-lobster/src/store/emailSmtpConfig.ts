import { z } from 'zod';

import { ensureMasterKey } from '../auth/crypto.js';
import { KeyValueStore } from './keyValueStore.js';
import { decryptJsonObject, encryptJsonObject } from './secretFields.js';

const SMTP_CONFIG_KEY = 'email.smtp.config';

export const smtpConfigSchema = z.object({
  host: z.string().trim().min(1, 'host is required'),
  port: z.number().int().min(1).max(65535),
  user: z.string().trim().min(1, 'user is required'),
  password: z.string().trim().min(1, 'password is required'),
  from: z.string().trim().email('from must be a valid email'),
  secure: z.boolean(),
});

export type SmtpConfig = z.infer<typeof smtpConfigSchema>;

const store = new KeyValueStore();

function parseStoredConfig(raw: string | undefined): SmtpConfig | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const decrypted = decryptJsonObject('key_value_store', 'value', parsed, { key: SMTP_CONFIG_KEY });
    const result = smtpConfigSchema.safeParse(decrypted);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function getSmtpConfig(): SmtpConfig | null {
  return parseStoredConfig(store.getValue(SMTP_CONFIG_KEY));
}

export function saveSmtpConfig(config: SmtpConfig): void {
  ensureMasterKey();
  const encrypted = encryptJsonObject('key_value_store', 'value', config, { key: SMTP_CONFIG_KEY });
  store.setValue(SMTP_CONFIG_KEY, JSON.stringify(encrypted));
}

export function getMaskedSmtpConfig(): Omit<SmtpConfig, 'password'> & { passwordConfigured: boolean } | null {
  const raw = store.getValue(SMTP_CONFIG_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const hasPassword = typeof parsed.password === 'string' && parsed.password.length > 0;
    const config = getSmtpConfig();
    if (!config) return null;
    const { password: _password, ...rest } = config;
    return {
      ...rest,
      passwordConfigured: hasPassword,
    };
  } catch {
    return null;
  }
}
