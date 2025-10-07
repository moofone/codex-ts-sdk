import { describe, it, expect } from 'vitest';
import { CloudTasksError, CloudTasksErrorCode, toCloudTasksError } from '../../src/cloud/errors';

describe('CloudTasksError', () => {
  it('preserves code and message', () => {
    const e = new CloudTasksError('x', CloudTasksErrorCode.HTTP);
    expect(e.code).toBe('HTTP');
    expect(e.message).toBe('x');
  });

  it('maps unknown errors via toCloudTasksError', () => {
    const e = toCloudTasksError(new Error('y'));
    expect(e).toBeInstanceOf(CloudTasksError);
    expect(e.code).toBe(CloudTasksErrorCode.IO);
  });

  it('respects provided code on plain objects', () => {
    const e = toCloudTasksError({ message: 'z', code: 'UNIMPLEMENTED' });
    expect(e.code).toBe(CloudTasksErrorCode.UNIMPLEMENTED);
    expect(e.message).toBe('z');
  });

  it('falls back to provided default code for unknown codes', () => {
    const e = toCloudTasksError({ message: 'w', code: 'SOMETHING_ELSE' }, CloudTasksErrorCode.MESSAGE);
    expect(e.code).toBe(CloudTasksErrorCode.MESSAGE);
  });

  it('passes through CloudTasksError unchanged', () => {
    const src = new CloudTasksError('pass', CloudTasksErrorCode.IO);
    const out = toCloudTasksError(src);
    expect(out).toBe(src);
  });

  it('accepts string inputs and wraps to MESSAGE when requested', () => {
    const e = toCloudTasksError('string message', CloudTasksErrorCode.MESSAGE);
    expect(e.code).toBe(CloudTasksErrorCode.MESSAGE);
    expect(e.message).toBe('string message');
  });
});
