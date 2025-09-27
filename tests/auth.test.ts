import * as fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loginWithApiKey } from '../src/auth';
import { CodexAuthError } from '../src/errors/CodexError';

function createTempCodexHome(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-auth-'));
  return dir;
}

describe('loginWithApiKey', () => {
  const originalCodexHome = process.env.CODEX_HOME;
  const tempHomes: string[] = [];

  beforeEach(() => {
    process.env.CODEX_HOME = originalCodexHome;
  });

  afterEach(() => {
    while (tempHomes.length > 0) {
      const dir = tempHomes.pop();
      if (dir && fs.existsSync(dir)) {
        fs.rmSync(dir, { force: true, recursive: true });
      }
    }
  });

  it('throws when API key is empty', () => {
    expect(() => loginWithApiKey('')).toThrow(CodexAuthError);
  });

  it('writes auth.json to the provided codex home with trimmed key', () => {
    const dir = createTempCodexHome();
    tempHomes.push(dir);

    loginWithApiKey('  sk-test  ', { codexHome: dir });

    const contents = fs.readFileSync(path.join(dir, 'auth.json'), 'utf-8');
    expect(JSON.parse(contents)).toEqual({
      openai_api_key: 'sk-test',
      tokens: null,
      last_refresh: null,
    });
  });

  it('honours CODEX_HOME when not provided explicitly', () => {
    const dir = createTempCodexHome();
    tempHomes.push(dir);
    process.env.CODEX_HOME = dir;

    loginWithApiKey('sk-key');

    const authPath = path.join(dir, 'auth.json');
    expect(fs.existsSync(authPath)).toBe(true);
  });

  it('throws when codex home directory does not exist', () => {
    const missingDir = path.join(os.tmpdir(), 'codex-auth-missing');
    expect(() => loginWithApiKey('sk-test', { codexHome: missingDir })).toThrow(CodexAuthError);
  });

  it('propagates errors when auth.json write fails (guaranteed bad response)', () => {
    const dir = createTempCodexHome();
    tempHomes.push(dir);

    const failingFs = {
      existsSync: fs.existsSync,
      writeFileSync: vi.fn(() => {
        throw new Error('disk full');
      }),
    };

    expect(() => loginWithApiKey('sk-error', { codexHome: dir, fs: failingFs })).toThrowError(
      /Failed to persist API key to auth\.json/,
    );
    expect(failingFs.writeFileSync).toHaveBeenCalledTimes(1);
  });

  it('allows mocked writes for a fake good response', () => {
    const dir = createTempCodexHome();
    tempHomes.push(dir);

    const writeFileMock = vi.fn<typeof fs.writeFileSync>();
    writeFileMock.mockImplementation(() => undefined);

    const mockedFs = {
      existsSync: fs.existsSync,
      writeFileSync: writeFileMock,
    };

    loginWithApiKey(' sk-mock ', { codexHome: dir, fs: mockedFs });

    expect(writeFileMock).toHaveBeenCalledTimes(1);
    const [authPath, payload, options] = writeFileMock.mock.calls[0]!;
    expect(authPath).toBe(path.join(dir, 'auth.json'));
    expect(payload).toBe(
      `${JSON.stringify({ openai_api_key: 'sk-mock', tokens: null, last_refresh: null }, null, 2)}\n`,
    );
    expect(options).toEqual({ mode: 0o600 });

    // Because we mocked the write, the file should not exist on disk.
    expect(fs.existsSync(path.join(dir, 'auth.json'))).toBe(false);
  });
});
