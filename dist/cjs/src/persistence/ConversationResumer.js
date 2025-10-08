"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationResumer = void 0;
const events_1 = require("events");
const CodexClientBuilder_1 = require("../client/CodexClientBuilder");
const resumption_1 = require("../types/resumption");
/**
 * Utility function for logging
 */
function log(logger, level, message, meta) {
    if (logger && logger[level]) {
        logger[level](message, meta);
    }
}
/**
 * Resumes conversations from saved rollout data with validation and replay
 */
class ConversationResumer extends events_1.EventEmitter {
    currentState = null;
    /**
     * Resume a conversation from rollout data
     */
    async resumeConversation(rolloutData, clientConfig, options = {}) {
        const startTime = Date.now();
        try {
            // Set default options
            const opts = {
                validateData: options.validateData ?? true,
                skipSideEffects: options.skipSideEffects ?? true,
                timeoutMs: options.timeoutMs ?? 30_000,
                continueOnError: options.continueOnError ?? true,
                eventFilter: options.eventFilter ?? (() => true),
                customValidation: options.customValidation ?? [],
                logger: options.logger ?? {},
            };
            log(opts.logger, 'info', 'Starting conversation resumption', {
                sessionId: rolloutData.session?.id,
                eventCount: Array.isArray(rolloutData.events) ? rolloutData.events.length : 0,
                skipSideEffects: opts.skipSideEffects,
            });
            // Validate rollout data if requested
            let validationResult;
            if (opts.validateData) {
                validationResult = await this.validateRolloutData(rolloutData, opts);
                if (!validationResult.isValid) {
                    throw new resumption_1.ValidationError('Rollout data validation failed', validationResult.errors);
                }
            }
            else {
                validationResult = {
                    isValid: true,
                    errors: [],
                    warnings: [],
                    eventCount: rolloutData.events.length,
                    sessionId: rolloutData.session.id,
                };
            }
            // Create and connect client
            const client = new CodexClientBuilder_1.CodexClientBuilder()
                .withConfig(clientConfig)
                .build();
            await client.connect();
            const conversationId = await client.createConversation();
            // Initialize resumption state
            this.currentState = {
                conversationId,
                currentEventIndex: 0,
                totalEvents: rolloutData.events.length,
                startedAt: new Date(),
                lastActivity: new Date(),
                status: 'replaying',
                errors: [],
            };
            // Filter events for replay
            const eventsToReplay = rolloutData.events.filter((event, index) => {
                if (!opts.eventFilter(event.payload, index)) {
                    return false;
                }
                if (opts.skipSideEffects && this.isSideEffectEvent(event.payload)) {
                    log(opts.logger, 'debug', 'Skipping side-effect event', {
                        eventType: event.payload.msg.type,
                        eventIndex: index,
                    });
                    return false;
                }
                return true;
            });
            log(opts.logger, 'info', 'Starting event replay', {
                totalEvents: rolloutData.events.length,
                eventsToReplay: eventsToReplay.length,
                skippedEvents: rolloutData.events.length - eventsToReplay.length,
            });
            // Replay events with timeout
            const replayResult = await this.replayEventsWithTimeout(client, eventsToReplay, opts);
            // Finalize state
            this.currentState.status = 'completed';
            this.currentState.lastActivity = new Date();
            const result = {
                conversationId,
                eventsReplayed: replayResult.successCount,
                totalEvents: rolloutData.events.length,
                resumedAt: new Date(),
                validationResult,
                skippedEvents: rolloutData.events.length - eventsToReplay.length,
                errors: this.currentState.errors,
            };
            const durationMs = Date.now() - startTime;
            log(opts.logger, 'info', 'Conversation resumption completed', {
                conversationId,
                eventsReplayed: result.eventsReplayed,
                totalEvents: result.totalEvents,
                durationMs,
                errorCount: result.errors.length,
            });
            this.emit('resumptionCompleted', result);
            return result;
        }
        catch (error) {
            if (this.currentState) {
                this.currentState.status = 'failed';
                this.currentState.lastActivity = new Date();
            }
            log(options.logger, 'error', 'Conversation resumption failed', {
                error: error instanceof Error ? error.message : String(error),
                durationMs: Date.now() - startTime,
            });
            throw error;
        }
        finally {
            this.currentState = null;
        }
    }
    /**
     * Resume conversation with history (used by ConversationManager)
     */
    async resumeConversationWithHistory(rolloutData, clientConfig, options = {}) {
        const result = await this.resumeConversation(rolloutData, clientConfig, options);
        return result.conversationId;
    }
    /**
     * Validate rollout data structure and content
     */
    validateRolloutData(rolloutData, options) {
        const errors = [];
        const warnings = [];
        const sessionId = rolloutData.session?.id;
        const eventCount = Array.isArray(rolloutData.events) ? rolloutData.events.length : 0;
        log(options.logger, 'debug', 'Validating rollout data', {
            sessionId,
            eventCount,
        });
        // Validate session metadata
        if (!rolloutData.session) {
            errors.push({
                code: 'MISSING_SESSION',
                message: 'Session metadata is missing',
                severity: 'error',
            });
        }
        else {
            if (!rolloutData.session.id) {
                errors.push({
                    code: 'MISSING_SESSION_ID',
                    message: 'Session ID is missing',
                    severity: 'error',
                });
            }
            if (!rolloutData.session.timestamp) {
                errors.push({
                    code: 'MISSING_TIMESTAMP',
                    message: 'Session timestamp is missing',
                    severity: 'error',
                });
            }
            if (!rolloutData.session.cliVersion) {
                warnings.push({
                    code: 'MISSING_CLI_VERSION',
                    message: 'CLI version is missing',
                    impact: 'low',
                });
            }
        }
        // Validate events structure
        if (!Array.isArray(rolloutData.events)) {
            errors.push({
                code: 'INVALID_EVENTS',
                message: 'Events must be an array',
                severity: 'error',
            });
        }
        else {
            // Validate individual events
            for (let i = 0; i < rolloutData.events.length; i++) {
                const event = rolloutData.events[i];
                const eventErrors = this.validateEventEntry(event, i);
                errors.push(...eventErrors);
            }
            // Check for session_created event
            const hasSessionCreated = rolloutData.events.some(e => e.payload.msg.type === 'session_created');
            if (!hasSessionCreated) {
                warnings.push({
                    code: 'MISSING_SESSION_CREATED',
                    message: 'No session_created event found',
                    impact: 'medium',
                });
            }
            // Check for conversation events
            const hasConversationEvents = rolloutData.events.some(e => e.payload.msg.type === 'turn_started' || e.payload.msg.type === 'turn_completed');
            if (!hasConversationEvents) {
                warnings.push({
                    code: 'NO_CONVERSATION_EVENTS',
                    message: 'No conversation turn events found',
                    impact: 'high',
                });
            }
        }
        // Run custom validation rules
        for (const rule of options.customValidation) {
            try {
                const ruleErrors = rule.validate(rolloutData);
                errors.push(...ruleErrors);
            }
            catch (error) {
                warnings.push({
                    code: 'VALIDATION_RULE_ERROR',
                    message: `Custom validation rule '${rule.name}' failed: ${error instanceof Error ? error.message : String(error)}`,
                    impact: 'medium',
                });
            }
        }
        // Estimate replay time
        const estimatedReplayTime = this.estimateReplayTime(eventCount);
        const result = {
            isValid: errors.length === 0,
            errors,
            warnings,
            eventCount,
            sessionId: rolloutData.session?.id,
            estimatedReplayTime,
        };
        log(options.logger, 'info', 'Rollout data validation completed', {
            isValid: result.isValid,
            errorCount: errors.length,
            warningCount: warnings.length,
            eventCount: result.eventCount,
        });
        return Promise.resolve(result);
    }
    /**
     * Get current resumption state
     */
    getCurrentState() {
        return this.currentState ? { ...this.currentState } : null;
    }
    /**
     * Validate a single event entry
     */
    validateEventEntry(event, index) {
        const errors = [];
        if (!event.timestamp) {
            errors.push({
                code: 'MISSING_EVENT_TIMESTAMP',
                message: 'Event timestamp is missing',
                eventIndex: index,
                severity: 'error',
            });
        }
        if (!event.payload) {
            errors.push({
                code: 'MISSING_EVENT_PAYLOAD',
                message: 'Event payload is missing',
                eventIndex: index,
                severity: 'error',
            });
        }
        else {
            if (!event.payload.msg) {
                errors.push({
                    code: 'MISSING_EVENT_MESSAGE',
                    message: 'Event message is missing',
                    eventIndex: index,
                    severity: 'error',
                });
            }
            else if (!event.payload.msg.type) {
                errors.push({
                    code: 'MISSING_EVENT_TYPE',
                    message: 'Event type is missing',
                    eventIndex: index,
                    severity: 'error',
                });
            }
        }
        return errors;
    }
    /**
     * Check if an event is a side-effect event
     */
    isSideEffectEvent(event) {
        return resumption_1.SIDE_EFFECT_EVENT_TYPES.includes(event.msg.type);
    }
    /**
     * Replay events with timeout protection
     */
    async replayEventsWithTimeout(client, events, options) {
        let successCount = 0;
        let failureCount = 0;
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new resumption_1.ResumptionTimeoutError(options.timeoutMs, successCount));
            }, options.timeoutMs);
        });
        const replayPromise = (async () => {
            for (let i = 0; i < events.length; i++) {
                const event = events[i];
                if (this.currentState) {
                    this.currentState.currentEventIndex = i;
                    this.currentState.lastActivity = new Date();
                }
                try {
                    await this.replayEvent(client, event, i, options);
                    successCount++;
                    log(options.logger, 'debug', 'Event replayed successfully', {
                        eventType: event.payload.msg.type,
                        eventIndex: i,
                        progress: `${i + 1}/${events.length}`,
                    });
                    this.emit('eventReplayed', {
                        event,
                        index: i,
                        totalEvents: events.length,
                    });
                }
                catch (error) {
                    failureCount++;
                    const resumptionError = new resumption_1.ResumptionError(`Failed to replay event ${i}: ${error instanceof Error ? error.message : String(error)}`, 'REPLAY_ERROR', i, true);
                    if (this.currentState) {
                        this.currentState.errors.push(resumptionError);
                    }
                    log(options.logger, 'warn', 'Event replay failed', {
                        eventType: event.payload.msg.type,
                        eventIndex: i,
                        error: error instanceof Error ? error.message : String(error),
                    });
                    this.emit('eventReplayFailed', {
                        event,
                        index: i,
                        error: resumptionError,
                    });
                    if (!options.continueOnError) {
                        throw resumptionError;
                    }
                }
                // Small delay to avoid overwhelming the system
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            return { successCount, failureCount };
        })();
        try {
            return await Promise.race([replayPromise, timeoutPromise]);
        }
        catch (error) {
            if (error instanceof resumption_1.ResumptionTimeoutError) {
                log(options.logger, 'error', 'Event replay timed out', {
                    timeoutMs: options.timeoutMs,
                    eventsCompleted: successCount,
                    totalEvents: events.length,
                });
            }
            throw error;
        }
    }
    /**
     * Replay a single event
     */
    replayEvent(_client, eventEntry, index, options) {
        const event = eventEntry.payload;
        // For most events, we just need to trigger the equivalent operation
        // This is a simplified replay - real implementation would need more sophisticated handling
        switch (event.msg.type) {
            case 'session_created':
            case 'session_configured':
                // These are automatically handled by client connection
                break;
            case 'turn_started':
                // Turns are handled when we send messages
                break;
            case 'turn_completed':
                // Completion is automatic
                break;
            case 'token_count':
            case 'notification':
            case 'task_started':
            case 'task_complete':
                // Information events - no action needed
                break;
            default:
                // For other events, log that we're skipping complex replay
                log(options.logger, 'debug', 'Skipping complex event replay', {
                    eventType: event.msg.type,
                    eventIndex: index,
                });
        }
        return Promise.resolve();
    }
    /**
     * Estimate replay time based on event count
     */
    estimateReplayTime(eventCount) {
        // Rough estimate: 10ms per event + base overhead
        return Math.max(1000, eventCount * 10 + 2000);
    }
}
exports.ConversationResumer = ConversationResumer;
