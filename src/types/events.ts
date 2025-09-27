import type { AskForApproval } from '../bindings/AskForApproval';
import type { FileChange } from '../bindings/FileChange';
import type { RateLimitSnapshot } from '../bindings/RateLimitSnapshot';
import type { ReasoningEffort } from '../bindings/ReasoningEffort';
import type { ReasoningSummary } from '../bindings/ReasoningSummary';
import type { SandboxPolicy } from '../bindings/SandboxPolicy';
import type { TokenUsageInfo } from '../bindings/TokenUsageInfo';
import type { ReviewRequest } from '../internal/submissions';

export interface CodexEventMessage {
  type: string;
  [key: string]: unknown;
}

export interface CodexEvent {
  id: string;
  msg: CodexEventMessage;
}

export interface TokenCountEventMessage extends CodexEventMessage {
  type: 'token_count';
  info?: TokenUsageInfo;
  rate_limits?: RateLimitSnapshot;
}

export interface TaskStartedEventMessage extends CodexEventMessage {
  type: 'task_started';
  model_context_window?: number;
}

export interface TaskCompleteEventMessage extends CodexEventMessage {
  type: 'task_complete';
  last_agent_message?: string;
}

export interface SessionCreatedEventMessage extends CodexEventMessage {
  type: 'session.created';
  session_id: string;
}

export interface TurnStartedEventMessage extends CodexEventMessage {
  type: 'turn.started';
}

export interface TurnUsageSummary {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
}

export interface TurnCompletedEventMessage extends CodexEventMessage {
  type: 'turn.completed';
  usage: TurnUsageSummary;
}

export interface SessionConfiguredEventMessage extends CodexEventMessage {
  type: 'session_configured';
  session_id: string;
  model: string;
  reasoning_effort?: ReasoningEffort;
  history_log_id: number;
  history_entry_count: number;
  initial_messages?: CodexEventMessage[];
  rollout_path: string;
}

export interface ExecApprovalRequestEventMessage extends CodexEventMessage {
  type: 'exec_approval_request';
  call_id: string;
  command: string[];
  cwd: string;
  reason?: string;
  id?: string;
}

export interface ApplyPatchApprovalRequestEventMessage extends CodexEventMessage {
  type: 'apply_patch_approval_request';
  call_id: string;
  changes: Record<string, FileChange>;
  reason?: string;
  grant_root?: string;
  id?: string;
}

export interface NotificationEventMessage extends CodexEventMessage {
  type: 'notification';
  content?: string;
}

export interface ConversationPathEventMessage extends CodexEventMessage {
  type: 'conversation_path';
  conversation_id: string;
  path: string;
}

export interface ShutdownCompleteEventMessage extends CodexEventMessage {
  type: 'shutdown_complete';
}

export interface TurnContextEventMessage extends CodexEventMessage {
  type: 'turn_context';
  cwd: string;
  approval_policy: AskForApproval;
  sandbox_policy: SandboxPolicy;
  model: string;
  effort?: ReasoningEffort | null;
  summary: ReasoningSummary;
}

export interface HistoryEntryEvent {
  conversation_id: string;
  ts: number;
  text: string;
}

export interface GetHistoryEntryResponseEventMessage extends CodexEventMessage {
  type: 'get_history_entry_response';
  offset: number;
  log_id: number;
  entry?: HistoryEntryEvent;
}

export type McpToolDefinition = Record<string, unknown>;

export interface McpListToolsResponseEventMessage extends CodexEventMessage {
  type: 'mcp_list_tools_response';
  tools: Record<string, McpToolDefinition>;
}

export interface CustomPromptDefinition {
  name: string;
  path: string;
  content: string;
}

export interface ListCustomPromptsResponseEventMessage extends CodexEventMessage {
  type: 'list_custom_prompts_response';
  custom_prompts: CustomPromptDefinition[];
}

export interface ReviewLineRange {
  start: number;
  end: number;
}

export interface ReviewCodeLocation {
  absolute_file_path: string;
  line_range: ReviewLineRange;
}

export interface ReviewFinding {
  title: string;
  body: string;
  confidence_score: number;
  priority: number;
  code_location: ReviewCodeLocation;
}

export interface ReviewOutputEventMessage {
  findings: ReviewFinding[];
  overall_correctness: string;
  overall_explanation: string;
  overall_confidence_score: number;
}

export interface EnteredReviewModeEventMessage extends ReviewRequest, CodexEventMessage {
  type: 'entered_review_mode';
}

export interface ExitedReviewModeEventMessage extends CodexEventMessage {
  type: 'exited_review_mode';
  review_output?: ReviewOutputEventMessage;
}
