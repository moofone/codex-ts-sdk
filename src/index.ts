export { CodexClient } from './client/CodexClient';
export { CodexClientBuilder } from './client/CodexClientBuilder';
export { CodexClientPool } from './client/CodexClientPool';
export { ConversationManager } from './client/ConversationManager';

export type {
  CodexClientConfig,
  CreateConversationOptions,
  GetHistoryEntryRequestOptions,
  OverrideTurnContextOptions,
  ReviewRequestCamelCaseInput,
  ReviewRequestInput,
  ReviewRequestSnakeCaseInput,
  SendUserTurnOptions,
  SendMessageOptions,
  StatusResponse,
  AccountInfo,
  GetStatusOptions,
  RateLimitStatusSummary,
  RateLimitWindowStatus,
} from './types/options';

export type { CodexEvent } from './types/events';
export type {
  ApplyPatchApprovalRequestEventMessage,
  ConversationPathEventMessage,
  CustomPromptDefinition,
  EnteredReviewModeEventMessage,
  ExitedReviewModeEventMessage,
  GetHistoryEntryResponseEventMessage,
  HistoryEntryEvent,
  ExecApprovalRequestEventMessage,
  NotificationEventMessage,
  SessionConfiguredEventMessage,
  SessionCreatedEventMessage,
  ShutdownCompleteEventMessage,
  TaskCompleteEventMessage,
  TaskStartedEventMessage,
  TokenCountEventMessage,
  TurnContextEventMessage,
  TurnCompletedEventMessage,
  TurnStartedEventMessage,
  TurnUsageSummary,
  ListCustomPromptsResponseEventMessage,
  McpListToolsResponseEventMessage,
  McpToolDefinition,
  ReviewCodeLocation,
  ReviewFinding,
  ReviewLineRange,
  ReviewOutputEventMessage,
} from './client/CodexClient';
export type { SubmissionEnvelope, SubmissionOp, ReviewRequest } from './internal/submissions';
export type {
  AskForApproval,
  SandboxPolicy,
  ReasoningEffort,
  ReasoningSummary,
  InputItem,
  ReviewDecision,
} from './bindings';

// Persistence layer exports
export { RolloutRecorder } from './persistence/RolloutRecorder';
export { SessionSerializer } from './persistence/SessionSerializer';
export { ConversationResumer } from './persistence/ConversationResumer';

// Monitoring system exports
export { DataStorage } from './monitoring/DataStorage';
export { MockDataGenerator } from './monitoring/MockDataGenerator';

export { CodexError, CodexAuthError, CodexConnectionError, CodexSessionError } from './errors/CodexError';

// Conversation management types
export type {
  ConversationInfo,
  ConversationManagerConfig,
  CreateConversationOptions as ConversationCreateOptions,
} from './types/conversation';

export {
  ConversationNotFoundError,
  MaxConversationsExceededError,
  ConversationManagerError,
} from './types/conversation';

// Rollout and session types
export type {
  SessionMetadata,
  RolloutData,
  RolloutEventEntry,
  RolloutRecorderConfig,
} from './types/rollout';

// Resumption types
export type {
  ResumptionResult,
  ResumptionOptions,
  ResumptionState,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ValidationRule,
  ResumptionError,
  ResumptionTimeoutError,
} from './types/resumption';

// Monitoring types
export type {
  MonitoringData,
  DataPoint,
  DataCategory,
  MonitoringConfig,
  MonitoringStats,
  WebsiteExportFormat,
  SummaryStats,
  TimeSeriesPoint,
  TrendAnalysis,
  MonitoringScenario,
  MockDataGeneratorConfig,
} from './types/monitoring';

export type { CodexPlugin, CodexPluginInitializeContext } from './plugins/types';

export { resolveModelVariant, getSupportedEfforts } from './utils/models';
export type { ResolvedModelVariant } from './utils/models';
export type { RetryPolicy } from './utils/retry';
export { getCodexCliVersion } from './version';
export { loginWithApiKey } from './auth';
