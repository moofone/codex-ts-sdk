import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ApplyOutcome } from '../../src/types/cloud-tasks';

// Mock the internal bindings to provide a fake backend
const sampleTasks = [
  {
    id: 't1',
    title: 'Add feature',
    status: 'ready',
    updated_at: new Date('2025-01-01T00:00:00Z').toISOString(),
    environment_id: 'env-1',
    environment_label: 'Prod',
    summary: { files_changed: 2, lines_added: 10, lines_removed: 1 },
    is_review: false,
    attempt_total: 2,
  },
];

const taskText = {
  prompt: 'Do the thing',
  messages: ['ok'],
  turn_id: 'turn-1',
  sibling_turn_ids: ['turn-1', 'turn-2'],
  attempt_placement: 0,
  attempt_status: 'completed',
};

const attempts = [
  { turn_id: 'turn-1', attempt_placement: 0, status: 'completed', messages: ['a'], diff: 'diff --git a b' },
  { turn_id: 'turn-2', attempt_placement: 1, status: 'failed', messages: ['b'] },
];

const applySuccess: ApplyOutcome = {
  applied: true,
  status: 'success',
  message: 'applied',
  skippedPaths: [],
  conflictPaths: [],
};

vi.mock('../../src/cloud/internal/bindings', () => {
  let listImpl = vi.fn(async () => sampleTasks);
  const create = vi.fn(async () => ({ id: 'new-1' }));
  let getDiffImpl = vi.fn(async () => 'diff --git a b');
  let getMessagesImpl = vi.fn(async () => ['m1', 'm2']);
  let getTextImpl = vi.fn(async () => taskText);
  let applyImpl = vi.fn(async (_c: any, _id: string, _o?: string, preflight?: boolean) => ({
    applied: !preflight,
    status: preflight ? 'success' : 'success',
    message: preflight ? 'ok (dry)' : 'ok',
    skipped_paths: [],
    conflict_paths: [],
  }));
  let listAttemptsImpl = vi.fn(async () => attempts);
  let listEnvironmentsImpl = vi.fn(async () => ([
    { id: 'aaaabbbbccccdddd11112222333344445555', label: 'example/repo-one', is_pinned: true },
    { id: 'eeeeffffgggghhhhiiiijjjjkkkkllll', label: 'example/repo-two' },
  ]));

  return {
    getCloudBindings: () => ({
      list: (...args: any[]) => listImpl(...args),
      listEnvironments: (...args: any[]) => listEnvironmentsImpl(...args),
      create,
      getDiff: (...args: any[]) => getDiffImpl(...args),
      getMessages: (...args: any[]) => getMessagesImpl(...args),
      getText: (...args: any[]) => getTextImpl(...args),
      apply: (...args: any[]) => applyImpl(...args),
      listAttempts: (...args: any[]) => listAttemptsImpl(...args),
    }),
    toNativeApplyParams: (taskId: string, options?: { diffOverride?: string; dryRun?: boolean }) => ({
      taskId,
      diffOverride: options?.diffOverride,
      preflight: options?.dryRun === true,
    }),
    toNativeConfig: (o: any) => ({
      base_url: o.baseUrl,
      bearer_token: o.bearerToken,
      chatgpt_account_id: o.chatGptAccountId,
      user_agent: o.userAgent,
      mock: o.mock,
    }),
    // Allow tests to toggle error behaviour
    __setApplyImpl: (fn: any) => (applyImpl = fn),
    __setListAttemptsImpl: (fn: any) => (listAttemptsImpl = fn),
    __setGetTextImpl: (fn: any) => (getTextImpl = fn),
    __setListImpl: (fn: any) => (listImpl = fn),
    __setGetDiffImpl: (fn: any) => (getDiffImpl = fn),
    __setGetMessagesImpl: (fn: any) => (getMessagesImpl = fn),
    __setListEnvironmentsImpl: (fn: any) => (listEnvironmentsImpl = fn),
  };
});

import { CloudTasksClient } from '../../src/cloud/CloudTasksClient';
import * as bindings from '../../src/cloud/internal/bindings';

describe('CloudTasksClient (mock bindings)', () => {
  const base = { baseUrl: 'https://api.example.com', bearerToken: 't' };

  it('lists tasks and applies limit', async () => {
    const client = new CloudTasksClient(base);
    const tasks = await client.listTasks({ limit: 1 });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('t1');
    expect(tasks[0].updatedAt).toBeInstanceOf(Date);
    client.close();
  });

  it('creates a task', async () => {
    const client = new CloudTasksClient(base);
    const created = await client.createTask({ environmentId: 'env', prompt: 'p', gitRef: 'main' });
    expect(created.id).toBe('new-1');
    client.close();
  });

  it('gets diff, messages, text and attempts', async () => {
    const client = new CloudTasksClient(base);
    expect(await client.getTaskDiff('t1')).toContain('diff --git');
    expect(await client.getTaskMessages('t1')).toEqual(['m1', 'm2']);
    const text = await client.getTaskText('t1');
    expect(text.turnId).toBe('turn-1');
    const sibs = await client.listSiblingAttempts('t1', 'turn-1');
    expect(sibs).toHaveLength(2);
    client.close();
  });

  it('runs preflight and then apply', async () => {
    const client = new CloudTasksClient(base);
    const pre = await client.applyTaskPreflight('t1');
    expect(pre.applied).toBe(false);
    const res = await client.applyTask('t1', { diffOverride: 'diff --git a b' });
    expect(res.applied).toBe(true);
    client.close();
  });

  it('validates createTask inputs', async () => {
    const client = new CloudTasksClient(base);
    // @ts-expect-error
    await expect(client.createTask({ prompt: 'p', gitRef: 'main' })).rejects.toThrow(/environmentId/);
    client.close();
  });

  it('listTasks passes environmentId filter and close is idempotent', async () => {
    const client = new CloudTasksClient(base);
    const tasks = await client.listTasks({ environmentId: 'env-1' });
    expect(tasks.length).toBeGreaterThan(0);
    client.close();
    client.close();
  });

  it('wraps native errors via toCloudTasksError catch blocks', async () => {
    // Force apply() to throw
    (bindings as any).__setApplyImpl(async () => {
      const e: any = new Error('bad');
      e.code = 'HTTP';
      throw e;
    });
    // Force listAttempts() to throw
    (bindings as any).__setListAttemptsImpl(async () => {
      const e: any = new Error('bad2');
      e.code = 'IO';
      throw e;
    });

    const client = new CloudTasksClient(base);
    await expect(client.applyTask('t1')).rejects.toMatchObject({ code: 'HTTP' });
    await expect(client.listSiblingAttempts('t1', 'turn-1')).rejects.toMatchObject({ code: 'IO' });
    client.close();
  });

  it('wraps getTaskText and applyTaskPreflight errors', async () => {
    (bindings as any).__setGetTextImpl(async () => {
      const e: any = new Error('no text');
      e.code = 'MESSAGE';
      throw e;
    });
    (bindings as any).__setApplyImpl(async (_c: any, _id: string, _o?: string, preflight?: boolean) => {
      if (preflight) {
        const e: any = new Error('cannot preflight');
        e.code = 'HTTP';
        throw e;
      }
      return { applied: true, status: 'success', message: 'ok', skipped_paths: [], conflict_paths: [] };
    });

    const client = new CloudTasksClient(base);
    await expect(client.getTaskText('t1')).rejects.toMatchObject({ code: 'MESSAGE' });
    await expect(client.applyTaskPreflight('t1')).rejects.toMatchObject({ code: 'HTTP' });
    client.close();
  });

  it('lists environments and resolves label to id', async () => {
    const client = new CloudTasksClient(base);
    const envs = await client.listEnvironments();
    expect(envs.length).toBeGreaterThan(0);
    const id = await client.resolveEnvironmentId('example/repo-one');
    expect(id).toBe('aaaabbbbccccdddd11112222333344445555');
    client.close();
  });

  it('wraps listTasks, getTaskDiff and getTaskMessages errors', async () => {
    (bindings as any).__setListImpl(async () => { const e: any = new Error('x'); e.code = 'HTTP'; throw e; });
    (bindings as any).__setGetDiffImpl(async () => { const e: any = new Error('y'); e.code = 'IO'; throw e; });
    (bindings as any).__setGetMessagesImpl(async () => { const e: any = new Error('z'); e.code = 'MESSAGE'; throw e; });
    const client = new CloudTasksClient(base);
    await expect(client.listTasks()).rejects.toMatchObject({ code: 'HTTP' });
    await expect(client.getTaskDiff('t1')).rejects.toMatchObject({ code: 'IO' });
    await expect(client.getTaskMessages('t1')).rejects.toMatchObject({ code: 'MESSAGE' });
    client.close();
  });

  it('allows default baseUrl when omitted', () => {
    // Should not throw when baseUrl is omitted; client uses default
    // @ts-expect-error - testing runtime behavior
    expect(() => new CloudTasksClient({ bearerToken: 't' })).not.toThrow();
  });
});
