import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const importNativeModule = () => import('../../src/internal/nativeModule');

describe('nativeModule utilities', () => {
  let tempDir: string;

  beforeEach(() => {
    vi.resetModules();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-native-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    delete process.env.CODEX_NATIVE_MODULE;
  });

  function writeNativeModule(fileName: string, version: string) {
    const filePath = path.join(tempDir, fileName);
    const contents = `module.exports = {\n  NativeCodex: class NativeCodex {},\n  version: () => '${version}',\n  cliVersion: () => '${version}',\n};`;
    fs.writeFileSync(filePath, contents, 'utf8');
    return filePath;
  }

  it('derives module URL from __dirname when import.meta is unavailable', async () => {
    const { resolveModuleUrl, normalizeDirectory } = await importNativeModule();
    const customDir = path.join(tempDir, 'custom');
    fs.mkdirSync(customDir, { recursive: true });
    const resolved = resolveModuleUrl(Function, normalizeDirectory(customDir));
    expect(resolved).toBe(pathToFileURL(customDir).href);
  });

  it('derives module URL from import.meta when available', async () => {
    const originalFunction = globalThis.Function;
    (globalThis as unknown as { Function: typeof Function }).Function = ((code: string) => {
      if (code.includes('import.meta.url')) {
        return () => 'file:///virtual/native.mjs';
      }
      return originalFunction(code);
    }) as typeof Function;

    try {
      const mod = await importNativeModule();
      expect(typeof mod.loadNativeModule).toBe('function');
    } finally {
      (globalThis as unknown as { Function: typeof Function }).Function = originalFunction;
    }
  });

  it('falls back to process cwd when no dirname can be resolved', async () => {
    const { resolveModuleUrl, normalizeDirectory } = await importNativeModule();
    const resolved = resolveModuleUrl(Function, normalizeDirectory(123));
    expect(resolved).toBe(pathToFileURL(process.cwd()).href);
  });

  it('loads module from explicit path and logs debug output', async () => {
    const modulePath = writeNativeModule('module.cjs', '1.2.3');
    const { loadNativeModule } = await importNativeModule();
    const logger = { debug: vi.fn() };
    const mod = loadNativeModule({ modulePath, logger, projectRootOverride: tempDir });
    expect(mod.version()).toBe('1.2.3');
    expect(logger.debug).toHaveBeenCalledWith('Loaded native codex module', { candidate: modulePath });
  });

  it('resolves relative module paths against the project root', async () => {
    const modulePath = writeNativeModule('relative.cjs', 'rel');
    const { loadNativeModule } = await importNativeModule();
    const logger = { debug: vi.fn() };
    const mod = loadNativeModule({
      modulePath: path.relative(tempDir, modulePath),
      logger,
      projectRootOverride: tempDir,
    });
    expect(mod.version()).toBe('rel');
  });

  it('uses CODEX_NATIVE_MODULE environment variable when present', async () => {
    const modulePath = writeNativeModule('env-module.cjs', 'env');
    const { loadNativeModule } = await importNativeModule();
    process.env.CODEX_NATIVE_MODULE = modulePath;
    const mod = loadNativeModule({ projectRootOverride: tempDir });
    expect(mod.version()).toBe('env');
  });

  it('reports loader errors when candidate exists but fails to load', async () => {
    const brokenPath = path.join(tempDir, 'broken.cjs');
    fs.writeFileSync(brokenPath, 'module.exports = {', 'utf8');
    const { loadNativeModule } = await importNativeModule();

    try {
      loadNativeModule({ modulePath: brokenPath, projectRootOverride: tempDir });
      throw new Error('Expected loadNativeModule to throw');
    } catch (error) {
      const message = String(error);
      expect(message).toContain('Failed to load codex native module');
      expect(message).toContain('broken.cjs');
    }
  });

  it('throws descriptive error when no module can be resolved', async () => {
    const { loadNativeModule } = await importNativeModule();
    expect(() =>
      loadNativeModule({ modulePath: path.join(tempDir, 'missing.cjs'), projectRootOverride: tempDir }),
    ).toThrow(/Failed to load codex native module/);
  });

  it('formats overrides to key/value entries', async () => {
    const { formatOverrides } = await importNativeModule();
    expect(formatOverrides()).toBeUndefined();
    expect(formatOverrides({ model: 'codex', summary: 'brief' })).toEqual([
      { key: 'model', value: 'codex' },
      { key: 'summary', value: 'brief' },
    ]);
  });
});
