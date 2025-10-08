/// <reference types="node" />
import { EventEmitter } from 'events';
import type { CodexClient } from '../client/CodexClient';
import type { RolloutRecorderConfig, SessionMetadata, RolloutEventEntry } from '../types/rollout';
/**
 * Records conversation events to rollout files for later analysis or resumption
 */
export declare class RolloutRecorder extends EventEmitter {
    private readonly config;
    private readonly events;
    private sessionMetadata;
    private isRecording;
    private outputPath;
    private client;
    constructor(config?: RolloutRecorderConfig);
    /**
     * Start recording events from a CodexClient
     */
    startRecording(client: CodexClient, customSessionMetadata?: Partial<SessionMetadata>): Promise<void>;
    /**
     * Stop recording and finalize the rollout file
     */
    stopRecording(): Promise<string | null>;
    /**
     * Get current recording statistics
     */
    getStats(): {
        isRecording: boolean;
        eventCount: number;
        outputPath: string | null;
        sessionId: string | null;
        startedAt: Date | null;
    };
    /**
     * Get recorded events (copy for safety)
     */
    getEvents(): RolloutEventEntry[];
    /**
     * Get session metadata
     */
    getSessionMetadata(): SessionMetadata | null;
    /**
     * Initialize session metadata
     */
    private initializeSessionMetadata;
    /**
     * Set up event listeners on the client
     */
    private setupEventListeners;
    /**
     * Handle incoming events
     */
    private handleEvent;
    /**
     * Generate default output path
     */
    private generateDefaultPath;
    /**
     * Resolve output path with template variables
     */
    private resolveOutputPath;
    /**
     * Write session header for JSONL format
     */
    private writeSessionHeader;
    /**
     * Write a single event entry for JSONL format
     */
    private writeEventEntry;
    /**
     * Cleanup resources
     */
    private cleanup;
}
