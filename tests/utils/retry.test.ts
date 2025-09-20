import { beforeEach, describe, expect, it, vi } from 'vitest';

const delaySpy = vi.hoisted(() => vi.fn<Promise<void>, [number?]>(() => Promise.resolve()));

vi.mock('timers/promises', () => ({
  setTimeout: delaySpy,
}));

import { withRetry } from '../../src/utils/retry';

describe('withRetry', () => {
  beforeEach(() => {
    delaySpy.mockClear();
  });

  it('returns immediately on success', async () => {
    const result = await withRetry(async () => 'ok', { maxRetries: 1 }, undefined, 'test');
    expect(result).toBe('ok');
    expect(delaySpy).not.toHaveBeenCalled();
  });

  it('retries failed operations according to policy', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('success');

    const logger = { warn: vi.fn(), debug: vi.fn() };
    const result = await withRetry(operation, { maxRetries: 2, initialDelayMs: 10, backoffFactor: 2, maxDelayMs: 100 }, logger, 'retry');
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
    expect(delaySpy).toHaveBeenCalledWith(10);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('throws after exceeding retry attempts', async () => {
    const error = new Error('boom');
    const operation = vi.fn().mockRejectedValue(error);
    await expect(withRetry(operation, { maxRetries: 1 }, undefined, 'fail-op')).rejects.toBe(error);
    expect(delaySpy).toHaveBeenCalled();
  });

  it('wraps non-error failures with descriptive message', async () => {
    const operation = vi.fn().mockRejectedValue('nope');
    await expect(withRetry(operation, { maxRetries: 0 }, undefined, 'string-op')).rejects.toThrow(
      'string-op failed after 1 attempts',
    );
  });

  it('caps exponential backoff at the configured maximum delay', async () => {
    const error = new Error('still failing');
    const operation = vi.fn().mockRejectedValue(error);

    await expect(
      withRetry(operation, { maxRetries: 3, initialDelayMs: 50, backoffFactor: 2, maxDelayMs: 150 }, undefined, 'cap'),
    ).rejects.toBe(error);

    expect(delaySpy).toHaveBeenNthCalledWith(1, 50);
    expect(delaySpy).toHaveBeenNthCalledWith(2, 100);
    expect(delaySpy).toHaveBeenNthCalledWith(3, 150);
  });

  it('logs non-error retry failures when retries remain', async () => {
    const operation = vi.fn().mockRejectedValue('string error');
    const logger = { warn: vi.fn(), debug: vi.fn() };

    await expect(withRetry(operation, { maxRetries: 1, initialDelayMs: 10 }, logger, 'string-retry')).rejects.toThrow(
      'string-retry failed after 2 attempts',
    );

    expect(logger.warn).toHaveBeenCalledWith('string-retry failed', {
      attempt: 0,
      maxRetries: 1,
      error: 'string error',
    });
  });
});
