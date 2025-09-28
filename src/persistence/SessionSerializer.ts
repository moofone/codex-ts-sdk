import { randomUUID } from 'crypto';
import { resolve } from 'path';
import type { SessionMetadata, SerializationOptions } from '../types/rollout';
import { getCodexCliVersion } from '../utils/cliDetection';

const UNKNOWN_VALUE = 'unknown';

let cachedEnv: Record<string, string | undefined> | undefined;

type MetadataOverrides = Partial<SessionMetadata> & SerializationOptions & Record<string, unknown>;

export interface SessionSerializerConfig {
  generateId?: () => string;
  detectOriginator?: () => string;
}

export class SessionSerializer {
  private readonly customIdGenerator?: () => string;
  private readonly customOriginatorDetector?: () => string;

  constructor(config: SessionSerializerConfig = {}) {
    this.customIdGenerator = config.generateId;
    this.customOriginatorDetector = config.detectOriginator;
  }

  createSessionMetadata(overrides: MetadataOverrides = {} as MetadataOverrides): Promise<SessionMetadata & Record<string, unknown>> {
    const id = this.safeGenerateId();
    const timestamp = new Date().toISOString();
    const cwd = this.safeGetCwd(overrides.cwd);
    const originator = this.safeDetectOriginator(overrides.originator);
    const cliVersion = this.safeGetCliVersion();

    const metadata: SessionMetadata = {
      id,
      timestamp,
      cwd,
      originator,
      cliVersion,
    };

    const overrideId = isNonEmptyString(overrides.id) ? overrides.id.trim() : id;
    const overrideTimestamp = isNonEmptyString(overrides.timestamp) ? overrides.timestamp : timestamp;
    const overrideCwd = isNonEmptyString(overrides.cwd) ? resolve(overrides.cwd) : metadata.cwd;
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

  detectOriginator(): string {
    if (this.customOriginatorDetector) {
      try {
        const value = this.customOriginatorDetector();
        if (isNonEmptyString(value)) {
          return value;
        }
      } catch {
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
    } catch {
      return UNKNOWN_VALUE;
    }
  }

  generateSessionId(): string {
    return randomUUID();
  }

  serializeMetadata(metadata: SessionMetadata, prettyPrint: boolean = false): string {
    return prettyPrint ? JSON.stringify(metadata, null, 2) : JSON.stringify(metadata);
  }

  deserializeMetadata(json: string): SessionMetadata {
    const parsed: unknown = JSON.parse(json);
    if (!this.validateMetadata(parsed)) {
      throw new Error('Invalid session metadata received during deserialization');
    }

    return parsed;
  }

  validateMetadata(metadata: unknown): metadata is SessionMetadata {
    if (!metadata || typeof metadata !== 'object') {
      return false;
    }

    const obj = metadata as Record<string, unknown>;
    return (
      typeof obj.id === 'string' &&
      typeof obj.timestamp === 'string' &&
      typeof obj.cwd === 'string' &&
      typeof obj.originator === 'string' &&
      typeof obj.cliVersion === 'string' &&
      (obj.instructions === undefined || typeof obj.instructions === 'string')
    );
  }

  createTestMetadata(overrides: Partial<SessionMetadata> = {}): SessionMetadata {
    const base: SessionMetadata = {
      id: this.generateSessionId(),
      timestamp: new Date().toISOString(),
      cwd: resolve('.'),
      originator: UNKNOWN_VALUE,
      cliVersion: UNKNOWN_VALUE,
    };

    return { ...base, ...overrides };
  }

  getEnvironmentInfo(): {
    nodeVersion: string;
    platform: string;
    arch: string;
    cwd: string;
    environment: Record<string, string | undefined>;
  } {
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

  private safeGenerateId(): string {
    if (this.customIdGenerator) {
      try {
        const customId = this.customIdGenerator();
        if (isNonEmptyString(customId)) {
          return customId;
        }
      } catch {
        // Swallow and fall back to default implementation
      }
    }

    return this.generateSessionId();
  }

  private safeDetectOriginator(explicit?: string): string {
    if (isNonEmptyString(explicit)) {
      return explicit.trim();
    }

    return this.detectOriginator();
  }

  private safeGetCliVersion(): string {
    try {
      const version = getCodexCliVersion();
      return isNonEmptyString(version) ? version : UNKNOWN_VALUE;
    } catch {
      return UNKNOWN_VALUE;
    }
  }

  private safeGetCwd(explicit?: string): string {
    if (isNonEmptyString(explicit)) {
      return resolve(explicit);
    }

    try {
      return resolve(process.cwd());
    } catch {
      return UNKNOWN_VALUE;
    }
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function safeEnvAccess(key: string): string | undefined {
  try {
    const env = process.env;
    cachedEnv = env ?? cachedEnv;
    return env?.[key];
  } catch {
    if (cachedEnv) {
      try {
        Object.defineProperty(process, 'env', {
          value: cachedEnv,
          configurable: true,
          writable: true,
        });
      } catch {
        // Swallow restoration errors to preserve fallback behaviour.
      }
    }
    return undefined;
  }
}
