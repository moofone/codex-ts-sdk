import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { CloudTasksClientBuilder } from '../../src/cloud/CloudTasksClientBuilder';
import { CloudTasksError, CloudTasksErrorCode } from '../../src/cloud/errors';
import type { CloudTasksClient } from '../../src/cloud/CloudTasksClient';
import { getCloudBindings } from '../../src/cloud/internal/bindings';

const HAS_NATIVE = (() => {
  try {
    const bindings = getCloudBindings();
    // Attempt to call list() with mock true just to prove exports exist.
    if (typeof bindings.list !== 'function') {
      return false;
    }
    return true;
  } catch {
    return false;
  }
})();

const LIVE_ENABLED = process.env.CLOUD_LIVE === '1';

if (!LIVE_ENABLED) {
  console.warn('Skipping CloudTasks live smoke test: set CLOUD_LIVE=1 to enable.');
}
if (!HAS_NATIVE) {
  console.warn('Skipping CloudTasks live smoke test: native cloud_tasks_* exports not available.');
}

const describeIf = HAS_NATIVE && LIVE_ENABLED ? describe : describe.skip;

describeIf('CloudTasks live smoke (ChatGPT auth)', () => {
  const baseUrl = process.env.CODEX_CLOUD_TASKS_BASE_URL ?? 'https://chatgpt.com/backend-api';
  let client: CloudTasksClient;

  beforeAll(() => {
    client = new CloudTasksClientBuilder()
      .withBaseUrl(baseUrl)
      .withUserAgent('codex-ts-sdk/live-smoke/0.1.0')
      .build();
  });

  afterAll(() => {
    client?.close();
  });

  it(
    'lists tasks using CLI-managed ChatGPT auth',
    async () => {
      try {
        const tasks = await client.listTasks();
        expect(Array.isArray(tasks)).toBe(true);
        console.info(`CloudTasks live smoke: fetched ${tasks.length} tasks from ${baseUrl}`);
        for (const task of tasks.slice(0, 5)) {
          console.info(
            `[${task.id}] ${task.title} — ${task.status} (env=${task.environmentId ?? 'n/a'})`
          );
        }
      } catch (error) {
        console.warn('CloudTasks live smoke failed', error);
        const message = error instanceof Error ? error.message : String(error);
        const networkIssue = /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|Could not resolve host/i.test(message);
        if (networkIssue) {
          console.warn('Skipping due to network error:', message);
          return;
        }
        if (error instanceof CloudTasksError) {
          // Skip if unauthorized (not logged in via `codex login --chatgpt`)
          if (/401\s+Unauthorized/i.test(message) || /detail\"\s*:\s*\"Unauthorized\"/i.test(message)) {
            console.warn('Skipping: not authenticated with ChatGPT (run `codex login`).');
            return;
          }
          if (error.code === CloudTasksErrorCode.IO && /error sending request/i.test(message)) {
            console.warn('Skipping due to upstream transport error:', message);
            return;
          }
        }
        throw error;
      }
    },
    60_000
  );
});
