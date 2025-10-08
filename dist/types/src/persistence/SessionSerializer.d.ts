import type { SessionMetadata, SerializationOptions } from '../types/rollout';
type MetadataOverrides = Partial<SessionMetadata> & SerializationOptions & Record<string, unknown>;
export interface SessionSerializerConfig {
    generateId?: () => string;
    detectOriginator?: () => string;
}
export declare class SessionSerializer {
    private readonly customIdGenerator?;
    private readonly customOriginatorDetector?;
    constructor(config?: SessionSerializerConfig);
    createSessionMetadata(overrides?: MetadataOverrides): Promise<SessionMetadata & Record<string, unknown>>;
    detectOriginator(): string;
    generateSessionId(): string;
    serializeMetadata(metadata: SessionMetadata, prettyPrint?: boolean): string;
    deserializeMetadata(json: string): SessionMetadata;
    validateMetadata(metadata: unknown): metadata is SessionMetadata;
    createTestMetadata(overrides?: Partial<SessionMetadata>): SessionMetadata;
    getEnvironmentInfo(): {
        nodeVersion: string;
        platform: string;
        arch: string;
        cwd: string;
        environment: Record<string, string | undefined>;
    };
    private safeGenerateId;
    private safeDetectOriginator;
    private safeGetCliVersion;
    private safeGetCwd;
}
export {};
