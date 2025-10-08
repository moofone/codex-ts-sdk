import type { RolloutData, RolloutFileHeader } from '../types/rollout';
/**
 * Read and parse a rollout file (JSONL or JSON format)
 */
export declare function readRolloutFile(filePath: string): Promise<RolloutData>;
/**
 * Write rollout data to a file
 */
export declare function writeRolloutFile(filePath: string, data: RolloutData, format?: 'json' | 'jsonl', prettyPrint?: boolean): Promise<void>;
/**
 * Validate rollout file format
 */
export declare function validateRolloutFile(filePath: string): {
    isValid: boolean;
    errors: string[];
};
/**
 * Extract session metadata from a rollout file without parsing all events
 */
export declare function extractSessionMetadata(filePath: string): RolloutFileHeader | null;
/**
 * Create a template path with variable substitution
 */
export declare function createTemplatedPath(template: string, variables: Record<string, string>): string;
/**
 * Ensure a directory exists
 */
export declare function ensureDirectoryExists(dirPath: string): void;
