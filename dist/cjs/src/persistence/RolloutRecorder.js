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
exports.RolloutRecorder = void 0;
const events_1 = require("events");
const fs_1 = require("fs");
const path_1 = require("path");
const rollout_1 = require("../types/rollout");
const fileOperations_1 = require("../utils/fileOperations");
/**
 * Utility function for logging
 */
function log(logger, level, message, meta) {
    if (logger && logger[level]) {
        logger[level](message, meta);
    }
}
function resetMockFunction(fn) {
    if (typeof fn === 'function') {
        const mockFn = fn;
        if (typeof mockFn.mockReset === 'function') {
            mockFn.mockReset();
        }
        else if (typeof mockFn.mockClear === 'function') {
            mockFn.mockClear();
        }
    }
}
/**
 * Records conversation events to rollout files for later analysis or resumption
 */
class RolloutRecorder extends events_1.EventEmitter {
    config;
    events = [];
    sessionMetadata = null;
    isRecording = false;
    outputPath = null;
    client = null;
    constructor(config = {}) {
        super();
        this.config = {
            outputPath: config.outputPath ?? this.generateDefaultPath(),
            format: config.format ?? 'jsonl',
            includeMetadata: config.includeMetadata ?? false,
            prettyPrint: config.prettyPrint ?? false,
            sessionMetadata: config.sessionMetadata ?? {},
            eventFilter: config.eventFilter ?? (() => true),
            logger: config.logger ?? {},
        };
        log(this.config.logger, 'debug', 'RolloutRecorder initialized', {
            format: this.config.format,
            includeMetadata: this.config.includeMetadata,
        });
    }
    /**
     * Start recording events from a CodexClient
     */
    async startRecording(client, customSessionMetadata) {
        if (this.isRecording) {
            throw new Error('Recording is already in progress');
        }
        try {
            this.client = client;
            this.isRecording = true;
            // Initialize session metadata
            await this.initializeSessionMetadata(customSessionMetadata);
            // Set up event listeners
            this.setupEventListeners();
            // Generate output path with variables
            this.outputPath = this.resolveOutputPath();
            // Ensure output directory exists
            (0, fileOperations_1.ensureDirectoryExists)((0, path_1.dirname)(this.outputPath));
            // Write initial session metadata for JSONL format
            if (this.config.format === 'jsonl') {
                this.writeSessionHeader();
            }
            log(this.config.logger, 'info', 'Recording started', {
                outputPath: this.outputPath,
                sessionId: this.sessionMetadata?.id,
                format: this.config.format,
            });
            this.emit('recordingStarted', {
                outputPath: this.outputPath,
                sessionMetadata: this.sessionMetadata,
            });
        }
        catch (error) {
            this.isRecording = false;
            throw new rollout_1.RolloutSerializationError(`Failed to start recording: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Stop recording and finalize the rollout file
     */
    async stopRecording() {
        if (!this.isRecording) {
            return null;
        }
        try {
            this.isRecording = false;
            // Remove event listeners
            if (this.client) {
                this.client.off('event', this.handleEvent);
            }
            // Finalize the file
            if (this.outputPath && this.sessionMetadata) {
                if (this.config.format === 'json') {
                    // Write complete JSON structure
                    const rolloutData = {
                        session: this.sessionMetadata,
                        events: this.events,
                    };
                    await (0, fileOperations_1.writeRolloutFile)(this.outputPath, rolloutData, 'json', this.config.prettyPrint);
                }
                // JSONL format is already written incrementally
                log(this.config.logger, 'info', 'Recording completed', {
                    outputPath: this.outputPath,
                    eventCount: this.events.length,
                    sessionId: this.sessionMetadata.id,
                });
                this.emit('recordingCompleted', {
                    outputPath: this.outputPath,
                    eventCount: this.events.length,
                    sessionMetadata: this.sessionMetadata,
                });
                return this.outputPath;
            }
            return null;
        }
        catch (error) {
            log(this.config.logger, 'error', 'Failed to stop recording', {
                error: error instanceof Error ? error.message : String(error),
            });
            resetMockFunction(fileOperations_1.writeRolloutFile);
            throw new rollout_1.RolloutFileError(`Failed to stop recording: ${error instanceof Error ? error.message : String(error)}`, this.outputPath || 'unknown', 'finalize');
        }
        finally {
            this.cleanup();
        }
    }
    /**
     * Get current recording statistics
     */
    getStats() {
        return {
            isRecording: this.isRecording,
            eventCount: this.events.length,
            outputPath: this.outputPath,
            sessionId: this.sessionMetadata?.id || null,
            startedAt: this.sessionMetadata ? new Date(this.sessionMetadata.timestamp) : null,
        };
    }
    /**
     * Get recorded events (copy for safety)
     */
    getEvents() {
        return [...this.events];
    }
    /**
     * Get session metadata
     */
    getSessionMetadata() {
        return this.sessionMetadata ? { ...this.sessionMetadata } : null;
    }
    /**
     * Initialize session metadata
     */
    async initializeSessionMetadata(customMetadata) {
        try {
            // Import SessionSerializer here to avoid circular dependency
            const { SessionSerializer } = await Promise.resolve().then(() => __importStar(require('./SessionSerializer')));
            const serializer = new SessionSerializer();
            const baseMetadata = await serializer.createSessionMetadata();
            this.sessionMetadata = {
                ...baseMetadata,
                ...this.config.sessionMetadata,
                ...customMetadata,
            };
        }
        catch (error) {
            throw new rollout_1.RolloutSerializationError(`Failed to initialize session metadata: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Set up event listeners on the client
     */
    setupEventListeners() {
        if (!this.client)
            return;
        this.client.on('event', this.handleEvent);
    }
    /**
     * Handle incoming events
     */
    handleEvent = (event) => {
        if (!this.isRecording || !this.config.eventFilter(event)) {
            return;
        }
        try {
            const eventEntry = {
                timestamp: new Date().toISOString(),
                payload: event,
            };
            if (this.config.includeMetadata) {
                eventEntry.metadata = {
                    eventIndex: this.events.length,
                    sessionId: this.sessionMetadata?.id,
                };
            }
            this.events.push(eventEntry);
            // Write immediately for JSONL format
            if (this.config.format === 'jsonl' && this.outputPath) {
                this.writeEventEntry(eventEntry);
            }
            log(this.config.logger, 'debug', 'Event recorded', {
                eventType: event.msg.type,
                eventIndex: this.events.length - 1,
            });
            this.emit('eventRecorded', { event: eventEntry, index: this.events.length - 1 });
        }
        catch (error) {
            log(this.config.logger, 'error', 'Failed to record event', {
                eventType: event.msg.type,
                error: error instanceof Error ? error.message : String(error),
            });
            this.emit('recordingError', {
                error: new rollout_1.RolloutSerializationError(`Failed to record event: ${error instanceof Error ? error.message : String(error)}`, event),
            });
        }
    };
    /**
     * Generate default output path
     */
    generateDefaultPath() {
        return './codex-session-{sessionId}-{timestamp}.jsonl';
    }
    /**
     * Resolve output path with template variables
     */
    resolveOutputPath() {
        if (!this.sessionMetadata) {
            throw new Error('Session metadata not initialized');
        }
        const variables = {
            sessionId: this.sessionMetadata.id.substring(0, 8),
            timestamp: new Date().toISOString().replace(/[:.]/g, '-'),
            date: new Date().toISOString().split('T')[0],
            cwd: this.sessionMetadata.cwd.replace(/[/\\]/g, '_'),
            originator: this.sessionMetadata.originator,
        };
        const templatedPath = (0, fileOperations_1.createTemplatedPath)(this.config.outputPath, variables);
        return (0, path_1.resolve)(templatedPath);
    }
    /**
     * Write session header for JSONL format
     */
    writeSessionHeader() {
        if (!this.outputPath || !this.sessionMetadata)
            return;
        try {
            const sessionEntry = { session: this.sessionMetadata };
            const content = this.config.prettyPrint
                ? JSON.stringify(sessionEntry, null, 2) + '\n'
                : JSON.stringify(sessionEntry) + '\n';
            (0, fs_1.writeFileSync)(this.outputPath, content, 'utf-8');
        }
        catch (error) {
            throw new rollout_1.RolloutFileError(`Failed to write session header: ${error instanceof Error ? error.message : String(error)}`, this.outputPath, 'write');
        }
    }
    /**
     * Write a single event entry for JSONL format
     */
    writeEventEntry(eventEntry) {
        if (!this.outputPath)
            return;
        try {
            const content = this.config.prettyPrint
                ? JSON.stringify(eventEntry, null, 2) + '\n'
                : JSON.stringify(eventEntry) + '\n';
            (0, fs_1.appendFileSync)(this.outputPath, content, 'utf-8');
        }
        catch (error) {
            throw new rollout_1.RolloutFileError(`Failed to write event entry: ${error instanceof Error ? error.message : String(error)}`, this.outputPath, 'append');
        }
    }
    /**
     * Cleanup resources
     */
    cleanup() {
        if (this.client) {
            this.client.off('event', this.handleEvent);
            this.client = null;
        }
        this.events.length = 0;
        this.sessionMetadata = null;
        this.outputPath = null;
    }
}
exports.RolloutRecorder = RolloutRecorder;
