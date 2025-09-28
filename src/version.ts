import path from 'node:path';
import type { LoadNativeModuleOptions } from './internal/nativeModule';
import { loadNativeModule } from './internal/nativeModule';

const SEMVER_PATTERN = /\d+\.\d+\.\d+/;

function normalizeVersion(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(SEMVER_PATTERN);
  /* istanbul ignore next -- Fallback for non-semver versions */
  return match ? match[0] : trimmed;
}

export function getCodexCliVersion(options?: LoadNativeModuleOptions): string {
  const attempt = (opts: LoadNativeModuleOptions | undefined) => {
    const module = loadNativeModule(opts);
    if (typeof module.cliVersion !== 'function') {
      throw new Error('Native module does not expose cliVersion(); rebuild codex-rs and the N-API binding.');
    }
    return normalizeVersion(module.cliVersion());
  };

  try {
    return attempt(options);
  } catch (primaryError) {
    if (options?.modulePath) {
      throw primaryError;
    }

    const fallbackPath = path.join(process.cwd(), 'native', 'codex-napi', 'index.js');
    return attempt({ ...options, modulePath: fallbackPath });
  }
}
