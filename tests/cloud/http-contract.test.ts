import { beforeAll, afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { CloudTasksClientBuilder } from '../../src/cloud/CloudTasksClientBuilder';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type { CloudTasksErrorCode } from '../../src/cloud/errors';

const BASE_URL = 'https://cloud.codex.test';

const server = setupServer();

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

vi.mock('../../src/cloud/internal/bindings', async () => {
  const actual = await vi.importActual<typeof import('../../src/cloud/internal/bindings')>(
    '../../src/cloud/internal/bindings'
  );

  const toHeaders = (config: { bearer_token?: string; chatgpt_account_id?: string; user_agent?: string }) => {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (config.bearer_token) headers.authorization = `Bearer ${config.bearer_token}`;
    if (config.chatgpt_account_id) headers['x-chatgpt-account-id'] = config.chatgpt_account_id;
    if (config.user_agent) headers['user-agent'] = config.user_agent;
    return headers;
  };

  const throwHttpError = async (resp: Response) => {
    let message: string;
    try {
      const json = await resp.json();
      message = json.error ?? json.message ?? JSON.stringify(json);
    } catch {
      message = await resp.text();
    }
    const err = new Error(message || resp.statusText);
    (err as any).code = 'HTTP' satisfies CloudTasksErrorCode;
    throw err;
  };

  async function requestJson<T>(config: any, path: string, init: RequestInit): Promise<T> {
    const target = new URL(path, config.base_url ?? BASE_URL);
    const resp = await fetch(target, {
      ...init,
      headers: {
        ...toHeaders(config),
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    if (!resp.ok) {
      await throwHttpError(resp);
    }
    return resp.json() as Promise<T>;
  }

  async function requestText(config: any, path: string): Promise<string | null> {
    const target = new URL(path, config.base_url ?? BASE_URL);
    const resp = await fetch(target, {
      headers: toHeaders(config),
    });
    if (resp.status === 204) {
      return null;
    }
    if (!resp.ok) {
      await throwHttpError(resp);
    }
    return resp.text();
  }

  const bindings = {
    list: async (config: any, environmentId?: string) => {
      const url = environmentId ? `/cloud/tasks?environment_id=${encodeURIComponent(environmentId)}` : '/cloud/tasks';
      const json = await requestJson<any[]>(config, url, { method: 'GET' });
      return json.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        updated_at: task.updated_at,
        environment_id: task.environment_id,
        environment_label: task.environment_label,
        summary: {
          files_changed: task.summary.files_changed,
          lines_added: task.summary.lines_added,
          lines_removed: task.summary.lines_removed,
        },
        is_review: task.is_review,
        attempt_total: task.attempt_total,
      }));
    },
    create: async (config: any, options: any) => {
      const json = await requestJson<{ id: string }>(config, '/cloud/tasks', {
        method: 'POST',
        body: JSON.stringify({
          environment_id: options.environment_id,
          prompt: options.prompt,
          git_ref: options.git_ref,
          qa_mode: options.qa_mode ?? false,
          best_of_n: options.best_of_n ?? 1,
        }),
      });
      return { id: json.id };
    },
    getDiff: (config: any, taskId: string) => requestText(config, `/cloud/tasks/${taskId}/diff`),
    getMessages: (config: any, taskId: string) => requestJson<string[]>(config, `/cloud/tasks/${taskId}/messages`, { method: 'GET' }),
    getText: async (config: any, taskId: string) => {
      const json = await requestJson<any>(config, `/cloud/tasks/${taskId}/text`, { method: 'GET' });
      return {
        prompt: json.prompt,
        messages: json.messages,
        turn_id: json.turn_id,
        sibling_turn_ids: json.sibling_turn_ids,
        attempt_placement: json.attempt_placement,
        attempt_status: json.attempt_status,
      };
    },
    apply: async (config: any, taskId: string, diffOverride?: string, preflight?: boolean) => {
      const path = `/cloud/tasks/${taskId}/apply${preflight ? '?preflight=true' : ''}`;
      const json = await requestJson<any>(config, path, {
        method: 'POST',
        body: JSON.stringify({ diff_override: diffOverride ?? null }),
      });
      return {
        applied: json.applied,
        status: json.status,
        message: json.message,
        skipped_paths: json.skipped_paths ?? [],
        conflict_paths: json.conflict_paths ?? [],
      };
    },
    listAttempts: async (config: any, taskId: string, turnId: string) => {
      const json = await requestJson<any[]>(
        config,
        `/cloud/tasks/${taskId}/attempts?turn_id=${encodeURIComponent(turnId)}`,
        { method: 'GET' }
      );
      return json.map((attempt) => ({
        turn_id: attempt.turn_id,
        attempt_placement: attempt.attempt_placement,
        created_at: attempt.created_at,
        status: attempt.status,
        diff: attempt.diff,
        messages: attempt.messages,
      }));
    },
    close: () => {},
  };

  return {
    ...actual,
    getCloudBindings: () => bindings,
  };
});

describe('CloudTasksClient HTTP contract', () => {
  it('listTasks hits /cloud/tasks with environment filter and parses response', async () => {
    server.use(
      http.get(`${BASE_URL}/cloud/tasks`, ({ request }) => {
        expect(request.url).toContain('environment_id=env-123');
        expect(request.headers.get('authorization')).toBe('Bearer sk-test');
        return HttpResponse.json([
          {
            id: 'task-1',
            title: 'Implement feature',
            status: 'ready',
            updated_at: '2025-10-01T12:00:00Z',
            environment_id: 'env-123',
            environment_label: 'Staging',
            summary: { files_changed: 2, lines_added: 10, lines_removed: 3 },
            is_review: false,
            attempt_total: 1,
          },
        ]);
      })
    );

    const client = new CloudTasksClientBuilder()
      .withBaseUrl(BASE_URL)
      .withBearerToken('sk-test')
      .withUserAgent('sdk-test/1.0.0')
      .build();

    const tasks = await client.listTasks({ environmentId: 'env-123' });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].updatedAt).toBeInstanceOf(Date);
    expect(tasks[0].summary.filesChanged).toBe(2);
    client.close();
  });

  it('createTask posts payload and surfaces returned id', async () => {
    server.use(
      http.post(`${BASE_URL}/cloud/tasks`, async ({ request }) => {
        const body = await request.json();
        expect(body).toEqual({
          environment_id: 'env-456',
          prompt: 'Hello world',
          git_ref: 'main',
          qa_mode: true,
          best_of_n: 3,
        });
        return HttpResponse.json({ id: 'task-new' });
      })
    );

    const client = new CloudTasksClientBuilder()
      .withBaseUrl(BASE_URL)
      .withBearerToken('sk-test')
      .build();

    const created = await client.createTask({
      environmentId: 'env-456',
      prompt: 'Hello world',
      gitRef: 'main',
      qaMode: true,
      bestOfN: 3,
    });
    expect(created.id).toBe('task-new');
    client.close();
  });

  it('applyTaskPreflight sends preflight flag and handles response', async () => {
    server.use(
      http.post(`${BASE_URL}/cloud/tasks/task-1/apply`, async ({ request }) => {
        expect(request.url).toContain('preflight=true');
        const body = await request.json();
        expect(body).toEqual({ diff_override: 'diff --git A B' });
        return HttpResponse.json({
          applied: false,
          status: 'partial',
          message: 'dry run',
          skipped_paths: ['README.md'],
          conflict_paths: ['src/app.ts'],
        });
      })
    );

    const client = new CloudTasksClientBuilder().withBaseUrl(BASE_URL).build();

    const outcome = await client.applyTaskPreflight('task-1', { diffOverride: 'diff --git A B' });
    expect(outcome.status).toBe('partial');
    expect(outcome.conflictPaths).toContain('src/app.ts');
    client.close();
  });

  it('applyTask surfaces backend error as CloudTasksError', async () => {
    server.use(
      http.post(`${BASE_URL}/cloud/tasks/task-1/apply`, () =>
        new HttpResponse(JSON.stringify({ message: 'invalid diff' }), {
          status: 422,
          headers: { 'content-type': 'application/json' },
        })
      )
    );

    const client = new CloudTasksClientBuilder().withBaseUrl(BASE_URL).build();

    await expect(client.applyTask('task-1')).rejects.toMatchObject({ code: 'HTTP' });
    client.close();
  });

  it('listSiblingAttempts encodes turn id', async () => {
    server.use(
      http.get(`${BASE_URL}/cloud/tasks/task-1/attempts`, ({ request }) => {
        expect(request.url).toContain('turn_id=turn%23alt');
        return HttpResponse.json([
          {
            turn_id: 'turn#alt',
            attempt_placement: 1,
            created_at: '2025-10-02T08:00:00Z',
            status: 'completed',
            diff: 'diff --git A B',
            messages: ['alt attempt'],
          },
        ]);
      })
    );

    const client = new CloudTasksClientBuilder().withBaseUrl(BASE_URL).build();

    const attempts = await client.listSiblingAttempts('task-1', 'turn#alt');
    expect(attempts).toHaveLength(1);
    expect(attempts[0].turnId).toBe('turn#alt');
    client.close();
  });
});
