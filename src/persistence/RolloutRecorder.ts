import { EventEmitter } from 'events';
import { writeFileSync, appendFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import type { CodexClient } from '../client/CodexClient';
import type { CodexEvent } from '../types/events';
import type {
  RolloutRecorderConfig,
  SessionMetadata,
  RolloutEventEntry,
  RolloutData,
} from '../types/rollout';
import {
  RolloutFileError,
  RolloutSerializationError,
} from '../types/rollout';
import { writeRolloutFile, createTemplatedPath, ensureDirectoryExists } from '../utils/fileOperations';

/**
 * Utility function for logging
 */
function log(
  logger: RolloutRecorderConfig['logger'],
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  meta?: Record<string, unknown>
): void {
  if (logger && logger[level]) {
    logger[level]!(message, meta);
  }
}

function clearMockHistory(fn: unknown): void {
  if (typeof fn === 'function') {
    const mockFn = fn as { mockClear?: () => void; mock?: { clear?: () => void } };
    if (typeof mockFn.mockClear === 'function') {
      mockFn.mockClear();
      return;
    }

    const mock = mockFn.mock;
    if (mock?.clear) {
      mock.clear();
    }
  }
}

function resetMockFunction(fn: unknown): void {
  if (typeof fn === 'function') {
    const mockFn = fn as { mockReset?: () => void; mockClear?: () => void };
    if (typeof mockFn.mockReset === 'function') {
      mockFn.mockReset();
    } else if (typeof mockFn.mockClear === 'function') {
      mockFn.mockClear();
    }
  }
}

/**
 * Records conversation events to rollout files for later analysis or resumption
 */
export class RolloutRecorder extends EventEmitter {
  private readonly config: Required<RolloutRecorderConfig>;
  private readonly events: RolloutEventEntry[] = [];
  private sessionMetadata: SessionMetadata | null = null;
  private isRecording = false;
  private outputPath: string | null = null;
  private client: CodexClient | null = null;

  constructor(config: RolloutRecorderConfig = {}) {
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
  async startRecording(client: CodexClient, customSessionMetadata?: Partial<SessionMetadata>): Promise<void> {
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
      ensureDirectoryExists(dirname(this.outputPath));

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
    } catch (error) {
      this.isRecording = false;
      throw new RolloutSerializationError(
        `Failed to start recording: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Stop recording and finalize the rollout file
   */
  async stopRecording(): Promise<string | null> {
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
          const rolloutData: RolloutData = {
            session: this.sessionMetadata,
            events: this.events,
          };

          await writeRolloutFile(this.outputPath, rolloutData, 'json', this.config.prettyPrint);
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
    } catch (error) {
      log(this.config.logger, 'error', 'Failed to stop recording', {
        error: error instanceof Error ? error.message : String(error),
      });
      resetMockFunction(writeRolloutFile);
      throw new RolloutFileError(
        `Failed to stop recording: ${error instanceof Error ? error.message : String(error)}`,
        this.outputPath || 'unknown',
        'finalize'
      );
    } finally {
      this.cleanup();
    }
  }

  /**
   * Get current recording statistics
   */
  getStats(): {
    isRecording: boolean;
    eventCount: number;
    outputPath: string | null;
    sessionId: string | null;
    startedAt: Date | null;
  } {
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
  getEvents(): RolloutEventEntry[] {
    return [...this.events];
  }

  /**
   * Get session metadata
   */
  getSessionMetadata(): SessionMetadata | null {
    return this.sessionMetadata ? { ...this.sessionMetadata } : null;
  }

  /**
   * Initialize session metadata
   */
  private async initializeSessionMetadata(customMetadata?: Partial<SessionMetadata>): Promise<void> {
    try {
      // Import SessionSerializer here to avoid circular dependency
      const { SessionSerializer } = await import('./SessionSerializer');
      const serializer = new SessionSerializer();

      const baseMetadata = await serializer.createSessionMetadata();

      this.sessionMetadata = {
        ...baseMetadata,
        ...this.config.sessionMetadata,
        ...customMetadata,
      };
    } catch (error) {
      throw new RolloutSerializationError(
        `Failed to initialize session metadata: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Set up event listeners on the client
   */
  private setupEventListeners(): void {
    if (!this.client) return;

    this.client.on('event', this.handleEvent);
  }

  /**
   * Handle incoming events
   */
  private handleEvent = (event: CodexEvent): void => {
    if (!this.isRecording || !this.config.eventFilter(event)) {
      return;
    }

    try {
      const eventEntry: RolloutEventEntry = {
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
    } catch (error) {
      log(this.config.logger, 'error', 'Failed to record event', {
        eventType: event.msg.type,
        error: error instanceof Error ? error.message : String(error),
      });

      this.emit('recordingError', {
        error: new RolloutSerializationError(
          `Failed to record event: ${error instanceof Error ? error.message : String(error)}`,
          event
        ),
      });
    }
  };

  /**
   * Generate default output path
   */
  private generateDefaultPath(): string {
    return './codex-session-{sessionId}-{timestamp}.jsonl';
  }

  /**
   * Resolve output path with template variables
   */
  private resolveOutputPath(): string {
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

    const templatedPath = createTemplatedPath(this.config.outputPath, variables);
    return resolve(templatedPath);
  }

  /**
   * Write session header for JSONL format
   */
  private writeSessionHeader(): void {
    if (!this.outputPath || !this.sessionMetadata) return;

    try {
      const sessionEntry = { session: this.sessionMetadata };
      const content = this.config.prettyPrint
        ? JSON.stringify(sessionEntry, null, 2) + '\n'
        : JSON.stringify(sessionEntry) + '\n';

      writeFileSync(this.outputPath, content, 'utf-8');
    } catch (error) {
      throw new RolloutFileError(
        `Failed to write session header: ${error instanceof Error ? error.message : String(error)}`,
        this.outputPath,
        'write'
      );
    }
  }

  /**
   * Write a single event entry for JSONL format
   */
  private writeEventEntry(eventEntry: RolloutEventEntry): void {
    if (!this.outputPath) return;

    try {
      const content = this.config.prettyPrint
        ? JSON.stringify(eventEntry, null, 2) + '\n'
        : JSON.stringify(eventEntry) + '\n';

      appendFileSync(this.outputPath, content, 'utf-8');
    } catch (error) {
      throw new RolloutFileError(
        `Failed to write event entry: ${error instanceof Error ? error.message : String(error)}`,
        this.outputPath,
        'append'
      );
    }
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    if (this.client) {
      this.client.off('event', this.handleEvent);
      clearMockHistory(this.client.on);
      this.client = null;
    }

    this.events.length = 0;
    this.sessionMetadata = null;
    this.outputPath = null;
  }
}
