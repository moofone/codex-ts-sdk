import type { LoadNativeModuleOptions } from './internal/nativeModule';
import { loadNativeModule } from './internal/nativeModule';

function normalizeVersion(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/0\.\d+\.\d+/);
  return match ? match[0] : trimmed;
}

export function getCodexCliVersion(options?: LoadNativeModuleOptions): string {
  const module = loadNativeModule(options);
  if (typeof module.cliVersion !== 'function') {
    throw new Error('Native module does not expose cliVersion(); rebuild codex-rs and the N-API binding.');
  }
  return normalizeVersion(module.cliVersion());
}
