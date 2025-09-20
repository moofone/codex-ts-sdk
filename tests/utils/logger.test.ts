import { describe, expect, it, vi } from 'vitest';
import { log, resolveLogger } from '../../src/utils/logger';

describe('logger utilities', () => {
  it('returns noop logger when undefined', () => {
    const logger = resolveLogger();
    expect(() => logger.info('test')).not.toThrow();
  });

  it('fills missing methods with noop implementations', () => {
    const warn = vi.fn();
    const resolved = resolveLogger({ warn });
    resolved.warn('warning', { foo: 'bar' });
    resolved.debug('debug');
    expect(warn).toHaveBeenCalledWith('warning', { foo: 'bar' });
  });

  it('routes log calls to correct levels', () => {
    const debug = vi.fn();
    const info = vi.fn();
    const warn = vi.fn();
    const error = vi.fn();
    const partial = { debug, info, warn, error };

    log(partial, 'debug', 'd');
    log(partial, 'info', 'i');
    log(partial, 'warn', 'w');
    log(partial, 'error', 'e');
    log(partial, 'unknown' as never, 'noop');

    expect(debug).toHaveBeenCalledWith('d', undefined);
    expect(info).toHaveBeenCalledWith('i', undefined);
    expect(warn).toHaveBeenCalledWith('w', undefined);
    expect(error).toHaveBeenCalledWith('e', undefined);
  });
});
