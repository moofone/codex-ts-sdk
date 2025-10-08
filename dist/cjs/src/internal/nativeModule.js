"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatOverrides = exports.loadNativeModule = exports.normalizeDirectory = exports.resolveModuleUrl = void 0;
const fs_1 = require("fs");
const path = __importStar(require("path"));
const url_1 = require("url");
const module_1 = require("module");
const logger_1 = require("../utils/logger");
function resolveModuleUrl(fnCtor = Function, dir) {
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
        return (0, url_1.pathToFileURL)(dir).href;
    }
    return (0, url_1.pathToFileURL)(process.cwd()).href;
}
exports.resolveModuleUrl = resolveModuleUrl;
function normalizeDirectory(dir) {
    return typeof dir === 'string' ? dir : undefined;
}
exports.normalizeDirectory = normalizeDirectory;
const moduleUrl = resolveModuleUrl(Function, 
/* istanbul ignore next -- Fallback for environments without __dirname */
normalizeDirectory(typeof __dirname === 'string' ? __dirname : undefined));
const requireFromMeta = (0, module_1.createRequire)(moduleUrl);
const PLATFORM_KEY = `${process.platform}-${process.arch}`;
function resolveProjectRoot(override) {
    if (override) {
        return override;
    }
    let currentDir = path.dirname((0, url_1.fileURLToPath)(moduleUrl));
    const visited = new Set();
    while (!visited.has(currentDir)) {
        visited.add(currentDir);
        const packageJsonPath = path.join(currentDir, 'package.json');
        if ((0, fs_1.existsSync)(packageJsonPath)) {
            const nativeDir = path.join(currentDir, 'native', 'codex-napi');
            if ((0, fs_1.existsSync)(nativeDir)) {
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
    return path.resolve(path.dirname((0, url_1.fileURLToPath)(moduleUrl)), '..', '..');
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
function loadNativeModule(options = {}) {
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
        if (!(0, fs_1.existsSync)(candidate)) {
            continue;
        }
        const loaded = attempt(candidate);
        if (loaded) {
            (0, logger_1.log)(options.logger, 'debug', 'Loaded native codex module', { candidate });
            return loaded;
        }
    }
    const details = errors
        .map((entry) => `- ${entry.candidate}: ${String(entry.error)}`)
        .join('\n');
    const guidance = 'Failed to load codex native module. Ensure prebuilt binaries are available or provide a modulePath.';
    throw new Error(`${guidance}${details ? `\n${details}` : ''}`);
}
exports.loadNativeModule = loadNativeModule;
function formatOverrides(overrides) {
    if (!overrides) {
        return undefined;
    }
    const entries = [];
    for (const [key, value] of Object.entries(overrides)) {
        entries.push({ key, value });
    }
    return entries;
}
exports.formatOverrides = formatOverrides;
