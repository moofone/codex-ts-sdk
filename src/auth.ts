import { existsSync, writeFileSync } from 'fs';
import * as os from 'os';
import * as path from 'path';

import { CodexAuthError } from './errors/CodexError';
import type { CodexClientConfig } from './types/options';
import { expandHomePath } from './utils/path';

type FileSystemOverrides = {
  existsSync: typeof existsSync;
  writeFileSync: typeof writeFileSync;
};

const defaultFileSystem: FileSystemOverrides = {
  existsSync,
  writeFileSync,
};

export type LoginWithApiKeyOptions = Pick<CodexClientConfig, 'codexHome'> & {
  fs?: FileSystemOverrides;
};

export function loginWithApiKey(apiKey: string, options: LoginWithApiKeyOptions = {}): void {
  const trimmed = apiKey?.trim();
  if (!trimmed) {
    throw new CodexAuthError('API key must be a non-empty string');
  }

  const { fs: fileSystemOverrides, codexHome: configuredHome } = options;

  const codexHome = resolveCodexHome(configuredHome);
  const authFile = path.join(codexHome, 'auth.json');

  const payload = {
    openai_api_key: trimmed,
    tokens: null,
    last_refresh: null,
  };

  const fileSystem = fileSystemOverrides ?? defaultFileSystem;

  try {
    if (!fileSystem.existsSync(codexHome)) {
      throw new CodexAuthError(`Codex home not found at ${codexHome}`);
    }

    fileSystem.writeFileSync(authFile, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  } catch (error) {
    if (error instanceof CodexAuthError) {
      throw error;
    }
    throw new CodexAuthError('Failed to persist API key to auth.json', {
      cause: errorMessage(error),
      authFile,
    });
  }
}

function resolveCodexHome(configured?: string): string {
  if (configured && configured.trim()) {
    return path.resolve(expandHomePath(configured));
  }

  const envHome = process.env.CODEX_HOME;
  if (envHome && envHome.trim()) {
    return path.resolve(expandHomePath(envHome));
  }

  const systemHome = os.homedir();
  if (!systemHome) {
    throw new CodexAuthError('Unable to determine home directory for Codex runtime');
  }
  return path.join(systemHome, '.codex');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
