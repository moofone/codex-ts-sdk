import { existsSync } from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';
import { log } from '../utils/logger';
export function resolveModuleUrl(fnCtor = Function, dir) {
    try {
        const fn = fnCtor(`
      try { return import.meta.url; }
      catch (err) { return undefined; }
    `);
        const url = fn();
        if (typeof url === 'string') {
            return url;
        }
    }
    catch {
        // ignore and fall back to __dirname
    }
    if (dir) {
        return pathToFileURL(dir).href;
    }
    return pathToFileURL(process.cwd()).href;
}
export function normalizeDirectory(dir) {
    return typeof dir === 'string' ? dir : undefined;
}
const moduleUrl = resolveModuleUrl(Function, 
/* istanbul ignore next -- Fallback for environments without __dirname */
normalizeDirectory(typeof __dirname === 'string' ? __dirname : undefined));
const requireFromMeta = createRequire(moduleUrl);
const PLATFORM_KEY = `${process.platform}-${process.arch}`;
function resolveProjectRoot(override) {
    if (override) {
        return override;
    }
    let currentDir = path.dirname(fileURLToPath(moduleUrl));
    const visited = new Set();
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
function candidatePaths(projectRoot) {
    const nativeRoot = path.join(projectRoot, 'native', 'codex-napi');
    const prebuiltDir = path.join(nativeRoot, 'prebuilt', PLATFORM_KEY);
    return [
        path.join(nativeRoot, 'index.js'),
        path.join(nativeRoot, 'index.node'),
        path.join(prebuiltDir, 'index.js'),
        path.join(prebuiltDir, 'index.node'),
    ];
}
export function loadNativeModule(options = {}) {
    const errors = [];
    const projectRoot = resolveProjectRoot(options.projectRootOverride);
    const attempt = (candidate) => {
        try {
            return requireFromMeta(candidate);
        }
        catch (error) {
            errors.push({ candidate, error });
            return undefined;
        }
    };
    const resolvedCandidates = new Set();
    const addCandidate = (candidate) => {
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
    const guidance = 'Failed to load codex native module. Ensure prebuilt binaries are available or provide a modulePath.';
    throw new Error(`${guidance}${details ? `\n${details}` : ''}`);
}
export function formatOverrides(overrides) {
    if (!overrides) {
        return undefined;
    }
    const entries = [];
    for (const [key, value] of Object.entries(overrides)) {
        entries.push({ key, value });
    }
    return entries;
}
//# sourceMappingURL=nativeModule.js.map