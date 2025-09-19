import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CodexClient } from '../../src/client/CodexClient';
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
});
