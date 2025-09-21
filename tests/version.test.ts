import { afterEach, describe, expect, it, vi } from 'vitest';
import * as nativeModule from '../src/internal/nativeModule';
import { getCodexCliVersion } from '../src/version';

describe('getCodexCliVersion', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the CLI version from the native module', () => {
    vi.spyOn(nativeModule, 'loadNativeModule').mockReturnValue({
      NativeCodex: class NativeCodex {},
      version: () => '0.1.0',
      cliVersion: () => '0.39.0',
    } as unknown as nativeModule.CodexNativeModule);

    const version = getCodexCliVersion();
    console.log('[getCodexCliVersion]', version);
    expect(version).toBe('0.39.0');
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('throws if cliVersion is missing', () => {
    vi.spyOn(nativeModule, 'loadNativeModule').mockReturnValue({
      NativeCodex: class NativeCodex {},
      version: () => 'codex-cli 0.38.1',
    } as unknown as nativeModule.CodexNativeModule);

    expect(() => getCodexCliVersion()).toThrow('cliVersion');
  });
});
