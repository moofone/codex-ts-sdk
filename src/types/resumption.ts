import type { CodexEvent } from './events';
import type { RolloutData, RolloutEventEntry } from './rollout';

/**
 * Result of a conversation resumption operation
 */
export interface ResumptionResult {
  conversationId: string;
  eventsReplayed: number;
  totalEvents: number;
  resumedAt: Date;
  validationResult: ValidationResult;
  skippedEvents: number;
  errors: ResumptionError[];
}

/**
 * Options for conversation resumption
 */
export interface ResumptionOptions {
  /**
   * Whether to validate rollout data before resumption
   * @default true
   */
  validateData?: boolean;

  /**
   * Whether to skip side-effect operations during replay
   * @default true
   */
  skipSideEffects?: boolean;

  /**
   * Maximum time to wait for resumption (ms)
   * @default 30000
   */
  timeoutMs?: number;

  /**
   * Whether to continue on non-critical errors
   * @default true
   */
  continueOnError?: boolean;

  /**
   * Custom event filter for replay
   */
  eventFilter?: (event: CodexEvent, index: number) => boolean;

  /**
   * Custom validation rules
   */
  customValidation?: ValidationRule[];

  /**
   * Logger for resumption operations
   */
  logger?: {
    debug?: (message: string, meta?: Record<string, unknown>) => void;
    info?: (message: string, meta?: Record<string, unknown>) => void;
    warn?: (message: string, meta?: Record<string, unknown>) => void;
    error?: (message: string, meta?: Record<string, unknown>) => void;
  };
}

/**
 * Current state of a resumption operation
 */
export interface ResumptionState {
  conversationId: string;
  currentEventIndex: number;
  totalEvents: number;
  startedAt: Date;
  lastActivity: Date;
  status: 'validating' | 'replaying' | 'completed' | 'failed';
  errors: ResumptionError[];
}

/**
 * Initial history to replay during resumption
 */
export interface InitialHistory {
  sessionCreated?: boolean;
  conversationStarted?: boolean;
  firstUserMessage?: CodexEvent;
  modelConfiguration?: Record<string, unknown>;
}

/**
 * Result of rollout data validation
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationErrorData[];
  warnings: ValidationWarning[];
  eventCount: number;
  sessionId?: string;
  estimatedReplayTime?: number;
}

/**
 * Custom validation rule
 */
export interface ValidationRule {
  name: string;
  description: string;
  validate: (data: RolloutData) => ValidationErrorData[];
}

/**
 * Validation error details
 */
export interface ValidationErrorData {
  code: string;
  message: string;
  eventIndex?: number;
  severity: 'error' | 'warning';
  suggestions?: string[];
}

/**
 * Validation warning details
 */
export interface ValidationWarning {
  code: string;
  message: string;
  eventIndex?: number;
  impact: 'low' | 'medium' | 'high';
}

/**
 * Error during resumption operation
 */
export class ResumptionError extends Error {
  public readonly code: string;
  public readonly eventIndex?: number;
  public readonly recoverable: boolean;

  constructor(
    message: string,
    code: string,
    eventIndex?: number,
    recoverable: boolean = true
  ) {
    super(message);
    this.name = 'ResumptionError';
    this.code = code;
    this.eventIndex = eventIndex;
    this.recoverable = recoverable;
  }
}

/**
 * Error during validation operation
 */
export class ValidationError extends Error {
  public readonly errors: ValidationErrorData[];

  constructor(message: string, errors: ValidationErrorData[]) {
    super(message);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

/**
 * Error when resumption times out
 */
export class ResumptionTimeoutError extends Error {
  public readonly timeoutMs: number;
  public readonly eventsCompleted: number;

  constructor(timeoutMs: number, eventsCompleted: number) {
    super(`Resumption timed out after ${timeoutMs}ms (${eventsCompleted} events completed)`);
    this.name = 'ResumptionTimeoutError';
    this.timeoutMs = timeoutMs;
    this.eventsCompleted = eventsCompleted;
  }
}

/**
 * Events that should be skipped during side-effect-free replay
 */
export const SIDE_EFFECT_EVENT_TYPES = [
  'exec_approval_request',
  'patch_approval_request',
  'file_write',
  'command_execution',
  'shell_command',
  'git_operation',
  'network_request'
] as const;

/**
 * Events that are safe to replay without side effects
 */
export const SAFE_REPLAY_EVENT_TYPES = [
  'session_created',
  'session_configured',
  'turn_started',
  'turn_completed',
  'token_count',
  'notification',
  'task_started',
  'task_complete',
  'response_completed'
] as const;