/// <reference types="node" />
import { EventEmitter } from 'events';
import type { CodexClientConfig } from '../types/options';
import type { ResumptionResult, ResumptionOptions, ResumptionState, ValidationResult } from '../types/resumption';
import type { RolloutData } from '../types/rollout';
/**
 * Resumes conversations from saved rollout data with validation and replay
 */
export declare class ConversationResumer extends EventEmitter {
    private currentState;
    /**
     * Resume a conversation from rollout data
     */
    resumeConversation(rolloutData: RolloutData, clientConfig: CodexClientConfig, options?: ResumptionOptions): Promise<ResumptionResult>;
    /**
     * Resume conversation with history (used by ConversationManager)
     */
    resumeConversationWithHistory(rolloutData: RolloutData, clientConfig: CodexClientConfig, options?: ResumptionOptions): Promise<string>;
    /**
     * Validate rollout data structure and content
     */
    validateRolloutData(rolloutData: RolloutData, options: Required<ResumptionOptions>): Promise<ValidationResult>;
    /**
     * Get current resumption state
     */
    getCurrentState(): ResumptionState | null;
    /**
     * Validate a single event entry
     */
    private validateEventEntry;
    /**
     * Check if an event is a side-effect event
     */
    private isSideEffectEvent;
    /**
     * Replay events with timeout protection
     */
    private replayEventsWithTimeout;
    /**
     * Replay a single event
     */
    private replayEvent;
    /**
     * Estimate replay time based on event count
     */
    private estimateReplayTime;
}
