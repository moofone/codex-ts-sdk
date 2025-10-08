"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionSerializer = void 0;
const crypto_1 = require("crypto");
const path_1 = require("path");
const cliDetection_1 = require("../utils/cliDetection");
const UNKNOWN_VALUE = 'unknown';
let cachedEnv;
class SessionSerializer {
    customIdGenerator;
    customOriginatorDetector;
    constructor(config = {}) {
        this.customIdGenerator = config.generateId;
        this.customOriginatorDetector = config.detectOriginator;
    }
    createSessionMetadata(overrides = {}) {
        const id = this.safeGenerateId();
        const timestamp = new Date().toISOString();
        const cwd = this.safeGetCwd(overrides.cwd);
        const originator = this.safeDetectOriginator(overrides.originator);
        const cliVersion = this.safeGetCliVersion();
        const metadata = {
            id,
            timestamp,
            cwd,
            originator,
            cliVersion,
        };
        const overrideId = isNonEmptyString(overrides.id) ? overrides.id.trim() : id;
        const overrideTimestamp = isNonEmptyString(overrides.timestamp) ? overrides.timestamp : timestamp;
        const overrideCwd = isNonEmptyString(overrides.cwd) ? (0, path_1.resolve)(overrides.cwd) : metadata.cwd;
        const overrideOriginator = isNonEmptyString(overrides.originator) ? overrides.originator.trim() : originator;
        const overrideCliVersion = isNonEmptyString(overrides.cliVersion) ? overrides.cliVersion : cliVersion;
        const metadataWithOverrides = {
            ...metadata,
            ...overrides,
            id: overrideId,
            timestamp: overrideTimestamp,
            cwd: overrideCwd,
            originator: overrideOriginator,
            cliVersion: overrideCliVersion,
        };
        return Promise.resolve(metadataWithOverrides);
    }
    detectOriginator() {
        if (this.customOriginatorDetector) {
            try {
                const value = this.customOriginatorDetector();
                if (isNonEmptyString(value)) {
                    return value;
                }
            }
            catch {
                // Fall back to default logic when custom detectors fail.
            }
        }
        try {
            const override = safeEnvAccess('CODEX_INTERNAL_ORIGINATOR_OVERRIDE');
            if (isNonEmptyString(override)) {
                return override.trim();
            }
            const lifecycle = safeEnvAccess('npm_lifecycle_event');
            if (isNonEmptyString(lifecycle)) {
                return `npm_${lifecycle.trim()}`;
            }
            return UNKNOWN_VALUE;
        }
        catch {
            return UNKNOWN_VALUE;
        }
    }
    generateSessionId() {
        return (0, crypto_1.randomUUID)();
    }
    serializeMetadata(metadata, prettyPrint = false) {
        return prettyPrint ? JSON.stringify(metadata, null, 2) : JSON.stringify(metadata);
    }
    deserializeMetadata(json) {
        const parsed = JSON.parse(json);
        if (!this.validateMetadata(parsed)) {
            throw new Error('Invalid session metadata received during deserialization');
        }
        return parsed;
    }
    validateMetadata(metadata) {
        if (!metadata || typeof metadata !== 'object') {
            return false;
        }
        const obj = metadata;
        return (typeof obj.id === 'string' &&
            typeof obj.timestamp === 'string' &&
            typeof obj.cwd === 'string' &&
            typeof obj.originator === 'string' &&
            typeof obj.cliVersion === 'string' &&
            (obj.instructions === undefined || typeof obj.instructions === 'string'));
    }
    createTestMetadata(overrides = {}) {
        const base = {
            id: this.generateSessionId(),
            timestamp: new Date().toISOString(),
            cwd: (0, path_1.resolve)('.'),
            originator: UNKNOWN_VALUE,
            cliVersion: UNKNOWN_VALUE,
        };
        return { ...base, ...overrides };
    }
    getEnvironmentInfo() {
        return {
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch,
            cwd: this.safeGetCwd(),
            environment: {
                CODEX_HOME: safeEnvAccess('CODEX_HOME'),
                CODEX_INTERNAL_ORIGINATOR_OVERRIDE: safeEnvAccess('CODEX_INTERNAL_ORIGINATOR_OVERRIDE'),
                NODE_ENV: safeEnvAccess('NODE_ENV'),
            },
        };
    }
    safeGenerateId() {
        if (this.customIdGenerator) {
            try {
                const customId = this.customIdGenerator();
                if (isNonEmptyString(customId)) {
                    return customId;
                }
            }
            catch {
                // Swallow and fall back to default implementation
            }
        }
        return this.generateSessionId();
    }
    safeDetectOriginator(explicit) {
        if (isNonEmptyString(explicit)) {
            return explicit.trim();
        }
        return this.detectOriginator();
    }
    safeGetCliVersion() {
        try {
            const version = (0, cliDetection_1.getCodexCliVersion)();
            return isNonEmptyString(version) ? version : UNKNOWN_VALUE;
        }
        catch {
            return UNKNOWN_VALUE;
        }
    }
    safeGetCwd(explicit) {
        if (isNonEmptyString(explicit)) {
            return (0, path_1.resolve)(explicit);
        }
        try {
            return (0, path_1.resolve)(process.cwd());
        }
        catch {
            return UNKNOWN_VALUE;
        }
    }
}
exports.SessionSerializer = SessionSerializer;
function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}
function safeEnvAccess(key) {
    try {
        const env = process.env;
        cachedEnv = env ?? cachedEnv;
        return env?.[key];
    }
    catch {
        if (cachedEnv) {
            try {
                Object.defineProperty(process, 'env', {
                    value: cachedEnv,
                    configurable: true,
                    writable: true,
                });
            }
            catch {
                // Swallow restoration errors to preserve fallback behaviour.
            }
        }
        return undefined;
    }
}
