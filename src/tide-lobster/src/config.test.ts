import { describe, expect, it } from 'vitest';

import { applyRemoteRuntimeDefaults } from './config.js';

describe('applyRemoteRuntimeDefaults', () => {
  it('enables remote runtime defaults when remote flag exists', () => {
    const env: NodeJS.ProcessEnv = {};

    applyRemoteRuntimeDefaults({
      env,
      remoteFlagExists: () => true,
    });

    expect(env.SWELL_REMOTE).toBe('1');
    expect(env.API_HOST).toBe('0.0.0.0');
  });

  it('preserves explicit API_HOST when remote mode is enabled', () => {
    const env: NodeJS.ProcessEnv = {
      SWELL_REMOTE: '1',
      API_HOST: '192.168.1.20',
    };

    applyRemoteRuntimeDefaults({
      env,
      remoteFlagExists: () => false,
    });

    expect(env.SWELL_REMOTE).toBe('1');
    expect(env.API_HOST).toBe('192.168.1.20');
  });
});
