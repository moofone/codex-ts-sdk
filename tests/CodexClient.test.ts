import { beforeEach, describe, expect, it, vi } from 'vitest';
import os from 'os';
import path from 'path';
import type { Mock } from 'vitest';

type AsyncEventMock = Mock<() => Promise<string | null>>;

let createConversationMock: Mock;
let submitMock: Mock;
let nextEventMock: AsyncEventMock;
let closeMock: Mock;
const nativeOptions: Array<{ codexHome?: string }> = [];

vi.mock('../src/internal/nativeModule', async () => {
  const actual = await vi.importActual<typeof import('../src/internal/nativeModule')>(
    '../src/internal/nativeModule',
  );

  return {
    ...actual,
    loadNativeModule: vi.fn(() => ({
      NativeCodex: class {
        options?: { codexHome?: string };

        constructor(options?: { codexHome?: string }) {
          this.options = options;
          nativeOptions.push(options ?? {});
        }

        createConversation(params?: unknown) {
          return createConversationMock(params);
        }

        getAuthMode() {
          return 'test';
        }
      },
      version: () => 'test-version',
    })),
  };
});

import { CodexClient } from '../src/client/CodexClient';
import type { CodexClientConfig } from '../src/types/options';

interface SessionHandle {
  conversationId: string;
  submit: Mock;
  nextEvent: AsyncEventMock;
  close: Mock;
}

let session: SessionHandle;

function createClient(config: Partial<CodexClientConfig> = {}): CodexClient {
  return new CodexClient({ codexHome: '/tmp/codex', ...config });
}

beforeEach(() => {
  nativeOptions.splice(0, nativeOptions.length);
  createConversationMock = vi.fn();
  submitMock = vi.fn();
  nextEventMock = vi.fn();
  closeMock = vi.fn();
  session = {
    conversationId: 'conv-123',
    submit: submitMock,
    nextEvent: nextEventMock,
    close: closeMock,
  };
  createConversationMock.mockResolvedValue(session);
  submitMock.mockResolvedValue(undefined);
  closeMock.mockResolvedValue(undefined);
});

describe('CodexClient', () => {
  it('connects with resolved codexHome', async () => {
    const client = createClient({ codexHome: '~/codex-home' });
    await client.createConversation({ overrides: { model: 'gpt-5-codex' } });

    const resolvedHome = path.join(os.homedir(), 'codex-home');
    expect(nativeOptions[0]).toEqual({ codexHome: resolvedHome });
    expect(createConversationMock).toHaveBeenCalledWith({
      overrides: [{ key: 'model', value: 'gpt-5-codex' }],
    });

    await client.close();
  });

  it('sends user message submissions as JSON payload', async () => {
    const client = createClient();
    await client.createConversation();
    nextEventMock.mockResolvedValueOnce(null);

    await client.sendMessage('Hello world');

    const payload = JSON.parse(submitMock.mock.calls[0][0]);
    expect(payload).toMatchObject({
      op: {
        type: 'user_input',
        items: [{ type: 'text', text: 'Hello world' }],
      },
    });

    await client.close();
  });

  it('sends user turn with defaults and overrides', async () => {
    const client = createClient();
    await client.createConversation();
    nextEventMock.mockResolvedValueOnce(null);

    await client.sendUserTurn('Iterate', {
      cwd: '/tmp/project',
      approvalPolicy: 'on-request',
      sandboxPolicy: {
        mode: 'workspace-write',
        network_access: false,
        exclude_tmpdir_env_var: false,
        exclude_slash_tmp: false,
      },
      model: 'codex',
      effort: 'high',
      summary: 'detailed',
    });

    const payload = JSON.parse(submitMock.mock.calls[0][0]);
    expect(payload.op).toMatchObject({
      type: 'user_turn',
      cwd: '/tmp/project',
      approval_policy: 'on-request',
      sandbox_policy: {
        mode: 'workspace-write',
        network_access: false,
      },
      model: 'gpt-5-codex',
      effort: 'high',
      summary: 'detailed',
    });
    expect(payload.op.items[0].text).toBe('Iterate');

    await client.close();
  });

  it('provides async iterator for events', async () => {
    const client = createClient();

    nextEventMock
      .mockResolvedValueOnce(JSON.stringify(makeEvent('session_configured')))
      .mockResolvedValueOnce(JSON.stringify(makeEvent('notification', { content: 'hi' })))
      .mockResolvedValueOnce(null);

    await client.createConversation();

    const events: string[] = [];
    for await (const evt of client.events()) {
      events.push(evt.msg.type);
    }

    expect(events).toContain('notification');

    await client.close();
  });

  it('invokes plugins around submissions and events', async () => {
    const beforeSubmit = vi.fn((submission) => submission);
    const afterEvent = vi.fn();
    const onError = vi.fn();

    const client = createClient({
      plugins: [
        {
          name: 'test-plugin',
          initialize: vi.fn(),
          beforeSubmit,
          afterEvent,
          onError,
        },
      ],
    });

    nextEventMock
      .mockResolvedValueOnce(JSON.stringify(makeEvent('notification')))
      .mockRejectedValueOnce(new Error('stream-failure'));

    const streamPromise = (async () => {
      for await (const _ of client.events()) {
        // iterate to trigger rejection
      }
    })();

    await client.createConversation();
    nextEventMock.mockResolvedValueOnce(null);
    await client.sendMessage('Ping');

    await expect(streamPromise).rejects.toThrow('stream-failure');

    expect(beforeSubmit).toHaveBeenCalledTimes(1);
    expect(afterEvent).toHaveBeenCalledWith(expect.objectContaining({ msg: { type: 'notification' } }));
    expect(onError).toHaveBeenCalled();

    await client.close().catch(() => undefined);
  });

  it('closes sessions gracefully', async () => {
    const client = createClient();
    let resolveNext: ((value: string | null) => void) | undefined;
    nextEventMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveNext = resolve;
        }),
    );

    await client.createConversation();

    const closePromise = client.close();
    resolveNext?.(null);

    await closePromise;
    expect(closeMock).toHaveBeenCalled();
  });

  it('checks model availability', async () => {
    const client = createClient();
    nextEventMock.mockResolvedValueOnce(null);

    const available = await client.testModelAvailability('codex');
    expect(available).toBe(true);
  });
});

function makeEvent(type: string, extra: Record<string, unknown> = {}) {
  return {
    id: 'evt-1',
    msg: {
      type,
      ...extra,
    },
  };
}
