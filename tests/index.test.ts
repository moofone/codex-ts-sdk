import { describe, expect, it } from 'vitest';

import * as sdk from '../src';

describe('package entry point', () => {
  it('re-exports core APIs', () => {
    expect(typeof sdk.CodexClient).toBe('function');
    expect(typeof sdk.CodexClientBuilder).toBe('function');
    expect(typeof sdk.CodexClientPool).toBe('function');
    expect(typeof sdk.resolveModelVariant).toBe('function');
    expect(typeof sdk.getSupportedEfforts).toBe('function');
    expect(sdk.CodexError).toBeDefined();
  });
});
