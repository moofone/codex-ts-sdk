import { afterEach, describe, expect, it, vi } from 'vitest';
import * as nativeModule from '../src/internal/nativeModule';
import { getCodexCliVersion } from '../src/version';

describe('getCodexCliVersion', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the version from the native module', () => {
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

  it('throws error immediately when custom module path is provided and fails', () => {
    const customPath = '/custom/module/path';
    const mockError = new Error('Module not found');

    vi.spyOn(nativeModule, 'loadNativeModule').mockImplementation((options) => {
      if (options?.modulePath === customPath) {
        throw mockError;
      }
      return {
        NativeCodex: class NativeCodex {},
        version: () => '0.1.0',
        cliVersion: () => '0.39.0',
      } as unknown as nativeModule.CodexNativeModule;
    });

    // When a custom module path is provided and fails, it should throw immediately
    // without attempting the fallback
    expect(() => getCodexCliVersion({ modulePath: customPath })).toThrow(mockError);
    expect(nativeModule.loadNativeModule).toHaveBeenCalledTimes(1);
  });

  it('attempts fallback path when no module path provided and primary fails', () => {
    const mockError = new Error('Primary load failed');
    let callCount = 0;

    vi.spyOn(nativeModule, 'loadNativeModule').mockImplementation((options) => {
      callCount++;
      if (callCount === 1 && !options?.modulePath) {
        throw mockError;
      }
      // Success on fallback path
      return {
        NativeCodex: class NativeCodex {},
        version: () => '0.1.0',
        cliVersion: () => '0.39.0',
      } as unknown as nativeModule.CodexNativeModule;
    });

    const version = getCodexCliVersion();
    expect(version).toBe('0.39.0');
    expect(nativeModule.loadNativeModule).toHaveBeenCalledTimes(2);

    // Verify second call used fallback path
    const secondCall = vi.mocked(nativeModule.loadNativeModule).mock.calls[1][0];
    expect(secondCall?.modulePath).toContain('native/codex-napi/index.js');
  });
});
