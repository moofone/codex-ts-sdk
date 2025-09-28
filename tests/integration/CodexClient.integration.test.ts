import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CodexClient } from '../../src/client/CodexClient';
import type { TokenCountEventMessage } from '../../src/types/events';
import {
  configureMockNative,
  resetMockNative,
  getMockModulePath,
  createMockEvent,
  getRecordedSubmissions,
} from './mockNativeHarness';

async function collectEvents(client: CodexClient): Promise<string[]> {
  const events: string[] = [];
  for await (const event of client.events()) {
    events.push(event.msg.type);
  }
  return events;
}

describe('CodexClient (integration)', () => {
  beforeEach(() => {
    resetMockNative();
  });

  afterEach(async () => {
    resetMockNative();
  });

  it('streams responses end-to-end via mock native module', async () => {
    configureMockNative({
      onSubmit: async (submission, session) => {
        if (submission.op.type === 'user_turn') {
          session.enqueue(createMockEvent('response_started'));
          session.enqueue(createMockEvent('response_delta', { delta: 'Hel' }));
          session.enqueue(createMockEvent('response_delta', { delta: 'lo' }));
          session.enqueue(createMockEvent('response_completed', { text: 'Hello' }));
          session.end();
        }
      },
    });

    const client = new CodexClient({
      codexHome: '/tmp/codex',
      nativeModulePath: getMockModulePath(),
    });

    await client.createConversation();

    const streamPromise = collectEvents(client);

    await client.sendUserTurn('Say hello');

    const events = await streamPromise;
    expect(events).toEqual([
      'response_started',
      'response_delta',
      'response_delta',
      'response_completed',
    ]);

    const submissions = getRecordedSubmissions();
    expect(submissions).toHaveLength(1);
    expect(submissions[0].op.type).toBe('user_turn');

    await client.close();
  });

  it('emits approval requests and records approval decisions', async () => {
    configureMockNative({
      onSubmit: async (submission, session) => {
        switch (submission.op.type) {
          case 'user_turn':
            session.enqueue(
              createMockEvent('exec_approval_request', {
                id: 'approval-1',
                command: 'ls',
              }),
            );
            break;
          case 'exec_approval':
            session.enqueue(createMockEvent('response_started'));
            session.enqueue(createMockEvent('response_delta', { delta: 'approved' }));
            session.enqueue(createMockEvent('response_completed', { text: 'approved' }));
            session.end();
            break;
          default:
            break;
        }
      },
    });

    const client = new CodexClient({
      codexHome: '/tmp/codex',
      nativeModulePath: getMockModulePath(),
    });

    await client.createConversation();

    const streamPromise = collectEvents(client);
    const approvalPromise = new Promise<{ id: string }>((resolve) => {
      client.once('execCommandApproval', (msg) => {
        resolve(msg as { id: string });
      });
    });

    await client.sendUserTurn('Request approval');

    const approval = await approvalPromise;
    expect(approval.id).toBe('approval-1');

    await client.respondToExecApproval(approval.id, 'approve');

    const events = await streamPromise;
    expect(events).toEqual(['exec_approval_request', 'response_started', 'response_delta', 'response_completed']);

    const submissions = getRecordedSubmissions();
    expect(submissions.map((entry) => entry.op.type)).toEqual(['user_turn', 'exec_approval']);

    await client.close();
  });

  it('submits user messages and streams notifications from the harness', async () => {
    configureMockNative({
      onSubmit: async (submission, session) => {
        if (submission.op.type === 'user_input') {
          session.enqueue(createMockEvent('response_started'));
          session.enqueue(createMockEvent('response_delta', { delta: 'Ping' }));
          session.enqueue(createMockEvent('response_completed', { text: 'Ping' }));
          session.end();
        }
      },
    });

    const client = new CodexClient({
      codexHome: '/tmp/codex',
      nativeModulePath: getMockModulePath(),
    });

    await client.createConversation();

    const eventsPromise = collectEvents(client);

    await client.sendMessage('Trigger user input');

    const events = await eventsPromise;
    expect(events).toEqual(['response_started', 'response_delta', 'response_completed']);

    const submissions = getRecordedSubmissions();
    expect(submissions).toHaveLength(1);
    expect(submissions[0].op.type).toBe('user_input');

    await client.close();
  });

  it('submits interrupt operations and closes the stream on shutdown', async () => {
    configureMockNative({
      onSubmit: async (submission, session) => {
        if (submission.op.type === 'interrupt') {
          session.enqueue(createMockEvent('shutdown', { reason: 'client_request' }));
          session.end();
        }
      },
    });

    const client = new CodexClient({
      codexHome: '/tmp/codex',
      nativeModulePath: getMockModulePath(),
    });

    await client.createConversation();

    const eventsPromise = collectEvents(client);

    await client.interruptConversation();

    const events = await eventsPromise;
    expect(events).toEqual(['shutdown']);

    const submissions = getRecordedSubmissions();
    expect(submissions).toHaveLength(1);
    expect(submissions[0].op.type).toBe('interrupt');

    await client.close();
  });

  it('submits patch approvals after receiving requests from the runtime', async () => {
    configureMockNative({
      onSubmit: async (submission, session) => {
        switch (submission.op.type) {
          case 'user_turn':
            session.enqueue(
              createMockEvent('apply_patch_approval_request', {
                id: 'patch-1',
                patches: [],
              }),
            );
            break;
          case 'patch_approval':
            session.enqueue(createMockEvent('response_started'));
            session.enqueue(createMockEvent('response_completed', { text: 'patched' }));
            session.end();
            break;
          default:
            break;
        }
      },
    });

    const client = new CodexClient({
      codexHome: '/tmp/codex',
      nativeModulePath: getMockModulePath(),
    });

    await client.createConversation();

    const streamPromise = collectEvents(client);
    const approvalPromise = new Promise<{ id: string }>((resolve) => {
      client.once('applyPatchApproval', (msg) => {
        resolve(msg as { id: string });
      });
    });

    await client.sendUserTurn('Request patch approval');

    const approval = await approvalPromise;
    expect(approval.id).toBe('patch-1');

    await client.respondToPatchApproval(approval.id, 'approve');

    const events = await streamPromise;
    expect(events).toEqual(['apply_patch_approval_request', 'response_started', 'response_completed']);

    const submissions = getRecordedSubmissions();
    expect(submissions.map((entry) => entry.op.type)).toEqual(['user_turn', 'patch_approval']);

    await client.close();
  });

  it('emits lifecycle events and surfaces status information', async () => {
    configureMockNative({
      initialEvents: [
        createMockEvent('session_configured', {
          session_id: 'session-1',
          model: 'gpt-5-codex',
          reasoning_effort: 'medium',
          history_log_id: 1,
          history_entry_count: 0,
          rollout_path: '/tmp/rollout.json',
        }),
        createMockEvent('session.created', {
          session_id: 'session-1',
        }),
        createMockEvent('token_count', {
          rate_limits: {
            primary: {
              used_percent: 12.5,
              window_minutes: 300,
              resets_in_seconds: 1200,
            },
            secondary: {
              used_percent: 40,
              window_minutes: 7 * 24 * 60,
              resets_in_seconds: 172800,
            },
          },
          info: {
            total_token_usage: {
              input_tokens: 10,
              cached_input_tokens: 0,
              output_tokens: 5,
              reasoning_output_tokens: 0,
              total_tokens: 15,
            },
            last_token_usage: {
              input_tokens: 10,
              cached_input_tokens: 0,
              output_tokens: 5,
              reasoning_output_tokens: 0,
              total_tokens: 15,
            },
            model_context_window: 32000,
          },
        }),
      ],
      onSubmit: async (submission, session) => {
        switch (submission.op.type) {
          case 'user_turn':
            session.enqueue(createMockEvent('task_started', {
              model_context_window: 32000,
            }));
            session.enqueue(createMockEvent('turn.started', {}));
            session.enqueue(
              createMockEvent('token_count', {
                rate_limits: {
                  primary: {
                    used_percent: 25,
                    window_minutes: 300,
                    resets_in_seconds: 900,
                  },
                  secondary: {
                    used_percent: 45,
                    window_minutes: 7 * 24 * 60,
                    resets_in_seconds: 172800,
                  },
                },
                info: {
                  total_token_usage: {
                    input_tokens: 30,
                    cached_input_tokens: 0,
                    output_tokens: 25,
                    reasoning_output_tokens: 0,
                    total_tokens: 55,
                  },
                  last_token_usage: {
                    input_tokens: 20,
                    cached_input_tokens: 0,
                    output_tokens: 15,
                    reasoning_output_tokens: 0,
                    total_tokens: 35,
                  },
                  model_context_window: 32000,
                },
              }),
            );
            session.enqueue(
              createMockEvent('turn.completed', {
                usage: {
                  input_tokens: 20,
                  cached_input_tokens: 0,
                  output_tokens: 15,
                },
              }),
            );
            session.enqueue(
              createMockEvent('task_complete', {
                last_agent_message: '1 + 1 = 2.',
              }),
            );
            break;
          case 'status':
            session.enqueue(
              createMockEvent('token_count', {
                rate_limits: {
                  primary: {
                    used_percent: 30,
                    window_minutes: 300,
                    resets_in_seconds: 800,
                  },
                  secondary: {
                    used_percent: 50,
                    window_minutes: 7 * 24 * 60,
                    resets_in_seconds: 172800,
                  },
                },
                info: {
                  total_token_usage: {
                    input_tokens: 50,
                    cached_input_tokens: 0,
                    output_tokens: 35,
                    reasoning_output_tokens: 0,
                    total_tokens: 85,
                  },
                  last_token_usage: {
                    input_tokens: 20,
                    cached_input_tokens: 0,
                    output_tokens: 10,
                    reasoning_output_tokens: 0,
                    total_tokens: 30,
                  },
                  model_context_window: 32000,
                },
              }),
            );
            break;
          default:
            break;
        }
      },
    });

    const client = new CodexClient({
      codexHome: '/tmp/codex',
      nativeModulePath: getMockModulePath(),
    });

    const sessionCreated: string[] = [];
    const turnStarts: number[] = [];
    const turnOutputs: number[] = [];
    const tokenPercents: number[] = [];
    const taskStartedWindows: Array<number | undefined> = [];
    const taskCompleteMessages: Array<string | undefined> = [];

    client.on('sessionCreated', (event) => {
      sessionCreated.push(event.session_id);
    });
    client.on('turnStarted', () => {
      turnStarts.push(Date.now());
    });
    client.on('turnCompleted', (event) => {
      turnOutputs.push(event.usage.output_tokens);
    });
    client.on('tokenCount', (event) => {
      tokenPercents.push(event.rate_limits?.primary?.used_percent ?? 0);
    });
    client.on('taskStarted', (event) => {
      taskStartedWindows.push(event.model_context_window);
    });
    client.on('taskComplete', (event) => {
      taskCompleteMessages.push(event.last_agent_message);
    });

    await client.createConversation();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sessionCreated).toEqual(['session-1']);
    expect(tokenPercents).toEqual([12.5]);

    const turnCompleted = new Promise<void>((resolve) => {
      client.once('turnCompleted', () => resolve());
    });
    const taskStarted = new Promise<void>((resolve) => {
      client.once('taskStarted', () => resolve());
    });
    const taskCompleted = new Promise<void>((resolve) => {
      client.once('taskComplete', () => resolve());
    });

    await client.sendUserTurn('compute 1+1');
    await Promise.all([turnCompleted, taskStarted, taskCompleted]);

    expect(turnStarts).toHaveLength(1);
    expect(turnOutputs).toEqual([15]);
    expect(tokenPercents).toEqual([12.5, 25]);
    expect(taskStartedWindows).toEqual([32000]);
    expect(taskCompleteMessages).toEqual(['1 + 1 = 2.']);

    const snapshotBeforeRefresh = await client.getStatus({ refresh: false });
    expect(snapshotBeforeRefresh.rate_limits?.primary?.used_percent).toBe(25);
    expect(snapshotBeforeRefresh.model).toBe('gpt-5-codex');
    expect(snapshotBeforeRefresh.reasoning_effort).toBe('medium');
    expect(snapshotBeforeRefresh.history_log_id).toBe(1);
    expect(snapshotBeforeRefresh.rollout_path).toBe('/tmp/rollout.json');
    expect(snapshotBeforeRefresh.last_agent_message).toBe('1 + 1 = 2.');
    expect(snapshotBeforeRefresh.model_context_window).toBe(32000);
    expect(snapshotBeforeRefresh.rate_limit_windows?.primary?.short_label).toBe('5h');
    expect(snapshotBeforeRefresh.rate_limit_windows?.secondary?.short_label).toBe('weekly');

    const refreshComplete = new Promise<void>((resolve) => {
      const handler = (event: TokenCountEventMessage) => {
        if (event.rate_limits?.primary?.used_percent === 30) {
          client.off('tokenCount', handler);
          resolve();
        }
      };
      client.on('tokenCount', handler);
    });

    await client.getStatus();
    await refreshComplete;

    const refreshedStatus = await client.getStatus({ refresh: false });
    expect(refreshedStatus.rate_limits?.primary?.used_percent).toBe(30);
    expect(refreshedStatus.usage?.total_token_usage.total_tokens).toBe(85);
    expect(refreshedStatus.last_agent_message).toBe('1 + 1 = 2.');
    expect(refreshedStatus.model_context_window).toBe(32000);
    expect(refreshedStatus.rate_limit_windows?.primary?.used_percent).toBe(30);
    expect(refreshedStatus.rate_limit_windows?.secondary?.used_percent).toBe(50);

    const submissions = getRecordedSubmissions();
    expect(submissions.map((entry) => entry.op.type)).toEqual(['user_turn', 'status']);

    await client.close();
  });
});
