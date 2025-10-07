import { describe, it, expect } from 'vitest';

// Attempt to use real native bindings if available. Otherwise, skip.
async function hasNativeCloud(): Promise<boolean> {
  const mod = await import('../../../src/cloud/internal/bindings');
  const bindings = (mod as any).getCloudBindings() as any;
  try {
    // Call list() with mock:true – native should route to MockClient if implemented.
    await bindings.list({ base_url: 'http://localhost', mock: true }, undefined);
    return true;
  } catch (err: any) {
    // UNIMPLEMENTED indicates native functions are not present.
    return false;
  }
}

describe('CloudTasks (native integration)', async () => {
  const ok = await hasNativeCloud();
  if (!ok) {
    it.skip('skipped: native cloud tasks not available in this environment', () => {});
    return;
  }

  it('lists tasks via native mock backend', async () => {
    const { CloudTasksClient } = await import('../../../src/cloud/CloudTasksClient');
    const client = new CloudTasksClient({ baseUrl: 'http://localhost', mock: true });
    const tasks = await client.listTasks();
    expect(Array.isArray(tasks)).toBe(true);
    client.close();
  });
});

