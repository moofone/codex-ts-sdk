import type { CodexEvent } from './events';
/**
 * Metadata for a conversation session
 */
export interface SessionMetadata {
    id: string;
    timestamp: string;
    cwd: string;
    originator: string;
    cliVersion: string;
    instructions?: string;
}
/**
 * A single event entry in a rollout log
 */
export interface RolloutEventEntry {
    timestamp: string;
    payload: CodexEvent;
    metadata?: Record<string, unknown>;
}
/**
 * Complete rollout data structure
 */
export interface RolloutData {
    session: SessionMetadata;
    events: RolloutEventEntry[];
}
/**
 * Header information for rollout files
 */
export interface RolloutFileHeader {
    version: string;
    format: 'jsonl' | 'json';
    session: SessionMetadata;
    createdAt: string;
    eventCount?: number;
}
/**
 * Configuration for rollout recording
 */
export interface RolloutRecorderConfig {
    /**
     * Output file path (supports template variables)
     */
    outputPath?: string;
    /**
     * Output format
     * @default 'jsonl'
     */
    format?: 'jsonl' | 'json';
    /**
     * Whether to include metadata with each event
     * @default false
     */
    includeMetadata?: boolean;
    /**
     * Whether to pretty-print JSON output
     * @default false
     */
    prettyPrint?: boolean;
    /**
     * Custom session metadata
     */
    sessionMetadata?: Partial<SessionMetadata>;
    /**
     * Event filter function
     */
    eventFilter?: (event: CodexEvent) => boolean;
    /**
     * Logger for recording operations
     */
    logger?: {
        debug?: (message: string, meta?: Record<string, unknown>) => void;
        info?: (message: string, meta?: Record<string, unknown>) => void;
        warn?: (message: string, meta?: Record<string, unknown>) => void;
        error?: (message: string, meta?: Record<string, unknown>) => void;
    };
}
/**
 * Options for serialization operations
 */
export interface SerializationOptions {
    /**
     * Include additional debugging information
     */
    includeDebugInfo?: boolean;
    /**
     * Custom working directory
     */
    cwd?: string;
    /**
     * Custom originator identifier
     */
    originator?: string;
    /**
     * Custom instructions text
     */
    instructions?: string;
}
/**
 * Error thrown during rollout parsing
 */
export declare class RolloutParseError extends Error {
    readonly filePath?: string;
    readonly lineNumber?: number;
    constructor(message: string, filePath?: string, lineNumber?: number);
}
/**
 * Error thrown during rollout file operations
 */
export declare class RolloutFileError extends Error {
    readonly filePath: string;
    readonly operation: string;
    constructor(message: string, filePath: string, operation: string);
}
/**
 * Error thrown during rollout serialization
 */
export declare class RolloutSerializationError extends Error {
    readonly data?: unknown;
    constructor(message: string, data?: unknown);
}
