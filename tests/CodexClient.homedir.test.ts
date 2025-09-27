import path from 'path';
import { describe, expect, it, vi } from 'vitest';

type ResolveCodexHome = () => string | undefined;

async function resolveConfiguredHome(input: string, homedir?: string): Promise<string | undefined> {
  vi.resetModules();
  let mocked = false;
  const originalSkipCheck = process.env.CODEX_SKIP_VERSION_CHECK;
  process.env.CODEX_SKIP_VERSION_CHECK = '1';
  if (homedir !== undefined) {
    mocked = true;
    vi.doMock('os', async () => {
      const actual = await vi.importActual<typeof import('os')>('os');
      return {
        ...actual,
        homedir: () => homedir,
      };
    });
  }

  try {
    const mod = await import('../src/client/CodexClient');
    const { CodexClient } = mod;
    const client = new CodexClient({ codexHome: input });
    const internal = client as unknown as { resolveCodexHome: ResolveCodexHome };
    return internal.resolveCodexHome();
  } finally {
    if (mocked) {
      vi.doUnmock('os');
    }
    if (originalSkipCheck === undefined) {
      delete process.env.CODEX_SKIP_VERSION_CHECK;
    } else {
      process.env.CODEX_SKIP_VERSION_CHECK = originalSkipCheck;
    }
  }
}

describe('CodexClient homedir fallback', () => {
  it('returns literal path when os.homedir is unavailable', async () => {
    expect(await resolveConfiguredHome('~', '')).toBe('~');
  });

  it('expands bare tilde to the current home directory', async () => {
    expect(await resolveConfiguredHome('~', '/home/tester')).toBe('/home/tester');
  });

  it('expands unix-style tilde paths', async () => {
    expect(await resolveConfiguredHome('~/workspace', '/Users/dev')).toBe(
      path.join('/Users/dev', 'workspace'),
    );
  });

  it('expands windows-style tilde paths', async () => {
    expect(await resolveConfiguredHome('~\\tools', 'C:\\Users\\dev')).toBe(
      path.join('C:\\Users\\dev', 'tools'),
    );
  });

  it('appends suffixes for explicit user paths after tilde', async () => {
    expect(await resolveConfiguredHome('~alice', '/srv/home')).toBe(path.join('/srv/home', 'alice'));
  });

  it('returns trimmed value when only whitespace is configured', async () => {
    expect(await resolveConfiguredHome('   ', '/tmp/home')).toBe('');
  });
});
