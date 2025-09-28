import { existsSync } from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';
import type { PartialCodexLogger } from '../utils/logger';
import { log } from '../utils/logger';

export function resolveModuleUrl(
  fnCtor: typeof Function = Function,
  dir?: string,
): string {
  try {
    const fn = fnCtor(`
      try { return import.meta.url; }
      catch (err) { return undefined; }
    `) as () => unknown;
    const url = fn();
    if (typeof url === 'string') {
      return url;
    }
  } catch {
    // ignore and fall back to __dirname
  }

  if (dir) {
    return pathToFileURL(dir).href;
  }

  return pathToFileURL(process.cwd()).href;
}

export function normalizeDirectory(dir: unknown): string | undefined {
  return typeof dir === 'string' ? dir : undefined;
}

const moduleUrl = resolveModuleUrl(
  Function,
  /* istanbul ignore next -- Fallback for environments without __dirname */
  normalizeDirectory(typeof __dirname === 'string' ? __dirname : undefined),
);

const requireFromMeta = createRequire(moduleUrl);

export interface NativeCodexOptions {
  codexHome?: string;
}

export interface ConfigOverrideEntry {
  key: string;
  value: string;
}

export interface CreateConversationOptions {
  overrides?: ConfigOverrideEntry[];
}

export interface CodexSessionHandle {
  conversationId: string;
  nextEvent(): Promise<string | null>;
  submit(submissionJson: string): Promise<void>;
  close(): Promise<void>;
}

export interface NativeCodexBinding {
  new(options?: NativeCodexOptions): NativeCodexInstance;
}

export interface NativeCodexInstance {
  createConversation(options?: CreateConversationOptions): Promise<CodexSessionHandle>;
  getAuthMode?(): string | null;
}

export interface CodexNativeModule {
  NativeCodex: NativeCodexBinding;
  version(): string;
  cliVersion(): string;
}

export interface LoadNativeModuleOptions {
  modulePath?: string;
  logger?: PartialCodexLogger;
  projectRootOverride?: string;
}

const PLATFORM_KEY = `${process.platform}-${process.arch}`;

function resolveProjectRoot(override?: string): string {
  if (override) {
    return override;
  }

  let currentDir = path.dirname(fileURLToPath(moduleUrl));
  const visited = new Set<string>();

  while (!visited.has(currentDir)) {
    visited.add(currentDir);

    const packageJsonPath = path.join(currentDir, 'package.json');
    if (existsSync(packageJsonPath)) {
      const nativeDir = path.join(currentDir, 'native', 'codex-napi');
      if (existsSync(nativeDir)) {
        return currentDir;
      }
    }

    const parent = path.dirname(currentDir);
    if (parent === currentDir) {
      break;
    }

    currentDir = parent;
  }

  // Fallback to the previous behaviour (two levels up) if we couldn't locate package.json.
  return path.resolve(path.dirname(fileURLToPath(moduleUrl)), '..', '..');
}

function candidatePaths(projectRoot: string): string[] {
  const nativeRoot = path.join(projectRoot, 'native', 'codex-napi');
  const prebuiltDir = path.join(nativeRoot, 'prebuilt', PLATFORM_KEY);

  return [
    path.join(nativeRoot, 'index.js'),
    path.join(nativeRoot, 'index.node'),
    path.join(prebuiltDir, 'index.js'),
    path.join(prebuiltDir, 'index.node'),
  ];
}

export function loadNativeModule(options: LoadNativeModuleOptions = {}): CodexNativeModule {
  const errors: Array<{ candidate: string; error: unknown }> = [];
  const projectRoot = resolveProjectRoot(options.projectRootOverride);

  const attempt = (candidate: string): CodexNativeModule | undefined => {
    try {
      return requireFromMeta(candidate) as CodexNativeModule;
    } catch (error) {
      errors.push({ candidate, error });
      return undefined;
    }
  };

  const resolvedCandidates = new Set<string>();
  const addCandidate = (candidate: string | undefined) => {
    if (!candidate) {
      return;
    }
    const absolute = path.isAbsolute(candidate)
      ? candidate
      : path.resolve(projectRoot, candidate);
    if (!resolvedCandidates.has(absolute)) {
      resolvedCandidates.add(absolute);
    }
  };

  addCandidate(options.modulePath);

  for (const candidate of candidatePaths(projectRoot)) {
    addCandidate(candidate);
  }

  for (const candidate of resolvedCandidates) {
    if (!existsSync(candidate)) {
      continue;
    }
    const loaded = attempt(candidate);
    if (loaded) {
      log(options.logger, 'debug', 'Loaded native codex module', { candidate });
      return loaded;
    }
  }

  const details = errors
    .map((entry) => `- ${entry.candidate}: ${String(entry.error)}`)
    .join('\n');

  const guidance =
    'Failed to load codex native module. Ensure prebuilt binaries are available or provide a modulePath.';

  throw new Error(`${guidance}${details ? `\n${details}` : ''}`);
}

export function formatOverrides(overrides?: Record<string, string>): ConfigOverrideEntry[] | undefined {
  if (!overrides) {
    return undefined;
  }

  const entries: ConfigOverrideEntry[] = [];
  for (const [key, value] of Object.entries(overrides)) {
    entries.push({ key, value });
  }
  return entries;
}
