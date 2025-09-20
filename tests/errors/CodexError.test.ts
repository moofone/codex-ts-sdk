import { describe, expect, it } from 'vitest';
import { CodexAuthError, CodexConnectionError, CodexError, CodexSessionError } from '../../src/errors/CodexError';

describe('CodexError hierarchy', () => {
  it('preserves message, code, and details', () => {
    const base = new CodexError('base', 'BASE', { info: true });
    expect(base.message).toBe('base');
    expect(base.code).toBe('BASE');
    expect(base.details).toEqual({ info: true });
    expect(base.name).toBe('CodexError');
  });

  it('provides specialised error codes', () => {
    expect(new CodexAuthError('auth').code).toBe('AUTH');
    expect(new CodexConnectionError('conn', { codexHome: '/tmp' }).details).toEqual({ codexHome: '/tmp' });
    expect(new CodexSessionError('session').code).toBe('SESSION');
  });
});
