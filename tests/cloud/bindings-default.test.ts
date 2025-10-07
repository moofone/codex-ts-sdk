import { describe, it, expect } from 'vitest';

import { getCloudBindings, toNativeApplyParams, toNativeConfig } from '../../src/cloud/internal/bindings';
import { CloudTasksError } from '../../src/cloud/errors';

describe('internal/bindings default (unimplemented) paths', () => {
  const prevSkip = process.env.CODEX_SKIP_NATIVE;
  beforeAll(() => {
    process.env.CODEX_SKIP_NATIVE = '1';
  });
  afterAll(() => {
    if (prevSkip === undefined) {
      delete process.env.CODEX_SKIP_NATIVE;
    } else {
      process.env.CODEX_SKIP_NATIVE = prevSkip;
    }
  });

  it('toNativeConfig maps fields', () => {
    const n = toNativeConfig({ baseUrl: 'https://x', bearerToken: 't', chatGptAccountId: 'a', userAgent: 'ua', mock: true });
    expect(n).toMatchObject({
      base_url: 'https://x',
      baseUrl: 'https://x',
      bearer_token: 't',
      bearerToken: 't',
      chatgpt_account_id: 'a',
      chatGptAccountId: 'a',
      user_agent: 'ua',
      userAgent: 'ua',
      mock: true,
    });
  });

  it('toNativeApplyParams maps options', () => {
    const n = toNativeApplyParams('t1', { diffOverride: 'd', dryRun: true });
    expect(n).toEqual({ taskId: 't1', diffOverride: 'd', preflight: true });
  });

  it('getCloudBindings throws UNIMPLEMENTED by default', async () => {
    const b = getCloudBindings();
    await expect(b.list({ base_url: 'https://x' }, undefined)).rejects.toBeInstanceOf(CloudTasksError);
  });
});
