import { beforeEach, describe, expect, it, vi } from 'vitest';

const buildSpy = vi.fn();

vi.mock('../src/client/CodexClient', () => ({
  CodexClient: vi.fn((config) => {
    buildSpy(config);
    return { config } as unknown;
  }),
}));

import { CodexClientBuilder } from '../src/client/CodexClientBuilder';

describe('CodexClientBuilder', () => {
  beforeEach(() => {
    buildSpy.mockClear();
  });

  it('chains configuration helpers and builds CodexClient', () => {
    const plugin = { name: 'plugin' } as never;
    const builder = new CodexClientBuilder()
      .withCodexHome('/codex')
      .withNativeModulePath('/module')
      .withLogger({ debug: vi.fn() })
      .withRetryPolicy({ maxRetries: 2 })
      .withTimeout(5000)
      .withApprovalPolicy('on-request')
      .withSandboxPolicy({ mode: 'workspace-write', network_access: true, exclude_slash_tmp: false, exclude_tmpdir_env_var: false })
      .withDefaultModel('gpt-5-codex')
      .withDefaultEffort('high')
      .withDefaultSummary('concise')
      .addPlugin(plugin)
      .addPlugins([plugin]);

    const client = builder.build();
    expect(client).toBeDefined();

    expect(buildSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        codexHome: '/codex',
        nativeModulePath: '/module',
        logger: expect.objectContaining({ debug: expect.any(Function) }),
        retryPolicy: { maxRetries: 2 },
        timeoutMs: 5000,
        approvalPolicy: 'on-request',
        sandboxPolicy: expect.objectContaining({ mode: 'workspace-write' }),
        defaultModel: 'gpt-5-codex',
        defaultEffort: 'high',
        defaultSummary: 'concise',
        plugins: [plugin, plugin],
      }),
    );
  });

  it('appends plugin collections without resetting previous registrations', () => {
    const first = { name: 'first' } as never;
    const second = { name: 'second' } as never;

    const builder = new CodexClientBuilder().addPlugin(first).addPlugins([second]);
    builder.build();

    expect(buildSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        plugins: [first, second],
      }),
    );
  });

  it('initialises plugin storage when addPlugins is the first registration call', () => {
    const alpha = { name: 'alpha' } as never;
    const beta = { name: 'beta' } as never;

    const builder = new CodexClientBuilder().addPlugins([alpha, beta]);
    builder.build();

    expect(buildSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        plugins: [alpha, beta],
      }),
    );
  });
});
