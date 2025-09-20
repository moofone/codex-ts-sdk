import { beforeEach, describe, expect, it, vi } from 'vitest';

const { instances, MockCodexClient } = vi.hoisted(() => {
  const store: Array<{ close: ReturnType<typeof vi.fn> }> = [];
  class MockCodexClient {
    close = vi.fn().mockResolvedValue(undefined);

    constructor(public config: Record<string, unknown>) {
      store.push(this);
    }
  }
  return { instances: store, MockCodexClient };
});

vi.mock('../src/client/CodexClient', () => ({
  CodexClient: MockCodexClient,
}));

import { CodexClientPool } from '../src/client/CodexClientPool';

describe('CodexClientPool', () => {
  beforeEach(() => {
    instances.splice(0, instances.length);
  });

  it('creates new clients up to the max size and reuses idle instances', async () => {
    const pool = new CodexClientPool({ codexHome: '/codex' }, 2);

    const first = await pool.acquire();
    const second = await pool.acquire();

    expect(instances).toHaveLength(2);
    expect(first).not.toBe(second);

    const thirdPromise = pool.acquire();
    const waiter = vi.fn();
    void thirdPromise.then(waiter);

    pool.release(first);
    const third = await thirdPromise;

    expect(waiter).toHaveBeenCalled();
    expect(third).toBe(first);

    pool.release(second);
    pool.release(third);

    const reused = await pool.acquire();
    expect(reused).toBe(third);
    pool.release(reused);
  });

  it('wraps callback execution via withClient', async () => {
    const pool = new CodexClientPool({ codexHome: '/codex' }, 1);
    const result = await pool.withClient(async (client) => {
      expect(client).toBe(instances.at(-1));
      return 'done';
    });
    expect(result).toBe('done');
  });

  it('closes all clients on shutdown', async () => {
    const pool = new CodexClientPool({ codexHome: '/codex' }, 1);
    const client = await pool.acquire();
    pool.release(client);
    pool.release(client); // no-op for clients not busy
    await pool.close();

    expect(instances.every((c) => c.close.mock.calls.length >= 1)).toBe(true);
  });

  it('rejects pending waiters when closed', async () => {
    const pool = new CodexClientPool({ codexHome: '/codex' }, 1);
    const first = await pool.acquire();
    const pending = pool.acquire();

    const closePromise = pool.close();
    await expect(pending).rejects.toThrow('CodexClientPool is closed');
    await closePromise;

    // ensure busy client was asked to close during shutdown
    expect(instances[0]?.close).toHaveBeenCalled();

    // release after close should be harmless
    pool.release(first);
  });
});
